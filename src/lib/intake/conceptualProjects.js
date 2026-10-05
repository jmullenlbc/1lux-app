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
import { planHandoff, applyHandoff, drawingsFromSubmission } from '@/lib/intake/handoff';
import { recordBudgetAmount } from '@/lib/budgetAmounts';
import { notifyUsers } from '@/lib/alerts';
import { findLikelyProject } from '@/lib/intake/duplicateMatch';
import { unpackDraft, reachedLabel } from '@/lib/intake/drafts';
import { salesIds, settleWebPerson, linkPeopleToProject, tellSalesAboutReviews, askOnce } from '@/lib/intake/webPeople';
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

const SUBMISSION_INCLUDE = {
  reviewedBy: { select: { name: true } },
  client: { select: { id: true, name: true } },
  duplicateMatch: { select: { id: true, name: true } },
  suggestedProject: { select: { id: true, name: true, city: true, state: true, zip: true } },
};

/**
 * Staff say a web request is a new job ("This is a new job" on the request, or
 * "Different job" on My Desk). Makes the project, carries the figures, puts
 * the company and person on it and marks the request done.
 * Returns { project, carried, submission } or { error, status }.
 */
export async function projectFromSubmission(db, submissionId, user) {
  const submission = await db.conceptualSubmission.findUnique({ where: { id: submissionId }, include: { answers: true } });
  if (!submission) return { error: 'Request not found', status: 404 };
  if (submission.duplicateMatchId) return { error: 'This request is already linked to a project.', status: 409 };

  // Everything the request already told us, worked out BEFORE the project
  // exists, so the project is created with the right building type.
  const plan = await planFromWeb({ answers: submission.answers, drawings: drawingsFromSubmission(submission) });
  const project = await makeConceptualProject(db, {
    ownerId: user.id, plan,
    fields: {
      name:         submission.proposedName,
      buildingType: submission.buildingType,
      city:         submission.city,
      state:        submission.state,
      zip:          submission.zip,
      contactName:  submission.submitterName,
      contactEmail: submission.submitterEmail,
      clientId:     submission.clientId,
    },
  });
  const carried = await carryWebFigures(db, project, plan, {
    actor: user, source: 'web-request', note: 'Carried over from the web budget request', submissionId: submission.id,
  });
  await linkPeopleQuietly(db, project.id, submission);

  const line = `Created project ${project.name} (${project.budgetNumber}) from this request.`
    + (carried ? ` Carried over ${carried.fields} building figures and ${carried.answers} answers.`
      : carried === false ? ' The building figures did not carry over; please enter them on the project.' : '');
  const updated = await db.conceptualSubmission.update({
    where: { id: submission.id },
    data: {
      duplicateMatchId: project.id,
      status: 'APPROVED',
      // Making a new job is a "no, it's not that one" to any guess.
      suggestionDismissedAt: submission.suggestedProjectId ? new Date() : submission.suggestionDismissedAt,
      reviewNote: submission.reviewNote ? `${submission.reviewNote}\n${line}` : line,
      reviewedById: user.id,
    },
    include: SUBMISSION_INCLUDE,
  });
  return { project, carried, submission: updated };
}

/** The company and person onto a project. Never throws. */
export async function linkPeopleQuietly(db, projectId, from) {
  try { return await linkPeopleToProject(db, projectId, { clientId: from?.clientId, contactId: from?.contactId }); }
  catch (e) { console.error('[conceptualProjects] could not put the company and person on the project (non-fatal):', e?.message || e); return null; }
}

/**
 * The company and person behind a web budget (webPeople.js). Never throws;
 * a look alike becomes a question on My Desk and Sales is told.
 */
export async function settleQuietly(db, input, opts) {
  try {
    const out = await settleWebPerson(db, input, opts);
    await tellSalesAboutReviews(db, out.reviews, [input.firstName, input.lastName].filter(Boolean).join(' ') || input.email);
    return out;
  } catch (e) {
    console.error('[conceptualProjects] company and person not settled (non-fatal):', e?.message || e);
    return { clientId: opts?.clientId || null, contactId: null, reviews: [] };
  }
}

/**
 * An unfinished public budget becomes a project. `d` carries its fields.
 * Returns { project, carried }.
 */
export async function projectFromDraft(db, d, owner) {
  const who = `${d.firstName} ${d.lastName}`.trim();
  const u = unpackDraft(d, d.fields);
  const plan = await planFromWeb({ answers: draftAnswers(u), drawings: u.drawings });
  const project = await makeConceptualProject(db, {
    ownerId: owner.id, plan,
    fields: {
      name: d.projectName, city: d.city, state: d.state, zip: d.zip,
      buildingType: d.buildingType, contactName: who, contactEmail: d.email, clientId: d.clientId || null,
    },
  });
  await db.conceptualDraft.update({ where: { id: d.id }, data: { projectId: project.id } });
  await logActivity(project.id, owner, 'project_created',
    `Made from an unfinished web budget. ${who} stopped at ${reachedLabel(d)} and did not send it.`,
    { source: 'intake', draftId: d.id });
  const carried = await carryWebFigures(db, project, plan, {
    actor: owner, source: 'unfinished-draft', note: 'Carried over from the unfinished web budget', draftId: d.id,
  });
  await linkPeopleQuietly(db, project.id, d);
  return { project, carried };
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
      // Drafts saved before 0117 never had their company and person made.
      if (!d.clientId && !d.contactId) {
        const s = await settleQuietly(db, {
          firstName: d.firstName, lastName: d.lastName, email: d.email, companyName: d.company,
          emailDomain: d.emailDomain, draftId: d.id, projectName: d.projectName,
        }, { creatorId: owner.id });
        await db.conceptualDraft.update({ where: { id: d.id }, data: { clientId: s.clientId, contactId: s.contactId } });
        d.clientId = s.clientId; d.contactId = s.contactId;
      }
      const match = findLikelyProject(draftAsRequest(d), projects);
      if (match) {
        matched++;
        const job = projects.find(p => p.id === match.projectId);
        await askOnce(db, {
          kind: 'project', existingProjectId: match.projectId, reason: `Looks like ${job?.name || 'a job we already have'}: ${match.reason}.`,
          firstName: d.firstName, lastName: d.lastName, email: d.email, companyName: d.company,
          emailDomain: d.emailDomain, projectName: d.projectName, draftId: d.id,
        });
        await notifyUsers(notify, {
          type: 'UNFINISHED_WEB_BUDGET',
          title: `Unfinished web budget: ${d.projectName}`,
          message: `${who} (${d.email}) stopped at ${stoppedAt}. Looks like ${job?.name || 'a job we already have'}. Same job? Answer on My Desk.`,
          link: '/sales/desk#look-alikes',
          dedupeKey: `draft-abandoned:${d.id}`,
        }, { db });
        continue;
      }

      const { project, carried } = await projectFromDraft(db, d, owner);
      made++;
      await notifyUsers(notify, {
        type: 'UNFINISHED_WEB_BUDGET',
        title: `Unfinished web budget: ${d.projectName}`,
        message: `${who} (${d.email}) stopped at ${stoppedAt}. A project was made so the lead is not lost${carried ? '' : '; the figures need entering'}.`,
        link: `/project/${project.id}`,
        dedupeKey: `draft-abandoned:${d.id}`,
      }, { db });
      projects.push({ id: project.id, name: project.name, city: project.city, state: project.state, clientId: d.clientId || null, contactEmail: project.contactEmail });
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
