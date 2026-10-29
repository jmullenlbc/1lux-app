import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { linkHistory, clearOtherDefaults } from '@/lib/salesReps/links';

const NOT_FOUND = () => NextResponse.json({ error: 'That link is not in the app any more. Nothing was changed. Reload the page. (LINK_NOT_FOUND)' }, { status: 404 });

// PATCH { isDefault?, officeId?, notes? }
export async function PATCH(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const body = await request.json();
  const before = await prisma.manufacturerRep.findUnique({ where: { id: params.id }, include: { office: true } });
  if (!before) return NOT_FOUND();
  const data = {};
  if ('isDefault' in body) data.isDefault = !!body.isDefault;
  if ('officeId' in body) data.officeId = body.officeId || null;
  if ('notes' in body) data.notes = String(body.notes || '').trim() || null;
  const link = await prisma.$transaction(async (tx) => {
    const l = await tx.manufacturerRep.update({ where: { id: params.id }, data, include: { office: true } });
    if (l.isDefault) await clearOtherDefaults(tx, l);
    const changes = {};
    if ('isDefault' in data && data.isDefault !== before.isDefault) changes.Default = [before.isDefault, data.isDefault];
    if ('officeId' in data && data.officeId !== before.officeId) changes.Office = [before.office?.name || 'All offices', l.office?.name || 'All offices'];
    if ('notes' in data && data.notes !== before.notes) changes.Notes = [before.notes, data.notes];
    if (Object.keys(changes).length) await linkHistory(tx, l, 'UPDATE', user, changes);
    return l;
  });
  return NextResponse.json({ link });
}

// DELETE removes the link (a join row, not a record). It stays in both histories.
export async function DELETE(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const link = await prisma.manufacturerRep.findUnique({ where: { id: params.id } });
  if (!link) return NOT_FOUND();
  await prisma.$transaction(async (tx) => {
    await linkHistory(tx, link, 'REMOVE', user);
    await tx.manufacturerRep.delete({ where: { id: params.id } });
  });
  return NextResponse.json({ ok: true });
}
