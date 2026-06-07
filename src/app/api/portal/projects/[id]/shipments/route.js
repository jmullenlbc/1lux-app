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
        include: {
          deliveryEvents: { select: { qtyReceived: true } },
          releases: {
            select: { id: true, qty: true, qtyReleased: true, status: true,
                      requestedAt: true, requestedByPortalUser: { select: { name: true, email: true } } },
          },
        },
      },
    },
    orderBy: { esdDate: 'asc' },
  });

  // Status counts keyed on ShipmentLineItem.fixtureStatus (counts active line items, not shipments)
  const STATUS_RELEASED  = ['RELEASED', 'DELIVERED'];
  const STATUS_WAREHOUSE = ['AT_WAREHOUSE', 'PARTIALLY_RELEASED'];
  const STATUS_TRANSIT   = ['SHIPPED', 'IN_TRANSIT'];

  let toSite = 0, inWarehouse = 0, inTransit = 0, onOrder = 0;
  for (const s of shipments) {
    for (const li of (s.lineItems || [])) {
      if (li.isRemoved) continue;
      const st = li.fixtureStatus || 'NOT_ORDERED';
      if      (STATUS_RELEASED.includes(st))  toSite++;
      else if (STATUS_WAREHOUSE.includes(st)) inWarehouse++;
      else if (STATUS_TRANSIT.includes(st))   inTransit++;
      else                                    onOrder++;
    }
  }

  // First upcoming delivery (earliest ESD not yet delivered)
  const firstDelivery = shipments.find(
    s => s.esdDate && !STATUS_RELEASED.includes(s.status)
  ) ?? null;

  // Enrich each line item with derived qty fields
  const shipmentsOut = shipments.map(s => ({
    ...s,
    lineItems: s.lineItems.map(li => {
      const totalDelivered = (li.deliveryEvents || []).reduce((sum, e) => sum + (e.qtyReceived || 0), 0);
      const totalReleased  = (li.releases || [])
        .filter(r => r.status === 'APPROVED')
        .reduce((sum, r) => sum + (r.qtyReleased ?? r.qty ?? 0), 0);
      return {
        ...li,
        qtyAtWarehouse: totalDelivered - totalReleased,
        qtyOnSite:      totalReleased,
        qtyBackordered: Math.max(0, (li.qty || 0) - totalDelivered),
        totalReleased,   // legacy field kept for compatibility
      };
    }),
  }));

  return NextResponse.json({
    shipments: shipmentsOut,
    stats: { toSite, inWarehouse, inTransit, onOrder },
    firstDelivery: firstDelivery
      ? { manufacturer: firstDelivery.manufacturer, esdDate: firstDelivery.esdDate }
      : null,
  });
}
