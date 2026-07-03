import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Recent automation fires + per-rule outcome summary (the learning loop's review surface).
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const [recent, byOutcome] = await Promise.all([
    prisma.automationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.automationLog.groupBy({ by: ['ruleId', 'ruleName', 'outcome'], _count: { _all: true } }),
  ]);

  // Roll up per rule: fires + accepted/edited/rejected counts.
  const summaryMap = new Map();
  for (const row of byOutcome) {
    const key = row.ruleId || 'BASELINE';
    const s = summaryMap.get(key) || { ruleId: row.ruleId, ruleName: row.ruleName || 'Baseline', fired: 0, accepted: 0, edited: 0, rejected: 0, pending: 0 };
    const c = row._count._all;
    s.fired += c;
    if (row.outcome === 'ACCEPTED') s.accepted += c;
    else if (row.outcome === 'EDITED') s.edited += c;
    else if (row.outcome === 'REJECTED') s.rejected += c;
    else if (row.outcome === 'PENDING') s.pending += c;
    summaryMap.set(key, s);
  }
  const summary = [...summaryMap.values()].sort((a, b) => b.fired - a.fired);

  return NextResponse.json({ recent, summary });
}
