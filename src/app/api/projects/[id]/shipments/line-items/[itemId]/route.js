import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function getItem(itemId, projectId) {
  return prisma.shipmentLineItem.findFirst({
    where: { id: itemId, shipment: { project_id: projectId } },
  });
}

// PATCH /api/projects/[id]/shipments/line-items/[itemId]
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existing = await getItem(params.itemId, params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.shipmentLineItem.update({
    where: { id: params.itemId },
    data: {
      fixtureType:    body.fixtureType    !== undefined ? body.fixtureType    : existing.fixtureType,
      description:    body.description    !== undefined ? body.description    : existing.description,
      catalogNo:      body.catalogNo      !== undefined ? (body.catalogNo || null) : existing.catalogNo,
      qty:            body.qty            !== undefined ? body.qty            : existing.qty,
      fixtureStatus:  body.fixtureStatus  !== undefined ? (body.fixtureStatus || null) : existing.fixtureStatus,
      notes:          body.notes          !== undefined ? (body.notes || null) : existing.notes,
      submittalItemId:body.submittalItemId!== undefined ? (body.submittalItemId || null) : existing.submittalItemId,
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/projects/[id]/shipments/line-items/[itemId]
export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existing = await getItem(params.itemId, params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.shipmentLineItem.delete({ where: { id: params.itemId } });
  return NextResponse.json({ success: true });
}
