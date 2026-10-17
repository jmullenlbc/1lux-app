/**
 * Meeting Prep, one budget figure per job (Mike, 2026-09-14: "Budgets of
 * those jobs").
 *
 * The same rule the Budget dashboard uses (src/lib/dashboards/providers.js):
 * a priced Bid Matrix wins; otherwise the budget engine's total for the job's
 * Conceptual or Design-questionnaire answers. These are SELL figures, what
 * the client would pay. DN / buy price is never read or returned here.
 *
 * Returns { [projectId]: { total, source } } for jobs with a budget above zero.
 */
import { prisma } from '@/lib/db';
import { calculateBudget } from '@/lib/calculations';
import { responsesToSections } from '@/lib/utils';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import { SITE_FEATURE_SELECT, engineProjectData } from '@/lib/siteFeatureRows';

const SOURCE = { design: 'Design Questionnaire', peer_review: 'Peer Review' };

export async function budgetTotals(projectIds) {
  const ids = [...new Set((projectIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const [projects, matrices, defaultPricing] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: ids } },
      select: { id: true, budgetType: true, buildingType: true, pricingSnapshot: true, projectData: true, responses: true, ...SITE_FEATURE_SELECT },
    }),
    prisma.designBidMatrix.findMany({
      where: { projectId: { in: ids } },
      select: { projectId: true, version: true, items: { select: { cnTotal: true } } },
    }),
    loadPricing().catch(() => null),
  ]);

  const latestMatrix = {};
  for (const m of matrices) {
    const total = m.items.reduce((s, i) => s + (i.cnTotal || 0), 0);
    if (!latestMatrix[m.projectId] || m.version >= latestMatrix[m.projectId].version) {
      latestMatrix[m.projectId] = { version: m.version, total };
    }
  }

  const out = {};
  for (const p of projects) {
    const bm = latestMatrix[p.id];
    if (bm && bm.total > 0) { out[p.id] = { total: bm.total, source: 'Bid Matrix' }; continue; }
    let total = 0;
    try {
      const pricing = pricingForProject(p.pricingSnapshot, defaultPricing);
      const projectData = engineProjectData(p);
      total = calculateBudget(projectData, responsesToSections(p.responses), pricing)?.totalWithControls || 0;
    } catch { total = 0; }
    if (total > 0) out[p.id] = { total, source: SOURCE[p.budgetType] || 'Conceptual' };
  }
  return out;
}
