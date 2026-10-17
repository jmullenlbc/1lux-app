/**
 * Derives Shipment status from which fields are populated.
 * Status is NEVER set manually, always call this and store the result.
 *
 * PO_PLACED → LEAD_TIME_CONFIRMED → ESD_CONFIRMED → SHIPPED → DELIVERED
 * Always reflects the furthest milestone reached. Never goes backwards.
 */
export function deriveShipmentStatus({ poDate, leadTimeWeeks, esdDate, trackingNumber, deliveredDate }) {
  if (deliveredDate) return 'DELIVERED';
  if (trackingNumber) return 'SHIPPED';
  if (esdDate) return 'ESD_CONFIRMED';
  if (leadTimeWeeks) return 'LEAD_TIME_CONFIRMED';
  return 'PO_PLACED';
}

export const STATUS_META = {
  PO_PLACED:           { label: 'PO Placed',           color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
  LEAD_TIME_CONFIRMED: { label: 'Lead Time Confirmed',  color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  ESD_CONFIRMED:       { label: 'ESD Confirmed',        color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
  SHIPPED:             { label: 'Shipped',              color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  DELIVERED:           { label: 'Delivered',            color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
};

/**
 * Returns ESD warning level for a shipment.
 * 'red', ESD has passed and not yet DELIVERED
 * 'amber', ESD is within 14 days and not yet SHIPPED or DELIVERED
 * null, no warning
 */
export function esdWarning({ esdDate, status }) {
  if (!esdDate) return null;
  if (status === 'DELIVERED') return null;
  const now = new Date();
  const esd = new Date(esdDate);
  const daysUntil = (esd - now) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return 'red';
  if (daysUntil <= 14 && status !== 'SHIPPED') return 'amber';
  return null;
}
