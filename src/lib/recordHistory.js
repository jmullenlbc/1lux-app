// Who did what to a record, and when (Mike 10-29: "like everything we need a
// history at the bottom of them to see everything done to them, when and by
// who"). Migration 0144. Server only. One RecordHistory row per field changed,
// so the rows can be searched by field as well as read top to bottom.
import { prisma } from '@/lib/db';

const show = (v) => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v).slice(0, 500);
};

/** { field: [old, new] } for the fields that really changed. */
export function changedFields(before, after, fields) {
  const out = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    if (show(before?.[f]) !== show(after[f])) out[f] = [before?.[f], after[f]];
  }
  return out;
}

/**
 * Write history rows. changes = { field: [old, new] }; with no changes one row
 * is written for the action itself (CREATE, SEND, LOAD and so on).
 * db may be a transaction client.
 */
export async function logHistory({ entityType, entityId, action, user, changes, note, db = prisma }) {
  const who = { userId: user?.id || null, userName: user?.name || user?.email || null };
  const entries = Object.entries(changes || {});
  const data = entries.length
    ? entries.map(([field, [oldValue, newValue]]) => ({ entityType, entityId, action, field, oldValue: show(oldValue), newValue: show(newValue), note: note || null, ...who }))
    : [{ entityType, entityId, action, note: note || null, ...who }];
  await db.recordHistory.createMany({ data });
}

export function historyFor(entityType, entityId, take = 200) {
  return prisma.recordHistory.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
