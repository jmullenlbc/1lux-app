import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { changedFields, logHistory } from '@/lib/recordHistory';
import { repData } from '@/lib/salesReps/fields';

// POST /api/sales-reps/bulk (Mike 10-29: pick many, edit or archive them at once).
//   { ids: [...], set: { city?, state?, active? } }
// active:false archives the reps (hidden, never deleted), active:true restores.
// Only the fields sent are changed; each rep gets its own history rows.

const FIELDS = ['city', 'state', 'active'];
const MAX_IDS = 500;

export async function POST(request) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((x) => typeof x === 'string' && x))] : [];
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one rep. Nothing was changed. (REP_BULK_NONE)' }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `Pick ${MAX_IDS} or fewer at a time. Nothing was changed. (REP_BULK_MANY)` }, { status: 400 });
  const data = repData(body?.set || {}, FIELDS);
  if (!Object.keys(data).length) return NextResponse.json({ error: 'Pick something to change first. Nothing was changed. (REP_BULK_EMPTY)' }, { status: 400 });

  const before = await prisma.salesRep.findMany({ where: { id: { in: ids } } });
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const r of before) {
      const changes = changedFields(r, data, FIELDS);
      if (!Object.keys(changes).length) continue;
      await tx.salesRep.update({ where: { id: r.id }, data });
      const action = 'active' in changes ? (data.active ? 'RESTORE' : 'ARCHIVE') : 'UPDATE';
      await logHistory({ entityType: 'SALES_REP', entityId: r.id, action, user, changes, note: 'Bulk edit', db: tx });
      updated += 1;
    }
  }, { timeout: 20000 });
  return NextResponse.json({ updated, missing: ids.length - before.length });
}
