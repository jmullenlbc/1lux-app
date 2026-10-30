import { NextResponse } from 'next/server';
import { requirePermission, requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { changedFields, logHistory } from '@/lib/recordHistory';

// POST /api/manufacturers/bulk (Mike 10-29: pick many, edit or archive them at once).
//   { ids: [...], set: { terms?, setupToSell?, buyDirect?, state?, active? } }
// active:false archives (hidden from the list and pickers), active:true restores.
// Only the fields sent are changed; each manufacturer gets its own history rows.
// Buy direct and archive: any staff login. Terms, setup and state: editProducts.

const FIELDS = ['terms', 'setupToSell', 'buyDirect', 'state', 'active'];
const STAFF_FIELDS = ['buyDirect', 'active'];
const BOOLS = ['setupToSell', 'buyDirect', 'active'];
const MAX_IDS = 500;

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((x) => typeof x === 'string' && x))] : [];
  const set = body?.set && typeof body.set === 'object' ? body.set : {};
  const data = {};
  for (const f of FIELDS) {
    if (!(f in set)) continue;
    if (BOOLS.includes(f)) { data[f] = Boolean(set[f]); continue; }
    const v = typeof set[f] === 'string' ? set[f].trim() : '';
    data[f] = v || null;
  }
  const keys = Object.keys(data);
  const staffOnly = keys.every((k) => STAFF_FIELDS.includes(k));
  const { user, error } = staffOnly ? await requireStaff(request) : await requirePermission(request, 'editProducts');
  if (error) return error;
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one manufacturer. Nothing was changed. (MFR_BULK_NONE)' }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `Pick ${MAX_IDS} or fewer at a time. Nothing was changed. (MFR_BULK_MANY)` }, { status: 400 });
  if (!keys.length) return NextResponse.json({ error: 'Pick something to change first. Nothing was changed. (MFR_BULK_EMPTY)' }, { status: 400 });

  const before = await prisma.manufacturer.findMany({ where: { id: { in: ids } } });
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const m of before) {
      const changes = changedFields(m, data, FIELDS);
      if (!Object.keys(changes).length) continue;
      await tx.manufacturer.update({ where: { id: m.id }, data });
      const action = 'active' in changes ? (data.active ? 'RESTORE' : 'ARCHIVE') : 'UPDATE';
      await logHistory({ entityType: 'MANUFACTURER', entityId: m.id, action, user, changes, note: 'Bulk edit', db: tx });
      updated += 1;
    }
  }, { timeout: 20000 });
  return NextResponse.json({ updated, missing: ids.length - before.length });
}
