/**
 * Every conceptual budget becomes a real project (Mike, 2026-10-03), with the
 * "Conceptual Budget" service type, in the Qualified stage (the default), and
 * the number the visitor was shown saved as the first step of the number
 * ladder (budgetAmounts.js).
 *
 * Three doors in, one way through:
 *   - a visitor sends the public form (api/intake/submit), unless it looks like
 *     a job we already have; then staff decide, as before
 *   - staff press "This is a new job" on a request (admin/intake create-project)
 *   - a visitor stops part way and leaves for a day (sweepUnfinishedDrafts):
 *     the project is made anyway and Sales is told it was unfinished
 *
 * Server-only.
 */
import { createProject } from '@/lib/projects/createProject';
import { BUILDING_TYPES } from '@/lib/utils';
import { loadPricing } from '@/lib/pricingLoader';
import { loadAdoptedGuesses } from '@/lib/calibration/figureNormsLoad';
import { logActivity } from '@/lib/activity';
import { captureQuietly } from '@/lib/calibration/capture';
import { takeAreaBaseline } from '@/lib/calibration/areaNormsLoad';
import { writeSiteFeature } from '@/lib/siteFeatureRows';
import { planHandoff, applyHandoff } from '@/lib/intake/handoff';
import { recordBudgetAmount } from '@/lib/budgetAmounts';
import { notifyUsers } from '@/lib/alerts';
import { inDepartment, SALES_MARKETING } from '@/lib/departments';
import { findLikelyProject } from '@/lib/intake/duplicateMatch';
import { unpackDraft, reachedLabel } from '@/lib/intake/drafts';
import { unfinishedDraftWhere, draftAnswers, draftAsRequest, SWEEP_BATCH } from '@/lib/intake/unfinishedDrafts';

export const CONCEPTUAL_SERVICE_TYPE = 'conceptual';

/**
 * Who a project made by the website belongs to. A project needs a creator and
 * the website is not a person, so it is the longest-standing active admin.
 */
