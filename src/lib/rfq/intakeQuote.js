// How a rep quote gets into a project (Mike 10-30, 0148). Everything that brings
// a quote in comes through here, so a forwarded email or the Microsoft connection
// only has to store the attachment, call readStoredQuote, and save with its own
// source. Today the only source is DROP, from the RFQ tab.
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, answerBudget, textFrom, warnIfTruncated } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection, ATTACHED_DOCUMENT_RULE } from '@/lib/agent/untrusted';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
import { jobError } from '@/lib/parkedJob';
import { logHistory } from '@/lib/recordHistory';
import { cleanCheckedLines } from '@/lib/bidLeveling/readQuote';
import { toNumber } from '@/lib/matrixImport/readMatrix';
import { matchQuote } from '@/lib/rfq/match';
import { linkRows } from '@/lib/rfq/actions';
import { parseQuoteReply, quoteReadFailure } from '@/lib/rfq/quoteReply';
import { currentLineIds, familyOf, lineKey } from '@/lib/rfq/compare';
import { currentQuotes, historyRates, jobFreight, quoteSummary, readFreight } from '@/lib/rfq/freight';
import { quoteFields, rowLead } from '@/lib/rfq/quoteTerms';
import { normName } from '@/lib/rfq/format';
import { getStartingFreightPct } from '@/lib/rfq/freightStart';
import { matrixFooter } from '@/lib/bidMatrixTotals';
import { cents, sumCents } from '@/lib/money';

const SOURCES = ['DROP', 'EMAIL', 'MICROSOFT'];
const JOB = 'rfq.quoteRead';
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const PROMPT = 'You read lighting rep and manufacturer quotes for a lighting design and supply company. You copy what the quote says into JSON. You never work out, correct or invent a value.';
const INSTRUCTIONS = `Read this quote and answer with one JSON object and nothing else:
{
  "bidderName": "the company that issued the quote",
  "quoteNumber": "", "quoteDate": "YYYY-MM-DD", "expiresAt": "YYYY-MM-DD",
  "paymentTerms": "", "fob": "", "revisionNote": "", "leadTime": "",
  "lines": [{ "typeTag": "", "description": "", "mfr": "", "catalog": "", "qty": 0, "uom": "EA", "unitPrice": 0, "extPrice": 0, "leadTime": "", "stock": "", "discontinued": false }],
  "totals": { "FIXTURES": 0, "CONTROLS": 0, "FREIGHT": 0, "SPARES": 0, "GRAND": 0 },
  "freight": [{ "brand": "", "status": "ALLOWED", "amount": 0, "wording": "" }],
  "terms": [{ "kind": "TARIFF", "text": "" }],
  "notes": "every note, exclusion and term, as written"
}
Rules:
- typeTag is the fixture type on the job, such as D1 or W9. It may sit in a Type, Comments or Notes column, or in words like "TYPE C1".
- A row naming several types keeps one row, with the types listed in typeTag, such as "C2, C4, W9".
- Keep every part row, even several rows under one type, such as a housing, a trim and an optic.
- Keep a row with a part number and no type. Leave its typeTag empty.
- catalog is the part or catalog number. uom is EA, LF or LOT.
- A part number that wraps onto a second line keeps its dashes: STR-48-MS- then BB is STR-48-MS-BB.
- quoteNumber is the number the bidder gave this quote. Our own RFQ numbers, such as RFQ1888, are not quote numbers. Leave it empty if the bidder gave none.
- A row marked BUDGET ITEM, not included or with no price keeps its row, with unitPrice and extPrice null, never 0.
- A sentence, fee notice or legal note is not a line. Put it in notes.
- Shipping and freight go in freight and totals, not in lines.
- leadTime as written. The top one covers the whole quote; a line's covers that row only.
- stock as written, such as "37 in stock" or "25 on 3/9".
- discontinued is true only when the row says so.
- freight: one row for each brand the quote treats on its own, plus one with an empty brand for the whole quote. status is STATED with a dollar amount, ALLOWED when freight is allowed, included or no charge, NOT_INCLUDED when it is extra or to be determined. wording is the quote's own words. Leave the list empty if the quote says nothing about freight.
- terms: kind is one of TARIFF, NO_PARTIALS, DEPOSIT, OVERSIZE_FREIGHT, SINGLE_RELEASE, ACCESSORIAL. text is the quote's own words.
- fob is the FOB point. paymentTerms is wording such as Net 30. revisionNote is the quote's own note on what changed.
- Use null or leave out anything the quote does not show. Never guess. Numbers carry no currency signs or commas.`;

