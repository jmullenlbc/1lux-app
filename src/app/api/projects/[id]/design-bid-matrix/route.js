import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const MATRIX_INCLUDE = {
  items:          { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  pushedBy:       { select: { id: true, name: true } },
  sourceSchedule: { select: { id: true, version: true, submissionTag: true, publishedAt: true } },
};

// GET /api/projects/[id]/design-bid-matrix
// Returns: { matrices: [...] } ordered newest first
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const matrices = await prisma.designBidMatrix.findMany({
    where: { projectId: params.id },
    orderBy: { version: 'desc' },
    include: MATRIX_INCLUDE,
  });

  return NextResponse.json({ matrices });
}
