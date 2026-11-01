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

const SOURCES = ['DROP', 'EMAIL', 'MICROSOFT'];
const JOB = 'rfq.quoteRead';
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const PROMPT = 'You read lighting rep and manufacturer quotes for a lighting design and supply company. You copy what the quote says into JSON. You never work out, correct or invent a value.';
const INSTRUCTIONS = `Read this quote and answer with one JSON object and nothing else:
{
  "bidderName": "the company that issued the quote",
  "quoteNumber": "", "quoteDate": "YYYY-MM-DD", "expiresAt": "YYYY-MM-DD",
  "lines": [{ "typeTag": "", "description": "", "mfr": "", "catalog": "", "qty": 0, "uom": "EA", "unitPrice": 0, "extPrice": 0 }],
  "totals": { "FIXTURES": 0, "CONTROLS": 0, "FREIGHT": 0, "WAREHOUSING": 0, "SPARES": 0, "TAX": 0, "GRAND": 0 },
  "notes": "lead times, exclusions and terms as written"
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
- Shipping, freight and tax go in totals, not in lines.
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
      max_tokens: answerBudget(JOB, 12000),
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
  lines: { orderBy: { sortOrder: 'asc' }, include: { links: { select: { rfqLineId: true } } } },
  rfq: { select: { id: true, number: true, toName: true } },
};

export async function rfqLinesFor(projectId, rfqId) {
  return prisma.rfqLine.findMany({
    where: { rfq: { projectId, ...(rfqId ? { id: rfqId } : {}) } },
    orderBy: [{ rfq: { number: 'desc' } }, { sortOrder: 'asc' }],
    include: { rfq: { select: { number: true, toName: true } }, _count: { select: { quoteLinks: true } } },
  });
}

const asDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? new Date(`${v}T12:00:00.000Z`) : null);

/**
 * Save a checked quote. Lines matched at 75% or better price their RFQ line
 * straight away; the rest stay open. No RFQ yet is fine: the quote stays on the
 * project with its lines open until there is one to pick from.
 * Returns { quote, options, rfqLines } or { error }.
 */
export async function saveQuote({ projectId, user, rfqId = null, fileId = null, source = 'DROP', fileName, quoteNumber, fromName, fromEmail, quoteDate, total, lines: checked }) {
  // Same cleaning as Bid Leveling: tags read again here.
  const { lines } = cleanCheckedLines(checked || [], { repQuote: true });
  if (!lines.length) {
    return { error: 'No lines were found in that quote. Nothing was saved. Add a line with a type or part number, or paste the table. (RFQ_QUOTE_EMPTY)' };
  }
  if (rfqId && !(await prisma.rfq.findFirst({ where: { id: rfqId, projectId }, select: { id: true } }))) {
    return { error: 'That RFQ is not on this project. Nothing was saved. Reload the page and pick again. (RFQ_QUOTE_BAD_RFQ)' };
  }
  if (fileId && !(await prisma.projectFile.findFirst({ where: { id: fileId, projectId }, select: { id: true } }))) {
    return { error: 'That quote file is not on this project. Nothing was saved. Drop it in again. (RFQ_QUOTE_BAD_FILE)' };
  }
  const rfqLines = await rfqLinesFor(projectId, rfqId);
  const quoteLines = lines.map((l) => ({
    typeTag: String(l.typeTag || ''), catalog: String(l.catalog || ''), manufacturer: String(l.mfr || ''),
    description: String(l.description || ''), qty: l.qty == null ? null : Number(l.qty), unitPrice: l.unitPrice == null ? null : Number(l.unitPrice),
  }));
  const matches = matchQuote(quoteLines, rfqLines.map((r) => ({ id: r.id, typeCode: r.typeCode, partNumber: r.partNumber, manufacturer: r.manufacturer, qty: r.qty })));

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
    const rfqOf = new Map(rfqLines.map((r) => [r.id, r.rfqId]));
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
    rfqLines: await rfqLinesFor(projectId),
  };
}
