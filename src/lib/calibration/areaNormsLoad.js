/**
 * Server-only: what areaNorms() learns from, and the "original questionnaire"
 * snapshot each project's area alerts compare against (ProjectAreaCheck).
 *
 * A job's area dollars count as real only when every figure behind them is
 * real (drawing, staff, fixtures, import, or marked "It's right"). Figures the
 * visitor typed count only inside the range the real jobs set; a budget built
 * on tool guesses never counts. Peer reviews are priced line by line, not by
 * this engine, so they are left out.
 */
import { prisma } from '@/lib/db';
import { calculateBudget } from '@/lib/calculations';
import { responsesToSections } from '@/lib/utils';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import { SITE_FEATURE_SELECT, engineProjectData } from '@/lib/siteFeatureRows';
import { REAL_SOURCES } from './figureNorms.js';
import { loadFigureRows } from './figureNormsLoad.js';
import { areaDollars, areaNorms, AREA_KEYS } from './areaNorms.js';

const BUDGET_SELECT = {
  id: true, buildingType: true, budgetType: true, pricingSnapshot: true,
  projectData: true, responses: true, ...SITE_FEATURE_SELECT,
};

function dollarsFor(project, defaultPricing) {
  const pricing = pricingForProject(project.pricingSnapshot, defaultPricing);
  const budget = calculateBudget(engineProjectData(project), responsesToSections(project.responses || []), pricing);
  return { dollars: areaDollars(budget), total: Number(budget?.totalWithControls) || 0 };
}

function trustOf(figures) {
  const list = Object.values(figures || {});
  if (list.some(f => f.source === 'guess' && !f.confirmed)) return null;
  return list.every(f => REAL_SOURCES.has(f.source) || f.confirmed) ? 'real' : 'client';
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // buildingType → { at, norms }

/** areaNorms() for one building type, cached five minutes. Never throws, {} on failure. */
export async function loadAreaNorms(buildingType) {
  if (!buildingType) return {};
  const hit = cache.get(buildingType);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.norms;
  try {
    const figRows = (await loadFigureRows()).filter(r => r.buildingType === buildingType);
    const trust = new Map(figRows.map(r => [r.id, { trust: trustOf(r.figures), units: r.units }]));
    const ids = figRows.filter(r => trust.get(r.id).trust).map(r => r.id);
    const projects = ids.length ? await prisma.project.findMany({
      where: { id: { in: ids }, budgetType: { not: 'peer_review' } }, select: BUDGET_SELECT,
    }) : [];
    const defaultPricing = await loadPricing();
    const rows = [];
    for (const p of projects) {
      try {
        const { dollars, total } = dollarsFor(p, defaultPricing);
        if (total > 0) rows.push({ buildingType, units: trust.get(p.id).units, trust: trust.get(p.id).trust, areas: dollars });
      } catch { /* one bad project must not sink the rest */ }
    }
    const norms = areaNorms(rows);
    cache.set(buildingType, { at: Date.now(), norms });
    return norms;
  } catch (e) {
    console.error('[area norms] load failed (non-fatal):', e?.message ?? e);
    return hit?.norms ?? {};
  }
}

/** { [area]: { baseAmount, baseUnits, baseFrom, okAmount } } for one project. */
export async function loadAreaChecks(projectId) {
  const rows = await prisma.projectAreaCheck.findMany({ where: { projectId } });
  const out = {};
  for (const r of rows) out[r.area] = { baseAmount: r.baseAmount, baseUnits: r.baseUnits, baseFrom: r.baseFrom, okAmount: r.okAmount };
  return out;
}

/**
 * Snapshot each area's dollars as "what the questionnaire said", once per
 * project, a later call is a no-op. from: 'web-request' | 'questionnaire'.
 * Skipped while the budget is still empty. Never throws.
 */
export async function takeAreaBaseline(projectId, from) {
  try {
    const taken = await prisma.projectAreaCheck.findFirst({ where: { projectId, baseTakenAt: { not: null } }, select: { id: true } });
    if (taken) return false;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: BUDGET_SELECT });
    if (!project || project.budgetType === 'peer_review') return false;
    const units = Number(project.projectData?.numUnits) || 0;
    const { dollars, total } = dollarsFor(project, await loadPricing());
    if (!(total > 0) || !(units > 0)) return false;
    const now = new Date();
    for (const area of AREA_KEYS) {
      const base = { baseAmount: dollars[area], baseUnits: Math.round(units), baseFrom: from, baseTakenAt: now };
      await prisma.projectAreaCheck.upsert({
        where: { projectId_area: { projectId, area } },
        update: base,
        create: { projectId, area, ...base },
      });
    }
    return true;
  } catch (e) {
    console.error('[area baseline] snapshot failed (non-fatal):', e?.message ?? e);
    return false;
  }
}
