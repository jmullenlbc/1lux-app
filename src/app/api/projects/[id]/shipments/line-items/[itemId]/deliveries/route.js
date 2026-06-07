import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { enrichLineItem, LINE_ITEM_INCLUDE } from '@/lib/shipScheduleHelpers';

// POST /api/projects/[id]/shipments/line-items/[lineItemId]/deliveries
// Log a delivery from manufacturer → ILC warehouse. ILC staff only.
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { deliveryDate, carrier, trackingNumber, qtyReceived, notes } = await req.json();

  if (!deliveryDate || !qtyReceived || qtyReceived < 1) {
    return NextResponse.json({ error: 'deliveryDate and qtyReceived (≥1) required' }, { status: 400 });
  }

  // Verify line item belongs to this project
  const lineItem = await prisma.shipmentLineItem.findFirst({
    where: { id: params.itemId, shipment: { project_id: params.id } },
    select: { id: true, shipment_id: true },
  });
  if (!lineItem) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.manufacturerDeliveryEvent.create({
    data: {
      lineItemId:     params.itemId,
      deliveryDate:   new Date(deliveryDate),
      carrier:        carrier || null,
      trackingNumber: trackingNumber || null,
      qtyReceived:    parseInt(qtyReceived),
      notes:          notes || null,
      createdById:    user.id,
    },
  });

  // Return the updated line item with all derived qtys
  const updated = await prisma.shipmentLineItem.findUnique({
    where:   { id: params.itemId },
    include: LINE_ITEM_INCLUDE,
  });

  return NextResponse.json({ lineItem: enrichLineItem(updated) }, { status: 201 });
}
