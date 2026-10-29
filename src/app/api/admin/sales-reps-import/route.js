import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normName } from '@/lib/rfq/resolve';
import { replaceEmails } from '@/lib/salesReps/emails';
import { clearOtherDefaults } from '@/lib/salesReps/links';
import { logHistory } from '@/lib/recordHistory';
import { dropped } from '@/lib/salesReps/trackvia';

export const dynamic = 'force-dynamic';

/**
 * Admin > Sales Rep upload (Mike 10-29, 0144). Loads the Trackvia rep exports.
 * Every step can be run again: reps update by Trackvia number, links update by
 * rep + manufacturer + office, so a second load never doubles anything.
 *
 * GET                                  -> counts now in the app, Logiq and AMPS leftovers
 * POST { action: 'reps', rows }        -> one batch of reps with their emails
 * POST { action: 'links', rows }       -> one batch of manufacturer links (adds missing manufacturers)
 * POST { action: 'cleanup' }           -> removes Logiq and AMPS reps, links and manufacturers
 */

const fail = (message, code, status = 400) => NextResponse.json({ error: `${message} (${code})` }, { status });

async function leftovers() {
  const [mfrs, reps] = await Promise.all([
    prisma.manufacturer.findMany({ select: { id: true, name: true, _count: { select: { products: true } } } }),
    prisma.salesRep.findMany({ select: { id: true, name: true } }),
  ]);
  return {
    manufacturers: mfrs.filter((m) => dropped(m.name)).map((m) => ({ id: m.id, name: m.name, products: m._count.products })),
    reps: reps.filter((r) => dropped(r.name)),
  };
}

export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const [reps, links, defaults, manufacturers, left] = await Promise.all([
    prisma.salesRep.count({ where: { active: true } }),
    prisma.manufacturerRep.count({ where: { active: true } }),
    prisma.manufacturerRep.count({ where: { active: true, isDefault: true } }),
    prisma.manufacturer.count(),
    leftovers(),
  ]);
  return NextResponse.json({ reps, links, defaults, manufacturers, leftovers: left });
}

async function loadReps(rows, user) {
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    if (!r?.name || dropped(r.name)) continue;
    const data = {
      name: r.name, abbreviation: r.abbreviation, mainPhone: r.mainPhone, secondPhone: r.secondPhone,
      street: r.street, city: r.city, state: r.state, zip: r.zip, notes: r.notes,
    };
    await prisma.$transaction(async (tx) => {
      const found = r.trackviaId
        ? await tx.salesRep.findUnique({ where: { trackviaId: r.trackviaId } })
        : await tx.salesRep.findFirst({ where: { name: r.name } });
      const rep = found
        ? await tx.salesRep.update({ where: { id: found.id }, data })
        : await tx.salesRep.create({ data: { ...data, trackviaId: r.trackviaId || null } });
      const changes = await replaceEmails(tx, { salesRepId: rep.id }, { QUOTES: r.quotes, ORDERS: r.orders });
      if (found) updated += 1; else created += 1;
      await logHistory({ entityType: 'SALES_REP', entityId: rep.id, action: 'LOAD', user, db: tx, changes, note: found ? 'Updated from the Trackvia upload' : 'Added from the Trackvia upload' });
    });
  }
  return { created, updated };
}

async function nextNumericId(tx) {
  const agg = await tx.manufacturer.aggregate({ _max: { numericId: true } });
  return (agg._max.numericId ?? 0) + 1;
}

