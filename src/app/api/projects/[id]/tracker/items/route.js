import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function getTracker(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return null;
  if (user.role !== 'ILC_ADMIN' && p.createdById !== user.id) return null;
  return prisma.submittalTracker.findUnique({ where: { projectId } });
}

// POST — add one item (manual) or bulk import (array)
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await getTracker(params.id, user);
  if (!tracker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  // Bulk import: { items: [{typeCode, description, location, manufacturer, modelNumber}] }
  if (Array.isArray(body.items)) {
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
  }

  // Single item
  const { typeCode, description, location, sortOrder } = body;
  const maxOrder = await prisma.submittalItem.count({ where: { trackerId: tracker.id } });
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

// DELETE — clear all items (before re-import)
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await getTracker(params.id, user);
  if (!tracker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.submittalItem.deleteMany({ where: { trackerId: tracker.id } });
  return NextResponse.json({ success: true });
}
