import { NextResponse } from 'next/server';
import { requireIntakeReviewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { drawingsFromSubmission } from '@/lib/intake/handoff';
import { planFromWeb, makeConceptualProject, carryWebFigures } from '@/lib/intake/conceptualProjects';

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
  // Shared with the automatic path (conceptualProjects.js, Mike 2026-10-03):
  // Conceptual Budget service type, and the number the visitor was shown is
  // saved as the first step of the number ladder.
  const plan = await planFromWeb({ answers: submission.answers, drawings: drawingsFromSubmission(submission) });
  const project = await makeConceptualProject(prisma, {
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
  const carried = await carryWebFigures(prisma, project, plan, {
    actor: user, source: 'web-request', note: 'Carried over from the web budget request', submissionId: submission.id,
  });

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
