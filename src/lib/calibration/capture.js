/**
 * calibration/capture.js — write calibration samples for a project.
 *
 * The engine run is re-done here from the stored project (same inputs the
 * budget page uses, same pricing snapshot) so every capture is consistent
 * no matter which route triggered it. Rows the ENGINE wrote ('engine' —
 * model figures, and the hand-built actuals that ride on the project itself,
 * e.g. exteriorManualItems.pathwayLighting) are replaced on every capture.
 * Rows a person recorded ('actual') are never touched here.
 *
 * A priced Bid Matrix is the best "actual" the platform already has for the
 * total, so it is captured too ('bidmatrix').
 */
import { prisma } from '@/lib/db';
import { calculateBudget } from '@/lib/calculations';
import { responsesToSections } from '@/lib/utils';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import { buildSamples } from './lines.js';

const REPLACED_SOURCES = ['engine', 'bidmatrix'];
const THROTTLE_MS = 10 * 60 * 1000;

const PROJECT_SELECT = {
  id: true, name: true, buildingType: true, pricingSnapshot: true, serviceType: true, projectType: true,
  projectData: true, responses: true,
  designBidMatrices: { select: { version: true, items: { select: { cnTotal: true } } } },
};

function bidMatrixTotal(matrices) {
  let best = null;
  for (const m of matrices || []) {
    if (!best || m.version >= best.version) best = m;
  }
  if (!best) return null;
  const total = best.items.reduce((s, i) => s + (Number(i.cnTotal) || 0), 0);
  return total > 0 ? total : null;
}

/** Compute the sample rows for one loaded project (no writes). */
export async function samplesForProject(project, defaultPricing) {
  const pricing = pricingForProject(project.pricingSnapshot, defaultPricing || await loadPricing());

  const sections    = responsesToSections(project.responses || []);
  const projectData = { ...(project.projectData || {}), buildingTypeKey: project.buildingType };
  const budget      = calculateBudget(projectData, sections, pricing);

  const rows = buildSamples({ projectData, sections, budget, pricing })
    .map(r => ({ ...r, source: 'engine' }));

  const bid = bidMatrixTotal(project.designBidMatrices);
  if (bid != null) {
    rows.push({
      source: 'bidmatrix', lineKey: 'total',
      quantity: projectData.grossSf > 0 ? Number(projectData.grossSf) : null,
      quantityUnit: projectData.grossSf > 0 ? 'sf' : null,
      modelAmount: Math.round((budget.totalWithControls || 0) * 100) / 100,
      actualAmount: Math.round(bid * 100) / 100,
      rateUsed: projectData.grossSf > 0 ? (budget.totalWithControls || 0) / Number(projectData.grossSf) : null,
      impliedRate: projectData.grossSf > 0 ? bid / Number(projectData.grossSf) : null,
      buildingType: project.buildingType || null,
      siteDesignLevel: sections.exterior?.siteDesignLevel === 'solar' ? 'solar' : 'conventional',
      pricingKey: null,
      note: 'latest priced Bid Matrix total vs budget total',
    });
  }
  return rows;
}

/** Replace the engine/bidmatrix samples for one project. Returns the row count. */
export async function captureProject(projectId, { defaultPricing } = {}) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: PROJECT_SELECT });
  if (!project) return 0;
  const rows = await samplesForProject(project, defaultPricing);
  await prisma.$transaction([
    prisma.calibrationSample.deleteMany({ where: { projectId, source: { in: REPLACED_SOURCES } } }),
    prisma.calibrationSample.createMany({
      data: rows.map(({ pricingKey, ...r }) => ({
        projectId, ...r,
        // pricingKey is derived, not stored — the report re-derives it from lineKey
        note: [r.note, pricingKey ? `key:${pricingKey}` : null].filter(Boolean).join(' · ') || null,
      })),
    }),
  ]);
  return rows.length;
}

/** Every project → samples. Used by the admin backfill. */
export async function captureAll() {
  const defaultPricing = await loadPricing();
  const projects = await prisma.project.findMany({ select: { id: true } });
  let samples = 0, failed = 0;
  for (const p of projects) {
    try { samples += await captureProject(p.id, { defaultPricing }); }
    catch (e) { failed++; console.error('[calibration] capture failed', p.id, e?.message ?? e); }
  }
  return { projects: projects.length, samples, failed };
}

/**
 * Fire-and-forget capture for request paths. Saves pass minIntervalMs=0 so
 * the sample always reflects the latest answers; read paths keep the default
 * throttle so a page polling the budget does not rewrite rows.
 */
export function captureQuietly(projectId, { minIntervalMs = THROTTLE_MS } = {}) {
  (async () => {
    try {
      if (minIntervalMs > 0) {
        const last = await prisma.calibrationSample.findFirst({
          where: { projectId, source: 'engine' }, orderBy: { capturedAt: 'desc' }, select: { capturedAt: true },
        });
        if (last && Date.now() - new Date(last.capturedAt).getTime() < minIntervalMs) return;
      }
      await captureProject(projectId);
    } catch (e) {
      console.error('[calibration] quiet capture failed', projectId, e?.message ?? e);
    }
  })();
}

/**
 * Load every sample joined with the project context the report filters on.
 * pricingKey is re-derived from the note tag so the table can offer "apply".
 */
export async function loadSamplesWithContext() {
  const rows = await prisma.calibrationSample.findMany({
    include: { project: { select: { name: true, serviceType: true, projectType: true, buildingType: true, client: { select: { name: true } } } } },
    orderBy: { capturedAt: 'desc' },
  });
  return rows.map(r => {
    const m = /key:([A-Za-z0-9_.]+)/.exec(r.note || '');
    return {
      ...r,
      pricingKey:   m ? m[1] : null,
      note:         (r.note || '').replace(/\s*·?\s*key:[A-Za-z0-9_.]+/, '').trim() || null,
      projectName:  r.project?.name || null,
      clientName:   r.project?.client?.name || null,
      serviceType:  r.project?.serviceType || null,
      projectType:  r.project?.projectType || null,
      buildingType: r.buildingType || r.project?.buildingType || null,
      project:      undefined,
    };
  });
}
