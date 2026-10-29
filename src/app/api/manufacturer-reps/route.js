import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { linkHistory, clearOtherDefaults } from '@/lib/salesReps/links';

// POST /api/manufacturer-reps  { manufacturerId, salesRepId, officeId?, isDefault? }
// Rep A sells manufacturer B for office C (0144).
export async function POST(request) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const { manufacturerId, salesRepId, officeId = null, isDefault = false, notes = null } = await request.json();
  if (!manufacturerId || !salesRepId) {
    return NextResponse.json({ error: 'Pick both a manufacturer and a rep. Nothing was saved. (LINK_MISSING)' }, { status: 400 });
  }
  const dup = await prisma.manufacturerRep.findFirst({ where: { manufacturerId, salesRepId, officeId: officeId || null } });
  if (dup?.active) {
    return NextResponse.json({ error: 'This rep already sells this manufacturer for that office. Nothing was changed. (LINK_EXISTS)' }, { status: 409 });
  }
  const link = await prisma.$transaction(async (tx) => {
    const l = dup
      ? await tx.manufacturerRep.update({ where: { id: dup.id }, data: { active: true, isDefault: !!isDefault } })
      : await tx.manufacturerRep.create({ data: { manufacturerId, salesRepId, officeId: officeId || null, isDefault: !!isDefault, notes } });
    if (l.isDefault) await clearOtherDefaults(tx, l);
    await linkHistory(tx, l, 'ADD', user);
    return l;
  });
  return NextResponse.json({ link }, { status: 201 });
}
