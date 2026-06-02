import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';

export async function GET(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await prisma.projectExternalContact.findFirst({
    where: { project_id: params.id, portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
  });
  if (!contact?.canViewShipSchedule) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const shipments = await prisma.shipment.findMany({
    where:   { project_id: params.id },
    include: {
      lineItems: {
        where:   { isRemoved: false },
        orderBy: { sortOrder: 'asc' },
        include: { releases: { select: { qty: true } } },
      },
    },
    orderBy: { esdDate: 'asc' },
  });

  // Status counts keyed on Shipment.status
  const STATUS_RELEASED  = ['RELEASED', 'DELIVERED'];
  const STATUS_WAREHOUSE = ['AT_WAREHOUSE', 'PARTIALLY_RELEASED'];
  const STATUS_TRANSIT   = ['SHIPPED', 'IN_TRANSIT'];

  let toSite = 0, inWarehouse = 0, inTransit = 0, onOrder = 0;
  for (const s of shipments) {
    if (STATUS_RELEASED.includes(s.status))  toSite++;
    else if (STATUS_WAREHOUSE.includes(s.status)) inWarehouse++;
    else if (STATUS_TRANSIT.includes(s.status))   inTransit++;
    else onOrder++;
  }

  // First upcoming delivery (earliest ESD not yet delivered)
  const firstDelivery = shipments.find(
    s => s.esdDate && !STATUS_RELEASED.includes(s.status)
  ) ?? null;

  // Add totalReleased per line item for the release indicator
  const shipmentsOut = shipments.map(s => ({
    ...s,
    lineItems: s.lineItems.map(li => ({
      ...li,
      totalReleased: li.releases.reduce((sum, r) => sum + r.qty, 0),
    })),
  }));

  return NextResponse.json({
    shipments: shipmentsOut,
    stats: { toSite, inWarehouse, inTransit, onOrder },
    firstDelivery: firstDelivery
      ? { manufacturer: firstDelivery.manufacturer, esdDate: firstDelivery.esdDate }
      : null,
  });
}
