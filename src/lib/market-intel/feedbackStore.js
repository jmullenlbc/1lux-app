// "Not relevant" learning (migration 0130, Mike 10-9): the DB side of
// feedbackRules.js. Recomputes the proposed rules from every feedback row and
// keeps the SuppressionRule table in step, without ever touching a rule an
// admin already applied or ignored.
import { prisma } from '@/lib/db';
import { proposeRules, featureKeys } from './feedbackRules';

/**
 * "Kept" counts: matching rows a person reviewed, assigned or linked instead of
 * dismissing. Counted per (kind, field, value) the feedback rows vote on.
 */
async function keptCounts(keys) {
  const out = {};
  for (const k of keys) {
    const id = `${k.kind}|${k.field}|${k.value}`;
    if (out[id] !== undefined) continue;
    const where = { kind: k.kind, OR: [{ reviewStatus: 'REVIEWED' }, { assignedToId: { not: null } }, { linkedClientId: { not: null } }] };
    if (k.field === 'SOURCE')            where.sourceId     = k.value;
    else if (k.field === 'PERMIT_CLASS') where.permitClass  = k.value;
    else if (k.field === 'CITY')         where.city         = k.value;
    else if (k.field === 'ZONE')         where.neighborhood = k.value;
    else if (k.field === 'COMPANY')      where.tags = { some: { tag: { kind: 'COMPANY', normalized: k.value } } };
    out[id] = await prisma.marketSignal.count({ where });
  }
  return out;
}

/** Re-propose rules from all feedback. Returns how many rules are PROPOSED now. */
export async function refreshProposedRules() {
  const feedback = await prisma.signalFeedback.findMany({
    select: { signalId: true, reasonCode: true, kind: true, sourceId: true, city: true, state: true, permitClass: true, zone: true, company: true },
  });
  const keys = feedback.flatMap(featureKeys);
  const kept = await keptCounts(keys);
  const proposed = proposeRules(feedback, kept);
  for (const r of proposed) {
    const existing = await prisma.suppressionRule.findUnique({ where: { kind_field_value: { kind: r.kind, field: r.field, value: r.value } } });
    if (!existing) {
      await prisma.suppressionRule.create({ data: { kind: r.kind, field: r.field, value: r.value, reasonCode: r.reasonCode, dismissals: r.dismissals, kept: r.kept } });
    } else {
      // Counts move; a decision an admin made stays.
      await prisma.suppressionRule.update({ where: { id: existing.id }, data: { dismissals: r.dismissals, kept: r.kept, reasonCode: existing.status === 'PROPOSED' ? r.reasonCode : existing.reasonCode } });
    }
  }
  return prisma.suppressionRule.count({ where: { status: 'PROPOSED', archivedAt: null } });
}