async function sheetText(buffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return wb.SheetNames.map((name) => `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`).join('\n\n');
}

/**
 * Read a quote already stored on the project into lines a person will check.
 * Throws jobError with a plain message. Nothing is saved here.
 */
export async function readStoredQuote({ fileId, projectId, user }) {
  const file = await prisma.projectFile.findFirst({ where: { id: String(fileId || ''), projectId } });
  if (!file) throw jobError(404, { ok: false, message: 'That quote file is not on this project any more, so nothing was read. Drop it in again. (RFQ_READ_NO_FILE)' });

  const name = file.originalName || 'quote';
  const isPdf = /\.pdf$/i.test(name);
  const isSheet = /\.(xlsx|xlsm|xls|csv)$/i.test(name);
  if (!isPdf && !isSheet) throw jobError(415, { ok: false, message: 'We read PDF, Excel and CSV quotes. This file is none of those, so nothing was read. (RFQ_READ_TYPE)' });

  const buffer = await getProjectFileBuffer(file.storedPath);
  if (!buffer) throw jobError(404, { ok: false, message: 'We could not find the stored copy of this file, so nothing was read. Drop it in again. (RFQ_READ_NO_COPY)' });

  // A PDF goes as a PDF: the AI sees the columns, which plain text loses.
  let quoteText = null;
  if (isSheet) {
    try { quoteText = await sheetText(buffer); } catch { throw jobError(422, { ok: false, message: 'We could not open that spreadsheet, so nothing was read. Save it again as .xlsx and drop it in once more. (RFQ_READ_SHEET)' }); }
  } else if (buffer.length > MAX_PDF_BYTES) {
    quoteText = file.textContent || null;
    if (!quoteText) throw jobError(413, { ok: false, message: 'This PDF is too large to read and has no text in it. The file is saved on the project. Press Type it by hand. (RFQ_READ_SIZE)' });
  }

  const sealed = quoteText ? buildUntrustedPrompt({ instructions: INSTRUCTIONS, system: PROMPT, documents: [{ text: quoteText, descriptor: name, maxChars: 60000 }] }) : null;
  warnOnInjection(JOB, projectId, sealed);
  const content = sealed
    ? [{ type: 'text', text: sealed.content }]
    : [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }, { type: 'text', text: INSTRUCTIONS }];

  let message;
  try {
    const client = wrapClient(new Anthropic({ apiKey: await getAnthropicKey() }), JOB, { projectId, userId: user.id });
    // Streamed: the SDK refuses a plain call with an answer budget this large.
    message = await client.messages.stream({
      ...modelParams(JOB),
      max_tokens: answerBudget(JOB, 16000),
      system: sealed ? sealed.system : `${PROMPT}\n\n${ATTACHED_DOCUMENT_RULE}`,
      messages: [{ role: 'user', content }],
    }).finalMessage();
  } catch (e) {
    console.error('[rfq quote read]', e?.status, e?.message);
    throw jobError(502, { ok: false, message: quoteReadFailure(e) });
  }
  if (warnIfTruncated(message, JOB)) {
    throw jobError(422, { ok: false, message: 'This quote is too long to read in one pass. The file is saved on the project. Press Type it by hand, or paste the table in the box below. (RFQ_READ_LONG)' });
  }
  const read = parseQuoteReply(textFrom(message));
  if (!read.ok) throw jobError(422, read);
  return read;
}

