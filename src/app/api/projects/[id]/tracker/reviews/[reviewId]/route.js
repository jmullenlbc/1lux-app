import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  return canSeeAllData(user) || p.createdById === user.id;
}

// Reviews are immutable — only deletion is allowed (for data-entry mistakes)
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.submittalReview.delete({ where: { id: params.reviewId } });
  return NextResponse.json({ success: true });
}
