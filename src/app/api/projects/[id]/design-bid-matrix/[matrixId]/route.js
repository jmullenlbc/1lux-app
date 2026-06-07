import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

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

// DELETE /api/projects/[id]/design-bid-matrix/[matrixId]
// Delete a budget matrix version
export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const matrix = await prisma.designBidMatrix.findUnique({ where: { id: params.matrixId } });
  if (!matrix || matrix.projectId !== params.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.designBidMatrix.delete({ where: { id: params.matrixId } });
  return NextResponse.json({ ok: true });
}