export async function automaticOwner(db) {
  const owner = await db.user.findFirst({
    where: { isActive: true, role: { in: ['ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return owner ? { id: owner.id, name: 'Automatic (web budget)', email: null } : null;
}

/** Works out the figures before the project exists. Never throws. */
export async function planFromWeb({ answers, drawings }) {
  try {
    return planHandoff({ answers, drawings, pricing: await loadPricing(), adopted: await loadAdoptedGuesses() });
  } catch (e) {
    console.error('[conceptualProjects] could not read the figures (non-fatal):', e?.message || e);
    return null;
  }
}

/**
 * Writes everything the web budget told us onto a project and saves the
 * number the visitor was shown. Never throws: returns what carried, or false.
 */
export async function carryWebFigures(db, project, plan, { actor, source, note, submissionId = null, draftId = null }) {
  let carried = plan ? null : false;
  try {
    if (plan?.ready) {
      carried = await applyHandoff(db, project.id, plan, { writeSiteFeature });
      await logActivity(project.id, actor, 'project_data',
        `${note}: ${carried.fields} building figures, ${carried.answers} questionnaire answers${carried.features ? `, ${carried.features} site features` : ''}`,
        { source: 'intake', submissionId, draftId });
      captureQuietly(project.id, { minIntervalMs: 0 });
      await takeAreaBaseline(project.id, source);
    }
  } catch (e) {
    console.error('[conceptualProjects] hand-off failed (non-fatal):', e?.message || e);
    carried = false;
  }
  try {
    if (plan?.total) {
      await recordBudgetAmount(db, {
        projectId: project.id, tier: 'conceptual', amount: plan.total, source,
        recordedById: actor?.id || null,
      });
    }
  } catch (e) {
    console.error('[conceptualProjects] conceptual number not saved (non-fatal):', e?.message || e);
  }
  return carried;
}

/** Makes the project. The building type comes from the figures when it is one of ours. */
export async function makeConceptualProject(db, { ownerId, plan, fields }) {
  const isType = v => BUILDING_TYPES.some(t => t.value === v);
  const buildingType = isType(plan?.buildingTypeKey) ? plan.buildingTypeKey
    : isType(fields.buildingType) ? fields.buildingType : null;
  return createProject(db, ownerId, {
    ...fields,
    buildingType,
    budgetType: 'conceptual',
    serviceType: CONCEPTUAL_SERVICE_TYPE,
  });
}

async function salesIds(db) {
  const sales = await db.user.findMany({ where: { isActive: true, ...inDepartment(SALES_MARKETING) }, select: { id: true } });
  return sales.map(u => u.id);
}

/**
 * Turns unfinished public budgets into projects and tells Sales. Each draft is
 * claimed first (abandonedAlertedAt), so two sweeps at once can never make two
 * projects. A draft that looks like a job we already have is not made again;
 * Sales is told which job it looks like.
 */
export async function sweepUnfinishedDrafts(db, { now = new Date() } = {}) {
  const drafts = await db.conceptualDraft.findMany({
    where: unfinishedDraftWhere(now),
    orderBy: { lastSavedAt: 'asc' },
    take: SWEEP_BATCH,
    include: { fields: true },
  });
  if (!drafts.length) return { made: 0, matched: 0 };

  const owner = await automaticOwner(db);
  if (!owner) return { made: 0, matched: 0, error: 'No active admin to own the projects.' };
  const notify = await salesIds(db);
  const projects = await db.project.findMany({ select: { id: true, name: true, city: true, state: true, clientId: true, contactEmail: true } });

  let made = 0, matched = 0;
  for (const d of drafts) {
    const claim = await db.conceptualDraft.updateMany({ where: { id: d.id, abandonedAlertedAt: null }, data: { abandonedAlertedAt: now } });
    if (claim.count !== 1) continue;
    const stoppedAt = reachedLabel(d);
    const who = `${d.firstName} ${d.lastName}`.trim();
    try {
      const match = findLikelyProject(draftAsRequest(d), projects);
      if (match) {
        matched++;
        const job = projects.find(p => p.id === match.projectId);
        await notifyUsers(notify, {
          type: 'UNFINISHED_WEB_BUDGET',
          title: `Unfinished web budget: ${d.projectName}`,
          message: `${who} (${d.email}) stopped at ${stoppedAt}. Looks like ${job?.name || 'a job we already have'}, so no new project was made.`,
          link: job ? `/project/${job.id}` : '/admin/intake',
          dedupeKey: `draft-abandoned:${d.id}`,
        }, { db });
        continue;
      }

      const u = unpackDraft(d, d.fields);
      const plan = await planFromWeb({ answers: draftAnswers(u), drawings: u.drawings });
      const project = await makeConceptualProject(db, {
        ownerId: owner.id, plan,
        fields: {
          name: d.projectName, city: d.city, state: d.state, zip: d.zip,
          buildingType: d.buildingType, contactName: who, contactEmail: d.email,
        },
      });
      await db.conceptualDraft.update({ where: { id: d.id }, data: { projectId: project.id } });
      await logActivity(project.id, owner, 'project_created',
        `Made from an unfinished web budget. ${who} stopped at ${stoppedAt} and did not send it.`,
        { source: 'intake', draftId: d.id });
      const carried = await carryWebFigures(db, project, plan, {
        actor: owner, source: 'unfinished-draft', note: 'Carried over from the unfinished web budget', draftId: d.id,
      });
      made++;
      await notifyUsers(notify, {
        type: 'UNFINISHED_WEB_BUDGET',
        title: `Unfinished web budget: ${d.projectName}`,
        message: `${who} (${d.email}) stopped at ${stoppedAt}. A project was made so the lead is not lost${carried ? '' : '; the figures need entering'}.`,
        link: `/project/${project.id}`,
        dedupeKey: `draft-abandoned:${d.id}`,
      }, { db });
      projects.push({ id: project.id, name: project.name, city: project.city, state: project.state, clientId: null, contactEmail: project.contactEmail });
    } catch (e) {
      console.error('[conceptualProjects] unfinished draft failed (non-fatal):', d.id, e?.message || e);
    }
  }
  return { made, matched };
}

// Page loads and draft saves run the sweep at most this often per server.
const SWEEP_EVERY_MS = 10 * 60 * 1000;
let lastSweep = 0;

/** The sweep, throttled, never throws. For page loads; the cron calls the sweep directly. */
export async function sweepUnfinishedDraftsQuietly(db) {
  const t = Date.now();
  if (t - lastSweep < SWEEP_EVERY_MS) return null;
  lastSweep = t;
  try { return await sweepUnfinishedDrafts(db); }
  catch (e) { console.error('[conceptualProjects] sweep failed (non-fatal):', e?.message || e); return null; }
}
