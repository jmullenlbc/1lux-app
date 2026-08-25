import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import path from 'path';

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

// DELETE /api/projects/[id]/drawing-submissions/[submissionId]
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!(await canAccess(params.projectId || params.id, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const submission = await prisma.drawingSubmission.findUnique({
    where:   { id: params.submissionId },
    include: { files: true },
  });
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete physical files
  for (const f of submission.files) {
    try {
      await unlink(path.join(process.cwd(), 'uploads', f.storedPath));
    } catch {}
  }

  await prisma.drawingSubmission.delete({ where: { id: params.submissionId } });
  return NextResponse.json({ success: true });
}
