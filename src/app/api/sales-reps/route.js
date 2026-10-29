import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logHistory } from '@/lib/recordHistory';
import { badEmails, replaceEmails } from '@/lib/salesReps/emails';
import { repData } from '@/lib/salesReps/fields';

// GET /api/sales-reps?inactive=1  the Sales Reps list (0144).
export async function GET(request) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const { searchParams } = new URL(request.url);
  // About 180 reps: the screen filters them itself (contains is case blind on sqlite only).
  const reps = await prisma.salesRep.findMany({
    where: searchParams.get('inactive') ? {} : { active: true },
    orderBy: { name: 'asc' },
    include: {
      emails: { orderBy: { sortOrder: 'asc' } },
      links: { where: { active: true }, include: { manufacturer: { select: { id: true, name: true } }, office: { select: { id: true, name: true } } } },
      _count: { select: { rfqs: true } },
    },
  });
  return NextResponse.json({ reps });
}

// POST /api/sales-reps  { name, ..., emails: { QUOTES, ORDERS } }
export async function POST(request) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const body = await request.json();
  if (!String(body.name || '').trim()) {
    return NextResponse.json({ error: 'A rep needs a name. Nothing was saved. Type a name and save again. (REP_NO_NAME)' }, { status: 400 });
  }
  const bad = badEmails(body.emails);
  if (bad.length) return NextResponse.json({ error: `These do not look like email addresses: ${bad.join(', ')}. Nothing was saved. (REP_BAD_EMAIL)` }, { status: 400 });
  const rep = await prisma.$transaction(async (tx) => {
    const r = await tx.salesRep.create({ data: repData(body) });
    await replaceEmails(tx, { salesRepId: r.id }, body.emails);
    await logHistory({ entityType: 'SALES_REP', entityId: r.id, action: 'CREATE', user, note: `Added ${r.name}`, db: tx });
    return r;
  });
  return NextResponse.json({ rep }, { status: 201 });
}
