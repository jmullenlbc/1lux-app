import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { matchQuote } from '@/lib/rfq/match';
import { priceLine } from '@/lib/rfq/actions';
import { cleanCheckedLines } from '@/lib/bidLeveling/readQuote';
import { logHistory } from '@/lib/recordHistory';

// The RFQ received screen (0144). The browser reads the rep's Excel quote or
// pasted table with the Bid Leveling quote reader and posts the lines here.
// Lines matched at 75% or better are priced straight away; the rest wait for
// someone to pick the RFQ line they belong to.

const quoteInclude = { lines: { orderBy: { sortOrder: 'asc' } }, rfq: { select: { id: true, number: true, toName: true } } };

async function rfqLinesFor(projectId, rfqId) {
  return prisma.rfqLine.findMany({
    where: { rfq: { projectId, ...(rfqId ? { id: rfqId } : {}) } },
    orderBy: [{ rfq: { number: 'desc' } }, { sortOrder: 'asc' }],
    include: { rfq: { select: { number: true, toName: true } } },
  });
}

// GET  quotes brought in on this project, newest first, and every RFQ line they can be matched to.
export async function GET(request, { params }) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const [quotes, rfqLines] = await Promise.all([
    prisma.rfqQuote.findMany({ where: { projectId: params.id }, orderBy: { createdAt: 'desc' }, include: quoteInclude }),
    rfqLinesFor(params.id),
  ]);
  return NextResponse.json({ quotes, rfqLines });
}

// POST { rfqId?, fileName, quoteNumber?, lines: [{ typeTag, catalog, mfr, qty, unitPrice, description }] }
export async function POST(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const body = await request.json();
  // Same cleaning as Bid Leveling: tags read again here, lines with no type dropped.
  const { lines } = cleanCheckedLines(body.lines || []);
  if (!lines.length) {
    return NextResponse.json({ error: 'No priced lines were found in that quote. Nothing was saved. Check the file has a type and a unit price on each line, or paste the table. (RFQ_QUOTE_EMPTY)' }, { status: 400 });
  }
  const rfqLines = await rfqLinesFor(params.id, body.rfqId || null);
  if (!rfqLines.length) {
    return NextResponse.json({ error: 'There is no sent RFQ on this project to match the quote to. Nothing was saved. Send the RFQ first. (RFQ_QUOTE_NO_RFQ)' }, { status: 400 });
  }
  const quoteLines = lines.map((l) => ({
    typeTag: String(l.typeTag || ''), catalog: String(l.catalog || ''), manufacturer: String(l.mfr || l.manufacturer || ''),
    description: String(l.description || ''), qty: l.qty == null ? null : Number(l.qty), unitPrice: l.unitPrice == null ? null : Number(l.unitPrice),
  }));
  const matches = matchQuote(quoteLines, rfqLines.map((r) => ({ id: r.id, typeCode: r.typeCode, partNumber: r.partNumber, manufacturer: r.manufacturer, qty: r.qty })));

  const quote = await prisma.$transaction(async (tx) => {
    const q = await tx.rfqQuote.create({
      data: {
        projectId: params.id, rfqId: body.rfqId || null, fileName: String(body.fileName || 'Pasted quote'), quoteNumber: body.quoteNumber || null,
        uploadedById: user.id, uploadedByName: user.name || user.email,
        lines: {
          create: quoteLines.map((l, i) => ({
            ...l, sortOrder: i, confidence: matches[i].confidence,
            rfqLineId: matches[i].rfqLineId, status: matches[i].status,
          })),
        },
      },
    });
    for (let i = 0; i < quoteLines.length; i++) {
      if (matches[i].status !== 'AUTO') continue;
      await priceLine(tx, { rfqLineId: matches[i].rfqLineId, price: quoteLines[i].unitPrice, source: 'AUTO', confidence: matches[i].confidence, user });
    }
    // One summary row on each RFQ the quote touched (priceLine logs each price).
    const rfqOf = new Map(rfqLines.map((r) => [r.id, r.rfqId]));
    const touched = new Set(body.rfqId ? [body.rfqId] : matches.map((m) => rfqOf.get(m.rfqLineId)).filter(Boolean));
    const auto = matches.filter((m) => m.status === 'AUTO').length;
    for (const rfqId of touched) {
      await logHistory({ entityType: 'RFQ', entityId: rfqId, action: 'QUOTE', user, db: tx, note: `Quote ${q.fileName} brought in: ${auto} of ${quoteLines.length} lines matched at 75% or better` });
    }
    return q;
  }, { timeout: 30000 });

  return NextResponse.json({
    quote: await prisma.rfqQuote.findUnique({ where: { id: quote.id }, include: quoteInclude }),
    options: Object.fromEntries((await prisma.rfqQuoteLine.findMany({ where: { quoteId: quote.id }, select: { id: true, sortOrder: true } })).map((l) => [l.id, matches[l.sortOrder].options])),
    rfqLines: await rfqLinesFor(params.id),
  }, { status: 201 });
}

// PATCH { quoteLineId, rfqLineId }  this quote line prices that RFQ line
//       { quoteLineId, skip: true }  not ours (freight, a spare, an option)
export async function PATCH(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const { quoteLineId, rfqLineId, skip } = await request.json();
  const ql = await prisma.rfqQuoteLine.findFirst({ where: { id: quoteLineId, quote: { projectId: params.id } } });
  if (!ql) return NextResponse.json({ error: 'That quote line is not in the app any more. Nothing was changed. Reload the page. (RFQ_QLINE_NOT_FOUND)' }, { status: 404 });
  if (!skip) {
    const target = await prisma.rfqLine.findFirst({ where: { id: rfqLineId, rfq: { projectId: params.id } } });
    if (!target) return NextResponse.json({ error: 'Pick an RFQ line on this project. Nothing was changed. (RFQ_QLINE_BAD_TARGET)' }, { status: 400 });
    if (ql.unitPrice == null) return NextResponse.json({ error: 'This quote line has no unit price to carry over. Nothing was changed. Type the price on the RFQ instead. (RFQ_QLINE_NO_PRICE)' }, { status: 400 });
  }
  await prisma.$transaction(async (tx) => {
    // Moving a line off an RFQ line it priced before clears that old price.
    if (ql.rfqLineId && ql.status !== 'OPEN' && ql.status !== 'SKIPPED' && ql.rfqLineId !== rfqLineId) {
      await priceLine(tx, { rfqLineId: ql.rfqLineId, price: null, source: 'PICKED', user });
    }
    if (skip) {
      await tx.rfqQuoteLine.update({ where: { id: ql.id }, data: { status: 'SKIPPED', rfqLineId: null } });
    } else {
      await tx.rfqQuoteLine.update({ where: { id: ql.id }, data: { status: 'PICKED', rfqLineId } });
      await priceLine(tx, { rfqLineId, price: ql.unitPrice, source: 'PICKED', user });
    }
  });
  const quote = await prisma.rfqQuote.findUnique({ where: { id: ql.quoteId }, include: quoteInclude });
  return NextResponse.json({ quote, rfqLines: await rfqLinesFor(params.id) });
}
