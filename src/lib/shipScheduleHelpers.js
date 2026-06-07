/**
 * Shared helpers for ship schedule API routes.
 * enrichLineItem() is the single source of truth for derived qty fields.
 */

export function enrichLineItem(li) {
  const totalDelivered = (li.deliveryEvents || []).reduce((s, e) => s + (e.qtyReceived || 0), 0);
  const totalReleased  = (li.releases || [])
    .filter(e => e.status === 'APPROVED')
    .reduce((s, e) => s + (e.qtyReleased ?? e.qty ?? 0), 0);

  return {
    ...li,
    qtyAtWarehouse: totalDelivered - totalReleased,
    qtyOnSite:      totalReleased,
    qtyBackordered: Math.max(0, (li.qty || 0) - totalDelivered),
  };
}

/** Standard Prisma include for a line item with its events */
export const LINE_ITEM_INCLUDE = {
  deliveryEvents: {
    include:  { createdBy: { select: { id: true, name: true } } },
    orderBy:  { deliveryDate: 'asc' },
  },
  releases: {
    include: {
      releasedBy:           { select: { id: true, name: true } },
      requestedByPortalUser:{ select: { id: true, name: true, email: true } },
      approvedBy:           { select: { id: true, name: true } },
    },
    orderBy: { requestedAt: 'asc' },
  },
};

/**
 * Derive a display status for a shipment based on its line items' event data.
 * Falls back to the stored Shipment.status for states we can't auto-detect (SHIPPED, etc.).
 */
export function deriveShipmentStatus(shipment) {
  const lineItems = (shipment.lineItems || []).map(enrichLineItem);
  if (!lineItems.length) return shipment.status || 'PO_PLACED';

  const hasDeliveries    = lineItems.some(li => (li.deliveryEvents || []).length > 0);
  const allFullyDelivered = lineItems.every(li => li.qtyBackordered <= 0);
  const allOnSite        = lineItems.every(li => li.qtyOnSite >= (li.qty || 0));
  const anyBackordered   = lineItems.some(li => li.qtyBackordered > 0 && hasDeliveries);

  if (allOnSite && allFullyDelivered) return 'DELIVERED';
  if (allFullyDelivered && hasDeliveries) return 'AT_WAREHOUSE';
  if (anyBackordered) return 'PARTIALLY_DELIVERED';
  if (hasDeliveries) return 'AT_WAREHOUSE';

  // Fall back to stored status for SHIPPED, ESD_CONFIRMED, etc.
  return shipment.status || 'PO_PLACED';
}
