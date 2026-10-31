import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { priceLine } from '@/lib/rfq/actions';
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
