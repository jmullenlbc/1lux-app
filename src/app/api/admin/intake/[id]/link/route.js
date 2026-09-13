import { NextResponse } from 'next/server';
import { requireIntakeReviewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { planMerge, applyMerge } from '@/lib/intake/mergeRequest';
import { buildingTypeLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Linking a web request to a job we already have — fill-blanks-only (Mike,
 * 2026-09-12: "we never overwrite important data").
 *
 * GET  ?projectId=…            → the side-by-side plan, for the screen
 * POST { projectId, choices }  → do it. `choices` is { [field]: 'request' } for
 *                                each conflict a person chose to replace; every
 *                                other conflict keeps the job's answer.
 *
 * The plan is always rebuilt here from the database, never taken from the
 * browser — what gets written is what the rules allow, not what was posted.
 */

const PROJECT_FIELDS = {
  id: true, name: true, clientId: true, contactName: true, contactEmail: true,
  city: true, state: true, zip: true, buildingType: true, location: true,
};

async function load(submissionId, projectId) {
  const [submission, project] = await Promise.all([
    prisma.conceptualSubmission.findUnique({ where: { id: submissionId } }),
    projectId ? prisma.project.findUnique({ where: { id: projectId }, select: PROJECT_FIELDS }) : null,
  ]);
  return { submission, project };
}

/** Company ids and building-type keys shown as words. */
async function withLabels(plan) {
  const ids = plan.filter(r => r.field === 'clientId').flatMap(r => [r.projectValue, r.requestValue]).filter(Boolean);
  const clients = ids.length
    ? await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameOf = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const show = (field, v) => {
    if (v == null || v === '') return null;
    if (field === 'clientId') return nameOf[v] || '(a company)';
    if (field === 'buildingType') return buildingTypeLabel(v);
    return String(v);
  };
  return plan.map(r => ({ ...r, projectShown: show(r.field, r.projectValue), requestShown: show(r.field, r.requestValue) }));
}

export async function GET(request, { params }) {
  const { error } = await requireIntakeReviewer(request);
  if (error) return error;

  const projectId = new URL(request.url).searchParams.get('projectId');
  const { submission, project } = await load(params.id, projectId);
  if (!submission) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (!project)    return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const plan = await withLabels(planMerge(project, submission));
  return NextResponse.json({ project: { id: project.id, name: project.name }, plan });
}

export async function POST(request, { params }) {
  const { user, error } = await requireIntakeReviewer(request);
  if (error) return error;

  const { projectId, choices } = await request.json().catch(() => ({}));
  const { submission, project } = await load(params.id, projectId);
  if (!submission) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (!project)    return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const plan = planMerge(project, submission);
  const { data, filled, replaced, kept } = applyMerge(plan, choices && typeof choices === 'object' ? choices : {}, project);

  const line = [
    `Linked to ${project.name}.`,
    filled.length   ? `Filled in: ${filled.join(', ')}.` : 'Nothing blank to fill in.',
    replaced.length ? `Replaced: ${replaced.join(', ')}.` : null,
    kept.length     ? `Kept the job's: ${kept.join(', ')}.` : null,
  ].filter(Boolean).join(' ');

  const note = submission.reviewNote ? `${submission.reviewNote}\n${line}` : line;

  const [, updated] = await prisma.$transaction([
    prisma.project.update({ where: { id: project.id }, data: Object.keys(data).length ? data : { updatedAt: new Date() } }),
    prisma.conceptualSubmission.update({
      where: { id: submission.id },
      data: {
        duplicateMatchId: project.id,
        // A link can come from the guess or from picking the job by hand;
        // either way the guess has been dealt with.
        suggestionDismissedAt: submission.suggestedProjectId && submission.suggestedProjectId !== project.id
          ? new Date()
          : submission.suggestionDismissedAt,
        reviewNote: note,
        reviewedById: user.id,
      },
      include: {
        reviewedBy: { select: { name: true } },
        client: { select: { id: true, name: true } },
        duplicateMatch: { select: { id: true, name: true } },
        suggestedProject: { select: { id: true, name: true, city: true, state: true, zip: true } },
      },
    }),
  ]);

  return NextResponse.json({ submission: updated, filled, replaced, kept });
}
