import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

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

  if (draft.status !== 'PENDING_REVIEW') {
    return NextResponse.json({ error: 'Draft is not in PENDING_REVIEW status' }, { status: 400 });
  }

  // A shared note's email waits until somebody picks who sends it (0108).
  if (draft.senderPending) {
    return NextResponse.json({ error: 'Pick who sends this email first.' }, { status: 409 });
  }

  return NextResponse.json(
    { error: 'Email sending not yet available: Phase B', code: 'PHASE_B' },
    { status: 501 }
  );
}
