import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logHistory } from '@/lib/recordHistory';
import { trackerFor as getTracker } from '@/lib/submittalTracker';

// POST, add one item (manual) or bulk import (array)
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await getTracker(params.id, user);
  if (!tracker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  // Bulk import: { items: [{typeCode, description, location, manufacturer, modelNumber}] }
  if (Array.isArray(body.items)) {
    try {
      const created = await prisma.$transaction(
        body.items.map((item, i) =>
          prisma.submittalItem.create({
            data: {
              trackerId:   tracker.id,
              typeCode:    item.typeCode,
              description: item.description || null,
              location:    item.location    || null,
              sortOrder:   i,
            },
          })
        )
      );
      return NextResponse.json({ items: created }, { status: 201 });
    } catch (err) {
      console.error('tracker items bulk import failed:', err);
      return NextResponse.json({ error: 'Failed to import items' }, { status: 500 });
    }
  }

  // Single item
  const { typeCode, description, location, sortOrder } = body;
  const maxOrder = await prisma.submittalItem.count({ where: { trackerId: tracker.id, archivedAt: null } });
  const item = await prisma.submittalItem.create({
    data: {
      trackerId:   tracker.id,
      typeCode,
      description: description || null,
      location:    location    || null,
      sortOrder:   sortOrder ?? maxOrder,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}

// DELETE, clear all items (before re-import). Items are archived, never
// deleted (0146): their rounds, reviews and responses stay in the record.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await getTracker(params.id, user);
  if (!tracker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const live = await prisma.submittalItem.findMany({ where: { trackerId: tracker.id, archivedAt: null }, select: { id: true } });
  await prisma.$transaction(async (db) => {
    await db.submittalItem.updateMany({ where: { id: { in: live.map((i) => i.id) } }, data: { archivedAt: new Date() } });
    for (const i of live) await logHistory({ entityType: 'SUBMITTAL_ITEM', entityId: i.id, action: 'ARCHIVE', user, note: 'Cleared before a re-import', db });
  });
  return NextResponse.json({ success: true, archived: live.length });
}
