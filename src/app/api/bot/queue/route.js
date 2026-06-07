import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const statusParam = searchParams.get('status');

  const statusValues = statusParam
    ? statusParam.split(',').map((s) => s.trim())
    : ['PENDING_REVIEW', 'SENT', 'MANUALLY_SENT'];

  const where = {
    userId: user.id,
    status: { in: statusValues },
  };

  if (type) where.type = type;

  const drafts = await prisma.botDraft.findMany({
    where,
    include: {
      deal: {
        select: { id: true, title: true, pipeline: true, stage: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ drafts });
}
