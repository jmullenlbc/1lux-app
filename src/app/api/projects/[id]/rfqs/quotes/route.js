import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { linkRows, unlinkRow, skipRow } from '@/lib/rfq/actions';
import { saveQuote, rfqLinesFor, quoteInclude } from '@/lib/rfq/intakeQuote';

// The RFQ received screen (0144). The browser posts the lines a person checked,
// from a dropped file or a pasted table. Lines matched at 75% or better are
// priced straight away; the rest wait for someone to pick the RFQ line.

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

// POST { rfqId?, fileId?, fileName, quoteNumber?, fromName?, quoteDate?, total?, lines: [...] }
export async function POST(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const b = await request.json();
  const saved = await saveQuote({
    projectId: params.id, user, source: 'DROP', rfqId: b.rfqId || null, fileId: b.fileId || null, fileName: b.fileName,
    quoteNumber: b.quoteNumber, fromName: b.fromName, quoteDate: b.quoteDate, total: b.total, lines: b.lines,
  });
  if (saved.error) return NextResponse.json({ error: saved.error }, { status: 400 });
  return NextResponse.json(saved, { status: 201 });
}

// PATCH { quoteLineId, rfqLineId }                this quote line also prices that RFQ line
//       { quoteLineId, rfqLineId, remove: true }  it stops pricing that RFQ line
//       { quoteLineId, skip: true }               not ours (freight, a spare, an option)
export async function PATCH(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const { quoteLineId, rfqLineId, skip, remove } = await request.json();
  const ql = await prisma.rfqQuoteLine.findFirst({ where: { id: quoteLineId, quote: { projectId: params.id } } });
  if (!ql) return NextResponse.json({ error: 'That quote line is not in the app any more. Nothing was changed. Reload the page. (RFQ_QLINE_NOT_FOUND)' }, { status: 404 });
  if (remove) {
    const link = await prisma.rfqQuoteLink.findFirst({ where: { quoteLineId: ql.id, rfqLineId } });
    if (!link) return NextResponse.json({ error: 'That match is already gone. Nothing was changed. Reload the page. (RFQ_QLINK_NOT_FOUND)' }, { status: 404 });
  } else if (!skip) {
    const target = await prisma.rfqLine.findFirst({ where: { id: rfqLineId, rfq: { projectId: params.id } } });
    if (!target) return NextResponse.json({ error: 'Pick an RFQ line on this project. Nothing was changed. (RFQ_QLINE_BAD_TARGET)' }, { status: 400 });
    if (!(ql.unitPrice > 0)) return NextResponse.json({ error: 'This quote line has no unit price to carry over. Nothing was changed. Type the price on the RFQ instead. (RFQ_QLINE_NO_PRICE)' }, { status: 400 });
  }
  await prisma.$transaction(async (tx) => {
    if (skip) await skipRow(tx, { quoteLineId: ql.id, user });
    else if (remove) await unlinkRow(tx, { quoteLineId: ql.id, rfqLineId, user });
    else await linkRows(tx, { quoteId: ql.quoteId, links: [{ quoteLineId: ql.id, rfqLineId }], source: 'PICKED', user });
  });
  const quote = await prisma.rfqQuote.findUnique({ where: { id: ql.quoteId }, include: quoteInclude });
  return NextResponse.json({ quote, rfqLines: await rfqLinesFor(params.id) });
}
