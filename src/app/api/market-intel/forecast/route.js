import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rollupUnits, withinMonths } from '@/lib/market-intel/forecast';
import { normalizeTagName } from '@/lib/market-intel/tagRules';

// GET /api/market-intel/forecast?by=company|metro|state&months=12[&metro=Denver, CO][&state=CO]
// Units stated in articles, rolled up in code (forecast.js). A project counts
// once per group at its largest printed figure, so five articles about one
// 342-unit building do not become 1,710 units.
export async function GET(request) {
  const { error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const by     = ['company', 'metro', 'state'].includes(searchParams.get('by')) ? searchParams.get('by') : 'company';
  const months = Math.min(60, Math.max(1, parseInt(searchParams.get('months') || '12', 10)));

  const where = { unitCount: { not: null }, reviewStatus: { not: 'DISMISSED' } };
  const scope = [];
  for (const [kind, param] of [['METRO', 'metro'], ['STATE', 'state']]) {
    const v = searchParams.get(param)?.trim();
    if (v) scope.push({ tags: { some: { tag: { kind, normalized: normalizeTagName(v, kind) } } } });
  }
  if (scope.length) where.AND = scope;

  const signals = await prisma.marketSignal.findMany({
    where,
    select: { id: true, unitCount: true, publishedAt: true, tags: { select: { tag: { select: { kind: true, name: true, normalized: true, clientId: true } } } } },
    orderBy: { publishedAt: 'desc' },
    take: 5000,
  });

  const inWindow = withinMonths(signals, months);
  const rows     = rollupUnits(inWindow, by);
  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  return NextResponse.json({ by, months, articles: inWindow.length, rows, totalUnits });
}
