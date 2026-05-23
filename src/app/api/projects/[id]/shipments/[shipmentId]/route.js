import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deriveShipmentStatus } from '@/lib/shipmentStatus';
import { queueDigestEvent } from '@/lib/notify';

async function getShipment(shipmentId, projectId) {
  return prisma.shipment.findFirst({
    where: { id: shipmentId, project_id: projectId },
    include: { lineItems: { orderBy: { createdAt: 'asc' } } },
  });
}

// GET /api/projects/[id]/shipments/[shipmentId]
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const shipment = await getShipment(params.shipmentId, params.id);
  if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(shipment);
}

// PATCH /api/projects/[id]/shipments/[shipmentId]
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existing = await getShipment(params.shipmentId, params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { manufacturer, poDate, leadTimeWeeks, esdDate, trackingNumber, deliveredDate, notes } = body;

  const newData = {
    manufacturer:  manufacturer  !== undefined ? manufacturer  : existing.manufacturer,
    poDate:        poDate        !== undefined ? (poDate ? new Date(poDate) : null)               : existing.poDate,
    leadTimeWeeks: leadTimeWeeks !== undefined ? (leadTimeWeeks || null)                           : existing.leadTimeWeeks,
    esdDate:       esdDate       !== undefined ? (esdDate ? new Date(esdDate) : null)              : existing.esdDate,
    trackingNumber:trackingNumber!== undefined ? (trackingNumber || null)                          : existing.trackingNumber,
    deliveredDate: deliveredDate !== undefined ? (deliveredDate ? new Date(deliveredDate) : null)  : existing.deliveredDate,
    notes:         notes         !== undefined ? (notes || null)                                   : existing.notes,
  };

  newData.status = deriveShipmentStatus(newData);

  // Queue digest notifications for ESD or lead time changes
  if (esdDate !== undefined && String(esdDate) !== String(existing.esdDate)) {
    await queueDigestEvent(params.id, 'SHIP_ESD_UPDATE', { manufacturer: newData.manufacturer, esdDate: newData.esdDate });
  }
  if (leadTimeWeeks !== undefined && leadTimeWeeks !== existing.leadTimeWeeks) {
    await queueDigestEvent(params.id, 'SHIP_LEAD_TIME_UPDATE', { manufacturer: newData.manufacturer, leadTimeWeeks: newData.leadTimeWeeks });
  }

  const updated = await prisma.shipment.update({
    where: { id: params.shipmentId },
    data: newData,
    include: { lineItems: { orderBy: { createdAt: 'asc' } } },
  });

  return NextResponse.json(updated);
}

// DELETE /api/projects/[id]/shipments/[shipmentId]
export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existing = await getShipment(params.shipmentId, params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.shipment.delete({ where: { id: params.shipmentId } });
  return NextResponse.json({ success: true });
}
