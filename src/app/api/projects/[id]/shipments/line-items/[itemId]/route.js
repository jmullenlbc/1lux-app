import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { looseInteger } from '@/lib/numberInput';

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
  const u = (field, transform) =>
    body[field] !== undefined ? (transform ? transform(body[field]) : body[field]) : existing[field];
  const updated = await prisma.shipmentLineItem.update({
    where: { id: params.itemId },
    data: {
      fixtureType:      u('fixtureType'),
      description:      u('description'),
      catalogNo:        u('catalogNo',        v => v || null),
      qty:              u('qty',              v => (v != null ? looseInteger(v) : existing.qty)),
      fixtureStatus:    u('fixtureStatus',    v => v || null),
      notes:            u('notes',            v => v || null),
      submittalItemId:  u('submittalItemId',  v => v || null),
      sortOrder:        u('sortOrder',        v => v != null ? looseInteger(v) : existing.sortOrder),
      propManufacturer: u('propManufacturer', v => v || null),
      propModel:        u('propModel',        v => v || null),
      sourceBatchLabel: u('sourceBatchLabel', v => v || null),
      leadTimeWeeks:    u('leadTimeWeeks',    v => v != null ? String(v) : existing.leadTimeWeeks),
      esdDate:          u('esdDate',          v => v ? new Date(v) : null),
      trackingNumber:   u('trackingNumber',   v => v || null),
      isRemoved:        u('isRemoved'),
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
