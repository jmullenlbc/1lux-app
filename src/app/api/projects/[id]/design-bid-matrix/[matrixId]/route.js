import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { archiveData, readArchivedFlag, deleteRefused, ARCHIVED_FLAG_HELP } from '@/lib/archive';

// PATCH /api/projects/[id]/design-bid-matrix/[matrixId]
// Rename a budget matrix version (submissionTag)
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { submissionTag } = await req.json();

  const matrix = await prisma.designBidMatrix.findUnique({ where: { id: params.matrixId } });
  if (!matrix || matrix.projectId !== params.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.designBidMatrix.update({
    where: { id: params.matrixId },
    data:  { submissionTag: submissionTag?.trim() || null },
  });
  return NextResponse.json({ matrix: updated });
}

// Budget matrix versions are archived, never deleted (Mike, 2026-09-11: "like
// budget matrix, conceptual budget, design questionnaire I don't want to be
// deleted"). Migration 0076. An archived version keeps its number, so the next
// one never reuses it.
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Budget versions') }, { status: 405 });
}

// POST /api/projects/[id]/design-bid-matrix/[matrixId]  { archived: true | false }
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const archived = await readArchivedFlag(req);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const matrix = await prisma.designBidMatrix.findUnique({ where: { id: params.matrixId }, select: { projectId: true } });
  if (!matrix || matrix.projectId !== params.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.designBidMatrix.update({
    where: { id: params.matrixId },
    data:  archiveData(archived, user),
  });
  return NextResponse.json({ matrix: updated });
}
