import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { status, reviewNote, clientId } = await request.json();

  const submission = await prisma.conceptualSubmission.findUnique({
    where: { id: params.id },
  });

  if (!submission) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.conceptualSubmission.update({
    where: { id: params.id },
    data: {
      status: status || submission.status,
      reviewNote: reviewNote !== undefined ? reviewNote : submission.reviewNote,
      clientId: clientId || null,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
    include: {
      reviewedBy: { select: { name: true } },
      client: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ submission: updated });
}