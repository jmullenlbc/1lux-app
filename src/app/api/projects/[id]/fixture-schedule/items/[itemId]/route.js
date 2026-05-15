import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function getDraftItem(itemId, projectId) {
  const item = await prisma.fixtureScheduleItem.findUnique({
    where: { id: itemId },
    include: { schedule: { select: { projectId: true, state: true } } },
  });
  if (!item) return null;
  if (item.schedule.projectId !== projectId) return null;
  if (item.schedule.state !== 'DRAFT') return null;
  return item;
}

// PATCH /api/projects/[id]/fixture-schedule/items/[itemId]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const item = await getDraftItem(params.itemId, params.id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const {
    type, location, description, manufacturer, catalogNumber,
    finish, cct, lumens, wattage, voltage, dimming, mounting, notes, internalNotes, sortOrder,
  } = body;

  const updated = await prisma.fixtureScheduleItem.update({
    where: { id: params.itemId },
    data: {
      ...(type          !== undefined && { type }),
      ...(location      !== undefined && { location }),
      ...(description   !== undefined && { description }),
      ...(manufacturer  !== undefined && { manufacturer:  manufacturer  || null }),
      ...(catalogNumber !== undefined && { catalogNumber: catalogNumber || null }),
      ...(finish        !== undefined && { finish:        finish        || null }),
      ...(cct           !== undefined && { cct:           cct           || null }),
      ...(lumens        !== undefined && { lumens:        lumens        || null }),
      ...(wattage       !== undefined && { wattage:       wattage       || null }),
      ...(voltage       !== undefined && { voltage:       voltage       || null }),
      ...(dimming       !== undefined && { dimming:       dimming       || null }),
      ...(mounting      !== undefined && { mounting:      mounting      || null }),
      ...(notes         !== undefined && { notes:         notes         || null }),
      ...(internalNotes !== undefined && { internalNotes: internalNotes || null }),
      ...(sortOrder     !== undefined && { sortOrder:     Number(sortOrder) }),
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/projects/[id]/fixture-schedule/items/[itemId]
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const item = await getDraftItem(params.itemId, params.id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.fixtureScheduleItem.delete({ where: { id: params.itemId } });

  return NextResponse.json({ success: true });
}
