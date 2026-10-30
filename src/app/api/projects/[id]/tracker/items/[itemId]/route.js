import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { changedFields, logHistory } from '@/lib/recordHistory';
import { trackerFor, ownedItem } from '@/lib/submittalTracker';

const FIELDS = ['typeCode', 'description', 'location', 'sortOrder'];

// PATCH, edit an item. { archived: false } restores an archived one.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await trackerFor(params.id, user);
  const before = tracker && await ownedItem(tracker.id, params.itemId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  if (body.archived === false) {
    const item = await prisma.submittalItem.update({ where: { id: before.id }, data: { archivedAt: null } });
    await logHistory({ entityType: 'SUBMITTAL_ITEM', entityId: item.id, action: 'RESTORE', user });
    return NextResponse.json({ item });
  }
  const data = Object.fromEntries(FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
  const item = await prisma.submittalItem.update({ where: { id: before.id }, data });
  const changes = changedFields(before, item, FIELDS);
  if (Object.keys(changes).length) await logHistory({ entityType: 'SUBMITTAL_ITEM', entityId: item.id, action: 'UPDATE', user, changes });
  return NextResponse.json({ item });
}

// DELETE archives the item (0146). Its reviews and responses stay.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await trackerFor(params.id, user);
  const item = tracker && await ownedItem(tracker.id, params.itemId);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!item.archivedAt) {
    await prisma.submittalItem.update({ where: { id: item.id }, data: { archivedAt: new Date() } });
    await logHistory({ entityType: 'SUBMITTAL_ITEM', entityId: item.id, action: 'ARCHIVE', user, note: item.typeCode });
  }
  return NextResponse.json({ success: true, archived: true });
}
