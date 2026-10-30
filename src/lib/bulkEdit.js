import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { changedFields, logHistory } from '@/lib/recordHistory';
import { archiveData } from '@/lib/archive';

// Shared core for the bulk routes on lists whose rows archive with archivedAt
// (Products, Companies, People; Mike 10-29). The route cleans `set` into plain
// column values; `active` (true/false) archives or restores.

export const MAX_BULK_IDS = 500;

// Returns { ids } or { error } ready to send back.
export function readBulkIds(body, noun, code) {
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((x) => typeof x === 'string' && x))] : [];
  if (!ids.length) return { error: NextResponse.json({ error: `Pick at least one ${noun}. Nothing was changed. (${code}_NONE)` }, { status: 400 }) };
  if (ids.length > MAX_BULK_IDS) return { error: NextResponse.json({ error: `Pick ${MAX_BULK_IDS} or fewer at a time. Nothing was changed. (${code}_MANY)` }, { status: 400 }) };
  return { ids };
}

export function emptyBulk(code) {
  return NextResponse.json({ error: `Pick something to change first. Nothing was changed. (${code}_EMPTY)` }, { status: 400 });
}

// data: { column: value } already cleaned; active: undefined | boolean.
// Each changed row gets its own history rows. Returns { updated, missing }.
export async function applyBulk({ model, entityType, ids, data, active, user }) {
  const fields = Object.keys(data);
  const before = await prisma[model].findMany({ where: { id: { in: ids }, archivedAt: undefined } });
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of before) {
      const changes = changedFields(row, data, fields);
      const wasActive = !row.archivedAt;
      const flips = active !== undefined && active !== wasActive;
      if (flips) changes.active = [wasActive, active];
      if (!Object.keys(changes).length) continue;
      await tx[model].update({ where: { id: row.id }, data: { ...data, ...(flips ? archiveData(!active, user) : {}) } });
      const action = flips ? (active ? 'RESTORE' : 'ARCHIVE') : 'UPDATE';
      await logHistory({ entityType, entityId: row.id, action, user, changes, note: 'Bulk edit', db: tx });
      updated += 1;
    }
  }, { timeout: 20000 });
  return { updated, missing: ids.length - before.length };
}

// Text columns: trimmed, blank clears to null.
export function pickText(set, keys) {
  const out = {};
  for (const k of keys) if (k in (set || {})) out[k] = typeof set[k] === 'string' && set[k].trim() ? set[k].trim() : null;
  return out;
}

export function readActive(set) {
  return typeof set?.active === 'boolean' ? set.active : undefined;
}
