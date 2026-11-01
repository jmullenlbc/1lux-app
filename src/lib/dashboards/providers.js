// Section data providers, the seam that keeps the dashboard engine MCP-independent.
// Today each section reads existing Prisma; later a section can swap to an MCP
// Function without any widget change. Returns rows shaped so the field catalog's
// dot-path `source`s resolve directly (e.g. a row's `client.name`, `salesOwner.name`).

import { prisma } from '@/lib/db';
import { sumCents } from '@/lib/money';
import { calculateBudget } from '@/lib/calculations';
import { responsesToSections } from '@/lib/utils';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import { SITE_FEATURE_SELECT, engineProjectData } from '@/lib/siteFeatureRows';
import { weightedRevenue, buyoutDays } from '@/lib/pipeline';

export async function getSectionRows(section) {
  switch (section) {
    case 'SALES': return getSalesRows();
    case 'MAIN':  return getMainRows();
    case 'BUDGET': return getBudgetRows();
    default: return [];
  }
}

// SALES, the pipeline (a project IS the pipeline entity).
async function getSalesRows() {
  const rows = await prisma.project.findMany({
    select: {
      id: true, name: true, contractValue: true, designContractValue: true,
      pipelineProbability: true, probabilityToWin: true, probabilityToMoveForward: true,
      projectType: true, serviceType: true, procurementStage: true,
      procurementStatus: true, designStage: true, designStatus: true,
      expectedOrderDate: true, expectedContractExecutionDate: true, projectSubtype: true, createdAt: true,
      client:     { select: { name: true } },
      salesOwner: { select: { name: true } },
      // Stage moves, for Buyout Duration (entering Buyout → entering CA / Procurement).
      activities: { where: { type: 'deal_stage' }, select: { type: true, metadata: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      // "Ordered" (Jason, Oct 5 call): the project has at least one Shipment
      // row, which is only ever created when a purchase order is placed. If
      // Maram's definition changes (for example, only shipments with a poDate),
      // change ORDERED_RULE below, nothing else.
      _count: { select: { shipments: true } },
    },
  });
  // Average Probability is derived (never stored), mean of the two entered values,
  // falling back to whichever is present, then the legacy single probability.
  // Weighted Revenue and Buyout Duration are derived the same way (Maram 9-17),
  // from the one definition in pipeline.js, so a dashboard tile and the CRM
  // board can never disagree.
  return rows.map(({ activities, _count, ...r }) => ({
    ...r,
    averageProbability: avgProbability(r),
    weightedRevenue:    weightedRevenue(r, 'PROCUREMENT'),
    weightedDesignFee:  weightedRevenue(r, 'DESIGN'),
    buyoutDays:         buyoutDays(r, activities),
    shipmentCount:      _count?.shipments || 0,
    hasPurchaseOrder:   ORDERED_RULE(_count?.shipments || 0) ? 'Yes' : 'No',
  }));
}

// The one place that says what "ordered" means on the Sales dashboards.
// Today: one or more Shipment rows on the project. Mike and Maram still have
// to confirm this (Oct 5 call); edit here and every card follows.
const ORDERED_RULE = (shipmentCount) => shipmentCount > 0;

function avgProbability(r) {
  const parts = [r.probabilityToWin, r.probabilityToMoveForward].filter(v => v != null && v !== '');
  if (parts.length) return Math.round(parts.reduce((a, b) => a + Number(b), 0) / parts.length);
  return r.pipelineProbability ?? null;
}

// MAIN, all projects (executive portfolio overview).
async function getMainRows() {
  return prisma.project.findMany({
    select: {
      id: true, name: true, phase: true, serviceType: true, projectType: true, status: true,
      contractValue: true, designContractValue: true, procurementStatus: true,
      createdAt: true, updatedAt: true,
      client:     { select: { name: true } },
      salesOwner: { select: { name: true } },
    },
  });
}

// BUDGET (Pre-con), one row per project's budget. A project's budget is its
// Conceptual, Design-questionnaire, or latest Bid-Matrix estimate (Mike's def).
// Dollar totals we can compute cheaply: the latest Bid Matrix (Σ item cnTotal)
// and the latest Design proposal fee. Conceptual $ needs the budget engine, a
// follow-up; counts/timing/client work today.
async function getBudgetRows() {
  const [projects, matrices, defaultPricing] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true, name: true, budgetType: true, serviceType: true, projectType: true,
        buildingType: true, pricingSnapshot: true, budgetSentDate: true, createdAt: true,
        client: { select: { name: true } },
        projectData: true, responses: true, ...SITE_FEATURE_SELECT,
      },
    }),
    prisma.designBidMatrix.findMany({ select: { projectId: true, version: true, items: { select: { cnTotal: true } } } }),
    loadPricing().catch(() => null),
  ]);

  // Latest bid matrix per project → sum of item cnTotal.
  const latestMatrix = {};
  for (const m of matrices) {
    const total = sumCents(m.items.map(i => i.cnTotal));
    if (!latestMatrix[m.projectId] || m.version >= latestMatrix[m.projectId].version) latestMatrix[m.projectId] = { version: m.version, total };
  }

  return projects.map(p => {
    // Product budget total, the same number the project summary shows
    // (Conceptual or Design-questionnaire depending on the project's inputs).
    let productBudgetTotal = 0;
    try {
      const pricing = pricingForProject(p.pricingSnapshot, defaultPricing);
      const sections = responsesToSections(p.responses);
      const projectData = engineProjectData(p);
      productBudgetTotal = calculateBudget(projectData, sections, pricing)?.totalWithControls || 0;
    } catch { productBudgetTotal = 0; }

    const bm = latestMatrix[p.id];
    const bidMatrixTotal = bm ? bm.total : 0;
    const hasBidMatrix = !!bm;

    // Priority: a *priced* Bid Matrix > Design Questionnaire > Conceptual.
    // (A draft/unpriced matrix, total 0, doesn't hide the conceptual number.)
    let budgetValue, budgetSource;
    if (bidMatrixTotal > 0)                  { budgetValue = bidMatrixTotal;     budgetSource = 'Bid Matrix'; }
    else if (p.budgetType === 'design')      { budgetValue = productBudgetTotal; budgetSource = 'Design Questionnaire'; }
    else if (p.budgetType === 'peer_review') { budgetValue = productBudgetTotal; budgetSource = 'Peer Review'; }
    else                                     { budgetValue = productBudgetTotal; budgetSource = 'Conceptual'; }

    return {
      id: p.id, name: p.name, budgetType: p.budgetType, serviceType: p.serviceType,
      projectType: p.projectType, budgetSentDate: p.budgetSentDate, createdAt: p.createdAt,
      client: p.client,
      conceptualTotal: productBudgetTotal, bidMatrixTotal, budgetValue, budgetSource,
      hasBidMatrix: hasBidMatrix ? 'Yes' : 'No',
    };
  });
}
