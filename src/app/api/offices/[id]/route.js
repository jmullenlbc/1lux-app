import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { changedFields, logHistory } from '@/lib/recordHistory';

const OFFICE_FIELDS = ['name', 'companyName', 'street', 'city', 'state', 'zip', 'phone', 'pricingEmail', 'ordersEmail', 'rfqNotes', 'active'];

// PATCH an office: everything printed on an RFQ. Anyone on staff (Mike 10-29).
export async function PATCH(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const body = await request.json();
  const before = await prisma.ourOffice.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: 'That office is not in the app any more. Nothing was changed. (OFFICE_NOT_FOUND)' }, { status: 404 });
  const data = {};
  for (const f of OFFICE_FIELDS) {
    if (!(f in body)) continue;
    if (f === 'active') { data.active = !!body.active; continue; }
    data[f] = String(body[f] ?? '').trim() || null;
  }
  if ('name' in data && !data.name) return NextResponse.json({ error: 'An office needs a name. Nothing was saved. (OFFICE_NO_NAME)' }, { status: 400 });
  if ('companyName' in data && !data.companyName) delete data.companyName;
  const office = await prisma.$transaction(async (tx) => {
    const o = await tx.ourOffice.update({ where: { id: params.id }, data });
    const changes = changedFields(before, data, OFFICE_FIELDS);
    if (Object.keys(changes).length) await logHistory({ entityType: 'OUR_OFFICE', entityId: params.id, action: 'UPDATE', user, changes, db: tx });
    return o;
  });
  return NextResponse.json({ office });
}
