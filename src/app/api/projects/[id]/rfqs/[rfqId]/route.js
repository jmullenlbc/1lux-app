import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { typePrice } from '@/lib/rfq/actions';
import { emailBody, emailSubject } from '@/lib/rfq/format';
import { looseNumberOrNull } from '@/lib/numberInput';
import { historyFor } from '@/lib/recordHistory';

const NOT_FOUND = () => NextResponse.json({ error: 'That RFQ is not in the app any more. Nothing was changed. Reload the page. (RFQ_NOT_FOUND)' }, { status: 404 });

async function load(projectId, rfqId) {
  return prisma.rfq.findFirst({
    where: { id: rfqId, projectId },
    include: { lines: { orderBy: { sortOrder: 'asc' } }, office: true, project: { select: { name: true } } },
  });
}

// GET one RFQ with its lines, the email text and its history.
export async function GET(request, { params }) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const rfq = await load(params.id, params.rfqId);
  if (!rfq) return NOT_FOUND();
  const info = { number: rfq.number, projectName: rfq.project.name, needBy: rfq.needBy, notes: rfq.notes, office: rfq.office };
  return NextResponse.json({
    rfq,
    email: { to: rfq.sentTo, subject: emailSubject(info), body: emailBody(info) },
    history: await historyFor('RFQ', rfq.id),
  });
}

// PATCH { prices: [{ lineId, dnPrice }] }  typed DN prices (blank clears one).
export async function PATCH(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const rfq = await load(params.id, params.rfqId);
  if (!rfq) return NOT_FOUND();
  const { prices = [] } = await request.json();
  const mine = new Set(rfq.lines.map((l) => l.id));
  const bad = prices.filter((p) => !mine.has(p.lineId));
  if (bad.length) return NextResponse.json({ error: 'Some of those lines are not on this RFQ. Nothing was saved. Reload the page. (RFQ_LINE_MISMATCH)' }, { status: 400 });
  await prisma.$transaction(async (tx) => {
    for (const p of prices) {
      const price = p.dnPrice === '' || p.dnPrice == null ? null : looseNumberOrNull(p.dnPrice);
      if (price != null && isNaN(price)) continue;
      const line = rfq.lines.find((l) => l.id === p.lineId);
      if (line.dnPrice === price) continue;
      await typePrice(tx, { rfqLineId: p.lineId, price, user });
    }
  });
  return NextResponse.json({ rfq: await load(params.id, params.rfqId) });
}
