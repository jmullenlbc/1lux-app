// Manufacturer to rep links (0144). Server only. Every change is written to
// both the rep's and the manufacturer's history.
import { logHistory } from '@/lib/recordHistory';

/** One default per manufacturer and office. */
export async function clearOtherDefaults(tx, link) {
  await tx.manufacturerRep.updateMany({
    where: { manufacturerId: link.manufacturerId, officeId: link.officeId, isDefault: true, id: { not: link.id } },
    data: { isDefault: false },
  });
}

export async function linkHistory(tx, link, action, user, changes) {
  const full = await tx.manufacturerRep.findUnique({
    where: { id: link.id },
    include: { manufacturer: { select: { name: true } }, salesRep: { select: { name: true } }, office: { select: { name: true } } },
  });
  const where = full?.office?.name ? ` (${full.office.name})` : ' (all offices)';
  const verb = { ADD: 'Linked', REMOVE: 'Unlinked', UPDATE: 'Changed link' }[action] || action;
  const rep = full?.salesRep?.name || 'rep';
  const mfr = full?.manufacturer?.name || 'manufacturer';
  await logHistory({ entityType: 'SALES_REP', entityId: link.salesRepId, action, user, changes, note: `${verb}: ${mfr}${where}`, db: tx });
  await logHistory({ entityType: 'MANUFACTURER', entityId: link.manufacturerId, action, user, changes, note: `${verb}: ${rep}${where}`, db: tx });
}