export const quoteInclude = {
  lines: { orderBy: { sortOrder: 'asc' }, include: { links: { select: { rfqLineId: true, rfqLine: { select: { manufacturer: true, rfqId: true, peerReviewItemId: true, typeCode: true } } } } } },
  rfq: { select: { id: true, number: true, familyNumber: true, version: true, toName: true } },
  freight: { orderBy: { createdAt: 'asc' } },
  terms: { orderBy: { createdAt: 'asc' } },
};

/** Every line ever sent on the job; current marks the ones that stand today, so a new quote matches only those. */
export async function rfqLinesFor(projectId) {
  const [rows, rfqs] = await Promise.all([
    prisma.rfqLine.findMany({
      where: { rfq: { projectId } },
      orderBy: [{ rfq: { number: 'desc' } }, { sortOrder: 'asc' }],
      include: { rfq: { select: { number: true, familyNumber: true, version: true, toName: true } }, _count: { select: { quoteLinks: true } } },
    }),
    prisma.rfq.findMany({ where: { projectId }, include: { lines: true, round: { select: { number: true } } } }),
  ]);
  const current = currentLineIds(rfqs.map((r) => ({ ...r, roundNumber: r.round?.number ?? null })));
  return rows.map((r) => ({ ...r, current: current.has(r.id) }));
}

/** The quote's own words, kept for search and the rule reads. A failed read only leaves them blank. */
async function storedText(file) {
  if (!file) return null;
  if (file.textContent) return file.textContent;
  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.originalName || '')) return null;
  try {
    const buffer = await getProjectFileBuffer(file.storedPath);
    return buffer ? await sheetText(buffer) : null;
  } catch {
    return null;
  }
}

const asDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? new Date(`${v}T12:00:00.000Z`) : null);

/**
 * Save a checked quote. Lines matched at 75% or better price their RFQ line
 * straight away; the rest stay open. No RFQ yet is fine: the quote stays on the
 * project with its lines open until there is one to pick from.
 * Returns { quote, options } or { error }.
 */