async function loadLinks(rows, user) {
  const [offices, mfrs] = await Promise.all([
    prisma.ourOffice.findMany({ select: { id: true, name: true } }),
    prisma.manufacturer.findMany({ select: { id: true, name: true } }),
  ]);
  const officeId = new Map(offices.map((o) => [o.name, o.id]));
  const byName = new Map();
  for (const m of mfrs) if (!byName.has(normName(m.name))) byName.set(normName(m.name), m);

  let created = 0;
  let updated = 0;
  const newMfrs = [];
  const noRep = [];
  for (const l of rows) {
    if (!l?.manufacturer || dropped(l.manufacturer) || dropped(l.repName)) continue;
    const rep = l.trackviaId
      ? await prisma.salesRep.findUnique({ where: { trackviaId: l.trackviaId } })
      : await prisma.salesRep.findFirst({ where: { name: l.repName } });
    if (!rep) { noRep.push(`${l.repName} - ${l.manufacturer}`); continue; }
    await prisma.$transaction(async (tx) => {
      let m = byName.get(normName(l.manufacturer));
      if (!m) {
        // Mike 10-29: a manufacturer in Trackvia but not in the app is added.
        m = await tx.manufacturer.create({ data: { name: l.manufacturer, numericId: await nextNumericId(tx) }, select: { id: true, name: true } });
        byName.set(normName(m.name), m);
        newMfrs.push(m.name);
        await logHistory({ entityType: 'MANUFACTURER', entityId: m.id, action: 'CREATE', user, db: tx, note: 'Added from the Trackvia rep upload' });
      }
      const office = officeId.get(l.office) || null;
      const found = await tx.manufacturerRep.findFirst({ where: { manufacturerId: m.id, salesRepId: rep.id, officeId: office } });
      const data = { active: !!l.active, notes: l.notes || null, ...(l.isDefault ? { isDefault: true } : {}) };
      const link = found
        ? await tx.manufacturerRep.update({ where: { id: found.id }, data })
        : await tx.manufacturerRep.create({ data: { manufacturerId: m.id, salesRepId: rep.id, officeId: office, ...data } });
      if (link.isDefault && link.active) await clearOtherDefaults(tx, link);
      if (found) updated += 1; else created += 1;
      if (!found) {
        const where = l.office ? ` (${l.office})` : ' (all offices)';
        await logHistory({ entityType: 'SALES_REP', entityId: rep.id, action: 'ADD', user, db: tx, note: `Linked from the Trackvia upload: ${m.name}${where}` });
        await logHistory({ entityType: 'MANUFACTURER', entityId: m.id, action: 'ADD', user, db: tx, note: `Linked from the Trackvia upload: ${rep.name}${where}` });
      }
    });
  }
  return { created, updated, newMfrs, noRep };
}

// Mike 10-29: Logiq and AMPS come out of everything. A manufacturer that still
// has products is reported, not deleted, so no product is lost by accident.
async function cleanup(user) {
  const left = await leftovers();
  const removed = { reps: [], manufacturers: [] };
  const kept = [];
  for (const r of left.reps) {
    await prisma.salesRep.delete({ where: { id: r.id } });
    removed.reps.push(r.name);
  }
  for (const m of left.manufacturers) {
    if (m.products > 0) { kept.push(`${m.name} has ${m.products} products`); continue; }
    await prisma.manufacturer.delete({ where: { id: m.id } });
    removed.manufacturers.push(m.name);
  }
  if (removed.reps.length || removed.manufacturers.length) {
    console.log('[sales-reps-import] Logiq/AMPS removed by', user?.email, removed);
  }
  return { removed, kept };
}

export async function POST(request) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;
  const body = await request.json().catch(() => null);
  try {
    if (body?.action === 'reps') return NextResponse.json(await loadReps(Array.isArray(body.rows) ? body.rows : [], user));
    if (body?.action === 'links') return NextResponse.json(await loadLinks(Array.isArray(body.rows) ? body.rows : [], user));
    if (body?.action === 'cleanup') return NextResponse.json(await cleanup(user));
    return fail('The app did not understand that request. Nothing was changed.', 'REP_IMPORT_BAD_ACTION');
  } catch (e) {
    console.error('[sales-reps-import]', e);
    return fail('This batch did not save. That is on our side. Rows saved before it are kept. Press Continue to retry.', 'REP_IMPORT_FAILED', 500);
  }
}
