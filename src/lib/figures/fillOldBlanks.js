/**
 * Server-only: older projects get "blank = we estimate it" the first time
 * they are opened (Mike 10-17: "Yes", fill old projects at once instead of
 * waiting for the next Project Info save). Fills only boxes that are truly
 * empty; typed figures (0 included) and earlier estimates are left alone, so
 * after the first open there is nothing left to fill and it costs one check.
 * Never throws: a failed fill must not stop the page from opening.
 */
import { estimateBlankFigures, figuresStillNeeded, ESTIMATED_FIELDS, ESTIMATING_BUDGET_TYPES } from './estimateBlanks';
import { recordFigureSources } from './record';
import { loadAdoptedGuesses } from '@/lib/calibration/figureNormsLoad';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import { logActivity } from '@/lib/activity';

// `project` must carry `projectData`; it is updated in place so the page
// prices on the filled figures. Returns the fields filled.
export async function fillOldBlanks(db, project, user) {
  try {
    const pd = project?.projectData;
    if (!pd || project.archivedAt || !ESTIMATING_BUDGET_TYPES.has(project.budgetType)) return [];
    if (!ESTIMATED_FIELDS.some(f => pd[f] == null)) return [];
    const guessRows = await db.projectFigureSource.findMany({
      where: { projectId: project.id, source: 'guess' }, select: { field: true },
    });
    const guessed = new Set(guessRows.map(r => r.field));
    if (figuresStillNeeded(pd, project.buildingType, guessed).length) return [];

    const { values } = estimateBlankFigures(pd, project.buildingType, {
      guessed,
      adopted: await loadAdoptedGuesses(),
      pricing: pricingForProject(project.pricingSnapshot, await loadPricing()),
    });
    const fill = Object.fromEntries(Object.entries(values).filter(([f]) => pd[f] == null));
    const fields = Object.keys(fill);
    if (!fields.length) return [];

    await db.projectData.update({ where: { projectId: project.id }, data: fill });
    Object.assign(pd, fill);
    await recordFigureSources(db, project.id, fields, 'guess', user?.id ?? null);
    if (user?.id) await logActivity(project.id, user, 'project_data', `Estimated ${fields.length} blank figure${fields.length === 1 ? '' : 's'} in Project Data`, { changed: fields });
    return fields;
  } catch (e) {
    console.error('[fill old blanks] skipped (non-fatal):', e?.message ?? e);
    return [];
  }
}
