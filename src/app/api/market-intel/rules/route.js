import { NextResponse } from 'next/server';
import { requireAuth, isSalesAdmin } from '@/lib/auth';
import { actsAsAdmin } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { describeRule, ruleMatches, featuresOf, notRelevantRate } from '@/lib/market-intel/feedbackRules';

// Learned rules (migration 0130, Mike 10-9). GET lists what the system
// proposes and what was decided; PATCH applies or ignores one. Only a Sales
// Admin (or an admin) decides; nothing is ever applied on its own.

const RULE_INCLUDE = { decidedBy: { select: { id: true, name: true } } };

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [rules, sources, dismissed, reviewed] = await Promise.all([
    prisma.suppressionRule.findMany({ where: { archivedAt: null }, include: RULE_INCLUDE, orderBy: [{ status: 'asc' }, { dismissals: 'desc' }] }),
    prisma.marketSource.findMany({ select: { id: true, name: true } }),
    prisma.signalFeedback.count({ where: { createdAt: { gte: weekAgo } } }),
    // Rows a person kept this week: reviewed, converted, assigned or linked.
    prisma.marketSignal.count({ where: { updatedAt: { gte: weekAgo }, OR: [{ reviewStatus: { in: ['REVIEWED', 'CONVERTED'] } }, { assignedAt: { gte: weekAgo } }] } }).catch(() => 0),
  ]);
  const sourceName = new Map(sources.map(s => [s.id, s.name]));
  const out = rules.map(r => ({
    ...r,
    sourceName:  r.field === 'SOURCE' ? sourceName.get(r.value) || null : null,
    description: describeRule(r, { sourceName: sourceName.get(r.value) }),
  }));
  return NextResponse.json({ rules: out, week: { dismissed, reviewed, rate: notRelevantRate({ dismissed, reviewed }) } });
}

export async function PATCH(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!isSalesAdmin(user) && !actsAsAdmin(user)) {
    return NextResponse.json({ error: 'Only a Sales Admin or an admin can apply or ignore a rule' }, { status: 403 });
  }

  const { id, status } = await request.json().catch(() => ({}));
  if (!id || !['APPLIED', 'IGNORED', 'PROPOSED'].includes(status)) {
    return NextResponse.json({ error: 'id and status (APPLIED, IGNORED or PROPOSED) are required' }, { status: 400 });
  }
  const rule = await prisma.suppressionRule.findUnique({ where: { id } });
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.suppressionRule.update({
    where: { id },
    data:  { status, decidedById: status === 'PROPOSED' ? null : user.id, decidedAt: status === 'PROPOSED' ? null : new Date() },
    include: RULE_INCLUDE,
  });

  // Applying also clears the unreviewed rows the rule already covers.
  let cleared = 0;
  if (status === 'APPLIED') {
    const rows = await prisma.marketSignal.findMany({
      where:   { reviewStatus: 'UNREVIEWED', ...(rule.kind === 'ALL' ? {} : { kind: rule.kind }) },
      select:  { id: true, kind: true, sourceId: true, city: true, state: true, permitClass: true, neighborhood: true, unitCount: true, valuation: true, tags: { select: { role: true, tag: { select: { kind: true, normalized: true } } } } },
    });
    const ids = rows.filter(r => ruleMatches(rule, featuresOf(r))).map(r => r.id);
    if (ids.length) {
      await prisma.marketSignal.updateMany({ where: { id: { in: ids } }, data: { reviewStatus: 'DISMISSED' } });
      await prisma.suppressionRule.update({ where: { id }, data: { hits: { increment: ids.length } } });
    }
    cleared = ids.length;
  }
  return NextResponse.json({ rule: updated, cleared });
}
