import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { guardLeveling } from '@/lib/bidLeveling/guard';
import { FLAG_KEY_SET, FLAG_STATES } from '@/lib/bidLeveling/bidFlags';

const BUCKETS = ['FIXTURES', 'CONTROLS', 'ADDER', 'FREIGHT', 'WAREHOUSING', 'SPARES', 'TAX', 'GRAND'];
const num = (v) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return v === '' || v == null || !Number.isFinite(n) ? null : n;
};
const dateOrNull = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * PATCH /api/projects/[id]/bid-leveling/[levelingId]/bids/[bidId]
 *   { bidderName?, quoteNumber?, quoteDate?, expiresAt?, taxRateStated?,
 *     flags?: [{ key, state, value? }],      set by a person (source USER)
 *     totals?: { FIXTURES: 123, FREIGHT: '' },  '' or null clears a bucket
 *     archived?: true }                       archive only, nothing is deleted
 */
export async function PATCH(request, { params }) {
  const g = await guardLeveling(params);
  if (g.error) return g.error;
  const bid = await prisma.bid.findFirst({ where: { id: params.bidId, levelingId: g.leveling.id, archivedAt: null }, select: { id: true } });
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await request.json().catch(() => ({}));

  const data = {};
  if (typeof b.bidderName === 'string' && b.bidderName.trim()) data.bidderName = b.bidderName.trim().slice(0, 120);
  if ('quoteNumber' in b) data.quoteNumber = String(b.quoteNumber || '').trim().slice(0, 60) || null;
  if ('quoteDate' in b) data.quoteDate = dateOrNull(b.quoteDate);
  if ('expiresAt' in b) data.expiresAt = dateOrNull(b.expiresAt);
  if ('taxRateStated' in b) {
    const t = num(b.taxRateStated);
    data.taxRateStated = t == null ? null : t > 1 ? t / 100 : t;
  }
  if (b.archived === true) data.archivedAt = new Date();

  const flags = Array.isArray(b.flags) ? b.flags : [];
  for (const f of flags) {
    if (!FLAG_KEY_SET.has(f?.key) || !FLAG_STATES.includes(f?.state)) {
      return NextResponse.json({ error: `Bad flag ${f?.key}` }, { status: 400 });
    }
  }
  const totals = b.totals && typeof b.totals === 'object' ? Object.entries(b.totals).filter(([k]) => BUCKETS.includes(k)) : [];

  await prisma.$transaction([
    ...(Object.keys(data).length ? [prisma.bid.update({ where: { id: bid.id }, data })] : []),
    ...flags.map((f) => {
      const value = f.value == null ? null : String(f.value).slice(0, 500) || null;
      return prisma.bidFlag.upsert({
        where: { bidId_key: { bidId: bid.id, key: f.key } },
        create: { bidId: bid.id, key: f.key, state: f.state, value, source: 'USER' },
        update: { state: f.state, value, source: 'USER' },
      });
    }),
    // A typed bucket replaces the unlabeled row for it; section rows (with a label) stay.
    ...totals.flatMap(([bucket, v]) => {
      const amount = num(v);
      const ops = [prisma.bidTotal.deleteMany({ where: { bidId: bid.id, bucket, label: '' } })];
      if (amount != null) ops.push(prisma.bidTotal.create({ data: { bidId: bid.id, bucket, amount, sortOrder: BUCKETS.indexOf(bucket) } }));
      return ops;
    }),
  ]);
  return NextResponse.json({ ok: true });
}