export async function saveQuote({ projectId, user, rfqId = null, fileId = null, source = 'DROP', fileName, quoteNumber, fromName, fromEmail, quoteDate, total, expiresAt, paymentTerms, fob, revisionNote, leadTime, notes, totals, freight, terms, lines: checked }) {
  // Same cleaning as Bid Leveling: tags read again here.
  const { lines } = cleanCheckedLines(checked || [], { repQuote: true });
  if (!lines.length) {
    return { error: 'No lines were found in that quote. Nothing was saved. Add a line with a type or part number, or paste the table. (RFQ_QUOTE_EMPTY)' };
  }
  const rfq = rfqId ? await prisma.rfq.findFirst({ where: { id: rfqId, projectId }, select: { id: true, number: true, familyNumber: true } }) : null;
  if (rfqId && !rfq) {
    return { error: 'That RFQ is not on this project. Nothing was saved. Reload the page and pick again. (RFQ_QUOTE_BAD_RFQ)' };
  }
  const file = fileId ? await prisma.projectFile.findFirst({ where: { id: fileId, projectId } }) : null;
  if (fileId && !file) {
    return { error: 'That quote file is not on this project. Nothing was saved. Drop it in again. (RFQ_QUOTE_BAD_FILE)' };
  }
  const fullText = (await storedText(file))?.slice(0, 200000) || null;
  const notesText = String(notes ?? '').trim().slice(0, 20000) || null;
  const words = [notesText, fullText].filter(Boolean).join('\n');
  const fields = quoteFields({ quoteDate, expiresAt, paymentTerms, fob, revisionNote, leadTime, terms, words });

  // A quote prices what stands today. The whole family stays open when none of
  // it does, as on a loaded job.
  const all = await rfqLinesFor(projectId);
  const family = rfq ? all.filter((r) => familyOf(r.rfq) === familyOf(rfq)) : all;
  const pool = family.some((r) => r.current) ? family.filter((r) => r.current) : family;
  const quoteLines = lines.map((l) => ({
    typeTag: String(l.typeTag || ''), catalog: String(l.catalog || ''), manufacturer: String(l.mfr || ''),
    description: String(l.description || ''), qty: l.qty == null ? null : Number(l.qty), unitPrice: l.unitPrice == null ? null : Number(l.unitPrice),
    extPrice: l.extPrice ?? null, uom: l.uom || null, discontinued: !!l.discontinued, ...rowLead(l, fields.leadTime),
  }));
  const matches = matchQuote(quoteLines, pool.map((r) => ({ id: r.id, typeCode: r.typeCode, partNumber: r.partNumber, manufacturer: r.manufacturer, qty: r.qty })));

  const freightRead = readFreight({ rows: freight || [], total: toNumber(totals?.FREIGHT), text: words });
  const brandIds = new Map((await prisma.manufacturer.findMany({ select: { id: true, name: true } })).map((m) => [normName(m.name), m.id]));

  const quote = await prisma.$transaction(async (tx) => {
    const q = await tx.rfqQuote.create({
      data: {
        projectId, rfqId: rfqId || null, fileName: String(fileName || 'Pasted quote'), quoteNumber: quoteNumber || null,
        uploadedById: user.id, uploadedByName: user.name || user.email,
        fileId: fileId || null,
        source: SOURCES.includes(source) ? source : 'DROP',
        fromName: String(fromName || '').trim() || null,
        fromEmail: String(fromEmail || '').trim() || null,
        quoteDate: asDate(quoteDate),
        total: toNumber(total),
        expiresAt: asDate(fields.expiresAt),
        paymentTerms: fields.paymentTerms || null,
        fobPoint: fields.fobPoint || null,
        revisionNote: fields.revisionNote || null,
        leadTime: fields.leadTime || null,
        productTotal: toNumber(totals?.FIXTURES),
        controlsTotal: toNumber(totals?.CONTROLS),
        sparesTotal: toNumber(totals?.SPARES),
        freightTotal: toNumber(totals?.FREIGHT),
        notesText,
        fullText,
        freight: { create: freightRead.map((f) => ({ ...f, manufacturerId: brandIds.get(normName(f.manufacturer)) || null })) },
        terms: { create: fields.terms },
        lines: {
          create: quoteLines.map((l, i) => ({
            ...l, sortOrder: i, confidence: matches[i].confidence, status: matches[i].status,
          })),
        },
      },
    });
    const rows = await tx.rfqQuoteLine.findMany({ where: { quoteId: q.id }, select: { id: true, sortOrder: true } });
    const links = rows.flatMap((row) => matches[row.sortOrder].rfqLineIds.map((rfqLineId) => ({ quoteLineId: row.id, rfqLineId })));
    if (links.length) await linkRows(tx, { quoteId: q.id, links, source: 'AUTO', user });
    // One summary row on each RFQ the quote touched (priceLine logs each price).
    const rfqOf = new Map(all.map((r) => [r.id, r.rfqId]));
    const touched = new Set(rfqId ? [rfqId] : matches.flatMap((m) => m.rfqLineIds.map((id) => rfqOf.get(id))).filter(Boolean));
    const auto = matches.filter((m) => m.status === 'AUTO').length;
    for (const id of touched) {
      await logHistory({ entityType: 'RFQ', entityId: id, action: 'QUOTE', user, db: tx, note: `Quote ${q.fileName} brought in: ${auto} of ${quoteLines.length} lines matched at 75% or better` });
    }
    return q;
  }, { timeout: 30000 });

  return {
    quote: await prisma.rfqQuote.findUnique({ where: { id: quote.id }, include: quoteInclude }),
    options: Object.fromEntries((await prisma.rfqQuoteLine.findMany({ where: { quoteId: quote.id }, select: { id: true, sortOrder: true } })).map((l) => [l.id, matches[l.sortOrder].options])),
  };
}

/** What a quote summary needs beyond the quote: FFA minimums, brand history from real dollars, the starting percent. */
async function freightContext() {
  const [brands, stated, startPct] = await Promise.all([
    prisma.manufacturer.findMany({ where: { ffa: { gt: 0 } }, select: { name: true, ffa: true } }),
    prisma.rfqQuoteFreight.findMany({
      where: { status: 'STATED', amount: { gt: 0 } },
      select: {
        manufacturer: true, amount: true,
        quote: { select: { lines: { select: { qty: true, unitPrice: true, extPrice: true, manufacturer: true, status: true, links: { select: { rfqLine: { select: { manufacturer: true } } } } } } } },
      },
    }),
    getStartingFreightPct(),
  ]);
  return {
    ffaByName: Object.fromEntries(brands.map((m) => [normName(m.name), m.ffa])),
    historyByName: historyRates(stated.map((f) => ({ manufacturer: f.manufacturer, amount: f.amount, lines: f.quote.lines }))),
    startPct,
  };
}

