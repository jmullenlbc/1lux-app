import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { changedFields, logHistory } from '@/lib/recordHistory';
import { badEmails, replaceEmails } from '@/lib/salesReps/emails';
import { REP_FIELDS, repData } from '@/lib/salesReps/fields';

const NOT_FOUND = () => NextResponse.json({ error: 'That rep is not in the app any more. Nothing was changed. Go back to Sales Reps. (REP_NOT_FOUND)' }, { status: 404 });

export async function GET(request, { params }) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const rep = await prisma.salesRep.findUnique({
    where: { id: params.id },
    include: {
      emails: { orderBy: { sortOrder: 'asc' } },
      links: { include: { manufacturer: { select: { id: true, name: true, buyDirect: true } }, office: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
      rfqs: { orderBy: { number: 'desc' }, take: 50, select: { id: true, number: true, status: true, needBy: true, createdAt: true, project: { select: { id: true, name: true } } } },
    },
  });
  if (!rep) return NOT_FOUND();
  return NextResponse.json({ rep });
}

// PATCH any REP_FIELDS, plus emails: { QUOTES, ORDERS }. active:false hides the rep; reps are never deleted.
export async function PATCH(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const body = await request.json();
  if ('name' in body && !String(body.name || '').trim()) {
    return NextResponse.json({ error: 'A rep needs a name. Nothing was saved. (REP_NO_NAME)' }, { status: 400 });
  }
  const bad = badEmails(body.emails);
  if (bad.length) return NextResponse.json({ error: `These do not look like email addresses: ${bad.join(', ')}. Nothing was saved. Fix them and save again. (REP_BAD_EMAIL)` }, { status: 400 });
  const before = await prisma.salesRep.findUnique({ where: { id: params.id } });
  if (!before) return NOT_FOUND();
  const data = repData(body);
  const rep = await prisma.$transaction(async (tx) => {
    const r = await tx.salesRep.update({ where: { id: params.id }, data });
    const changes = { ...changedFields(before, data, REP_FIELDS), ...(await replaceEmails(tx, { salesRepId: params.id }, body.emails)) };
    if (Object.keys(changes).length) await logHistory({ entityType: 'SALES_REP', entityId: params.id, action: 'UPDATE', user, changes, db: tx });
    return r;
  });
  return NextResponse.json({ rep });
}
