import { NextResponse } from 'next/server';
import { requireIntakeReviewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/projects/createProject';
import { BUILDING_TYPES } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * "This is a new job" — make a project from a web request, carrying over the
 * name, location, contact and company, and link the two. Refuses if the request
 * is already linked, so a double-click can't make two projects.
 */
export async function POST(request, { params }) {
  const { user, error } = await requireIntakeReviewer(request);
  if (error) return error;

  const submission = await prisma.conceptualSubmission.findUnique({ where: { id: params.id } });
  if (!submission) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (submission.duplicateMatchId) {
    return NextResponse.json({ error: 'This request is already linked to a project.' }, { status: 409 });
  }

  // The public form's building type is only carried over when it is one of
  // the project's own types; otherwise the project page asks for it.
  const buildingType = BUILDING_TYPES.some(t => t.value === submission.buildingType) ? submission.buildingType : null;

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

  const line = `Created project ${project.name} (${project.budgetNumber}) from this request.`;
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

  return NextResponse.json({ submission: updated, project: { id: project.id, name: project.name } }, { status: 201 });
}