/** Everything the Quotes received screen needs. The full quote text stays on the server. */
export async function quotesFor(projectId) {
  const [saved, rfqLines, ctx, project] = await Promise.all([
    prisma.rfqQuote.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, include: quoteInclude }),
    rfqLinesFor(projectId),
    freightContext(),
    prisma.project.findUnique({ where: { id: projectId }, select: { projectData: true, peerReviewItems: { select: { totalSavings: true } } } }),
  ]);
  const quotes = saved.map(({ fullText, ...q }) => ({ ...q, summary: quoteSummary(q, { rfqLines, ...ctx }) }));
  const pd = project?.projectData;
  const budgetFreight = project?.peerReviewItems.length
    ? matrixFooter(sumCents(project.peerReviewItems.map((i) => i.totalSavings)), 0, {
      freightPct: pd?.freightPct ?? 0.06, warehousingPct: pd?.warehousingPct ?? 0.03, salesTaxPct: pd?.salesTaxPct ?? 0,
      freightOverride: pd?.freightOverride, warehousingOverride: pd?.warehousingOverride,
    }).freightAmt
    : null;
  const keys = new Set(rfqLines.filter((r) => r.current).map(lineKey));
  return { quotes, rfqLines, rollup: jobFreight(currentQuotes(quotes, keys).map((q) => q.summary), budgetFreight) };
}

/**
 * A person's own freight figure on a quote, or their answer when the quote
 * contradicts itself. Typing on a brand the whole quote covers gives that brand
 * its own row, so the others stay as read. Returns { error } or {}.
 */
export async function setQuoteFreight({ projectId, quoteId, brand = '', typedAmount, status, user }) {
  const quote = await prisma.rfqQuote.findFirst({ where: { id: quoteId, projectId }, include: { freight: true } });
  if (!quote) return { error: 'That quote is not on this job any more. Nothing was changed. Reload the page. (RFQ_QUOTE_NOT_FOUND)' };
  const data = {};
  if (typedAmount !== undefined) {
    const blank = typedAmount === null || String(typedAmount).trim() === '';
    const typed = blank ? null : toNumber(typedAmount);
    if (!blank && (typed == null || typed < 0)) return { error: 'Freight must be a dollar amount of 0 or more. Nothing was changed. Type it again. (RFQ_QUOTE_BAD_FREIGHT)' };
    data.typedAmount = blank ? null : cents(typed);
  }
  if (status !== undefined) {
    if (!['ALLOWED', 'NOT_INCLUDED'].includes(status)) return { error: 'Pick Allowed or Not included. Nothing was changed. (RFQ_QUOTE_BAD_FREIGHT)' };
    data.status = status;
  }
  const name = String(brand || '');
  const own = quote.freight.find((f) => normName(f.manufacturer) === normName(name));
  const whole = quote.freight.find((f) => !f.manufacturer);
  if (own) await prisma.rfqQuoteFreight.update({ where: { id: own.id }, data });
  else await prisma.rfqQuoteFreight.create({ data: { quoteId, manufacturer: name, status: whole?.status || 'SILENT', wording: whole?.wording ?? null, ...data } });
  const label = name || 'whole quote';
  await logHistory({
    entityType: 'RFQ_QUOTE', entityId: quote.id, action: 'UPDATE', user,
    changes: {
      ...('typedAmount' in data ? { [`Typed freight, ${label}`]: [own?.typedAmount ?? null, data.typedAmount] } : {}),
      ...(data.status ? { [`Freight, ${label}`]: [own?.status ?? whole?.status ?? null, data.status] } : {}),
    },
  });
  return {};
}
