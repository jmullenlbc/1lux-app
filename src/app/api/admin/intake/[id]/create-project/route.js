import { NextResponse } from 'next/server';
import { requireIntakeReviewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { projectFromSubmission } from '@/lib/intake/conceptualProjects';

export const dynamic = 'force-dynamic';

/**
 * "This is a new job", make a project from a web request, carrying over the
 * name, location, contact and company, and link the two. Refuses if the request
 * is already linked, so a double-click can't make two projects.
 *
 * Everything the request told us rides along (Mike, 2026-09-16: "Anything that
 * comes through the conceptual budget should input into the project"): the
 * building figures, the questionnaire answers and the site features are written
 * onto the new project, so it opens already priced instead of blank. That step
 * can never stop the project from being made, if it fails, the project still
 * exists and the note on the request says the figures did not carry.
 */
export async function POST(request, { params }) {
  const { user, error } = await requireIntakeReviewer(request);
  if (error) return error;

  // Shared with "Different job" on My Desk (conceptualProjects.js, 0117).
  const out = await projectFromSubmission(prisma, params.id, user);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status });
  const { project, carried, submission: updated } = out;

  return NextResponse.json({ submission: updated, project: { id: project.id, name: project.name }, carried: carried || null }, { status: 201 });
}
