import { NextResponse } from 'next/server';
import { requireIntakeReviewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/projects/createProject';
import { BUILDING_TYPES } from '@/lib/utils';
import { loadPricing } from '@/lib/pricingLoader';
import { loadAdoptedGuesses } from '@/lib/calibration/figureNormsLoad';
import { logActivity } from '@/lib/activity';
import { captureQuietly } from '@/lib/calibration/capture';
import { takeAreaBaseline } from '@/lib/calibration/areaNormsLoad';
import { writeSiteFeature } from '@/lib/siteFeatureRows';
import { planHandoff, applyHandoff, drawingsFromSubmission } from '@/lib/intake/handoff';

export const dynamic = 'force-dynamic';

/**
 * "This is a new job" — make a project from a web request, carrying over the
 * name, location, contact and company, and link the two. Refuses if the request
 * is already linked, so a double-click can't make two projects.
 *
 * Everything the request told us rides along (Mike, 2026-09-16: "Anything that
 * comes through the conceptual budget should input into the project"): the
 * building figures, the questionnaire answers and the site features are written
 * onto the new project, so it opens already priced instead of blank. That step
 * can never stop the project from being made — if it fails, the project still
 * exists and the note on the request says the figures did not carry.
 */
export async function POST(request, { params }) {
  const { user, error } = await requireIntakeReviewer(request);
  if (error) return error;

  const submission = await prisma.conceptualSubmission.findUnique({ where: { id: params.id }, include: { answers: true } });
  if (!submission) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (submission.duplicateMatchId) {
    return NextResponse.json({ error: 'This request is already linked to a project.' }, { status: 409 });
  }

  // Everything the request already told us — figures, answers, site features
  // and the building type — worked out BEFORE the project exists, so the
  // project is created with the right type. The building type they picked on
  // the questionnaire comes first; it is only carried over when it is one of
  // the project's own types, otherwise the project page asks for it.
  let plan = null;
  try {
    plan = planHandoff({
      answers: submission.answers,
      drawings: drawingsFromSubmission(submission),
      pricing: await loadPricing(),
      adopted: await loadAdoptedGuesses(),
    });
  } catch (e) {
    console.error('[intake/create-project] could not read the request figures (non-fatal):', e?.message || e);
  }
  const isType = v => BUILDING_TYPES.some(t => t.value === v);
  const buildingType = isType(plan?.buildingTypeKey) ? plan.buildingTypeKey
    : isType(submission.buildingType) ? submission.buildingType : null;

  const project = await createProject(prisma, user.id, {
    name:         submission.proposedName,
    budgetType:   'conceptual',
    buildingType,
    city:         submission.city,
    state:        submission.state,
    zip:          submission.zip,
    contactName:  submission.submitterName,
    contactEmail: submission.submitterEmail,
    clientId:     submission.clientId,
  });

  let carried = plan ? null : false;
  try {
    if (plan?.ready) {
      carried = await applyHandoff(prisma, project.id, plan, { writeSiteFeature });
      await logActivity(project.id, user, 'project_data',
        `Carried over from the web budget request: ${carried.fields} building figures, ${carried.answers} questionnaire answers${carried.features ? `, ${carried.features} site features` : ''}`,
        { source: 'intake', submissionId: submission.id });
      captureQuietly(project.id, { minIntervalMs: 0 });
      // What the visitor's answers came to, area by area — the budget's later
      // areas are compared with it (staff-only alerts).
      await takeAreaBaseline(project.id, 'web-request');
    }
  } catch (e) {
    console.error('[intake/create-project] hand-off failed (non-fatal):', e?.message || e);
    carried = false;
  }

  const line = `Created project ${project.name} (${project.budgetNumber}) from this request.`
    + (carried ? ` Carried over ${carried.fields} building figures and ${carried.answers} answers.`
      : carried === false ? ' The building figures did not carry over — please enter them on the project.' : '');
  const updated = await prisma.conceptualSubmission.update({
    where: { id: submission.id },
    data: {
      duplicateMatchId: project.id,
      status: 'APPROVED',
      // Making a new job is a "no, it's not that one" to any guess.
      suggestionDismissedAt: submission.suggestedProjectId ? new Date() : submission.suggestionDismissedAt,
      reviewNote: submission.reviewNote ? `${submission.reviewNote}\n${line}` : line,
      reviewedById: user.id,
    },
    include: {
      reviewedBy: { select: { name: true } },
      client: { select: { id: true, name: true } },
      duplicateMatch: { select: { id: true, name: true } },
      suggestedProject: { select: { id: true, name: true, city: true, state: true, zip: true } },
    },
  });

  return NextResponse.json({ submission: updated, project: { id: project.id, name: project.name }, carried: carried || null }, { status: 201 });
}
