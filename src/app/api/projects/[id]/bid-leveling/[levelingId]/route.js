import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { guardLeveling } from '@/lib/bidLeveling/guard';
import { loadLevelingView } from '@/lib/bidLeveling/load';

// GET /api/projects/[id]/bid-leveling/[levelingId]  bids plus matrix, totals, flags, suggestions
export async function GET(request, { params }) {
  const g = await guardLeveling(params);
  if (g.error) return g.error;
  const view = await loadLevelingView(params.levelingId);
  if (!view) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(view);
}

const MODES = new Set(['RATIO', 'AS_QUOTED', 'FLAT']);
const numOrNull = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

// PATCH  { name?, baselineBidId?, freightMode?, freightFlat?, whMode?, whFlat?, taxRate?, taxBase?, archived? }
// Archive only: { archived: true } hides it, nothing is deleted.
export async function PATCH(request, { params }) {
  const g = await guardLeveling(params);
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  const data = {};
  if (typeof b.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 120);
  if ('baselineBidId' in b) {
    if (b.baselineBidId) {
      const bid = await prisma.bid.findFirst({ where: { id: b.baselineBidId, levelingId: g.leveling.id, archivedAt: null }, select: { id: true } });
      if (!bid) return NextResponse.json({ error: 'That bid is not on this leveling' }, { status: 400 });
    }
    data.baselineBidId = b.baselineBidId || null;
  }
  if (MODES.has(b.freightMode)) data.freightMode = b.freightMode;
  if (MODES.has(b.whMode)) data.whMode = b.whMode;
  if ('freightFlat' in b) data.freightFlat = numOrNull(b.freightFlat);
  if ('whFlat' in b) data.whFlat = numOrNull(b.whFlat);
  if ('taxRate' in b) {
    const t = numOrNull(b.taxRate);
    // People type 8.6 meaning 8.6%; store the fraction.
    data.taxRate = t == null ? null : t > 1 ? t / 100 : t;
  }
  if (b.taxBase === 'FIXTURES' || b.taxBase === 'FIXTURES_CONTROLS') data.taxBase = b.taxBase;
  if (b.archived === true) data.archivedAt = new Date();
  const leveling = await prisma.bidLeveling.update({ where: { id: g.leveling.id }, data });
  return NextResponse.json({ leveling });
}
