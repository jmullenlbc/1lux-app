import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { archiveData, readArchivedFlag, deleteRefused, ARCHIVED_FLAG_HELP } from '@/lib/archive';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return canSeeAllData(user) || project.createdById === user.id;
}

const VALID_PHASE_TAGS = ['SD', 'DD', 'CD', 'IFC', 'ASI', 'RFI', 'PERMIT', 'OTHER'];
const VALID_SOURCES    = ['INTERNAL', 'EXTERNAL'];

// PATCH /api/projects/[id]/drawing-submissions/[submissionId]
// Body: { phaseTag?, source?, notes? }
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!(await canAccess(params.projectId || params.id, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body     = await request.json();
  const data     = {};

  if ('phaseTag' in body) {
    data.phaseTag = body.phaseTag && VALID_PHASE_TAGS.includes(body.phaseTag)
      ? body.phaseTag
      : null;
  }
  if ('source' in body && VALID_SOURCES.includes(body.source)) {
    data.source = body.source;
  }
  if ('notes' in body) {
    data.notes = body.notes || null;
  }

  const submission = await prisma.drawingSubmission.update({
    where:   { id: params.submissionId },
    data,
    include: { files: { orderBy: { createdAt: 'asc' } } },
  });

  return NextResponse.json({ submission });
}

// Drawing sets are archived, never deleted (Mike, 2026-09-11: "yes drawings
// and budgets and products should be archive only"). Migration 0076. The PDFs
// stay where they are, so a restored set opens exactly as before.
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Drawing sets') }, { status: 405 });
}

// POST /api/projects/[id]/drawing-submissions/[submissionId]  { archived: true | false }
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!(await canAccess(params.id, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const existing = await prisma.drawingSubmission.findUnique({ where: { id: params.submissionId }, select: { projectId: true } });
  if (!existing || existing.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const submission = await prisma.drawingSubmission.update({
    where:   { id: params.submissionId },
    data:    archiveData(archived, user),
    include: { files: { orderBy: { createdAt: 'asc' } } },
  });
  return NextResponse.json({ submission });
}
