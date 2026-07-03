import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { recordDraftOutcome } from '@/lib/bot/ruleEngine';

export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = params;

  const draft = await prisma.botDraft.findUnique({ where: { id } });
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  if (draft.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.botDraft.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    },
  });
  await recordDraftOutcome(id, 'REJECTED'); // learning signal

  return NextResponse.json({ ok: true });
}
