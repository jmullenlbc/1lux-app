import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ownerIdsOf, logNoteChanges } from '@/lib/notes/owners';
import { swapSender } from '@/lib/bot/emailStyle';

/**
 * POST /api/bot/drafts/[id]/sender  { userId }
 * Picks who sends a shared note's email (0108, Mike 9-27: "Must be chosen
 * before it can be sent out"). Any owner of the note may pick, and only an
 * owner may be picked. The sign-off and signature switch to the new sender.
 */
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: 'Pick who sends it.' }, { status: 400 });

  const draft = await prisma.botDraft.findUnique({ where: { id: params.id } });
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  if (draft.status !== 'PENDING_REVIEW') return NextResponse.json({ error: 'This email is no longer waiting for review.' }, { status: 400 });

  const step = await prisma.noteAction.findFirst({
    where:  { botDraftId: draft.id },
    select: { noteId: true, note: { select: { createdById: true, owners: { select: { userId: true } } } } },
  });
  const ownerIds = step ? ownerIdsOf(step.note) : [draft.userId].filter(Boolean);
  if (!ownerIds.includes(user.id) && draft.userId !== user.id && !actsAsAdmin(user)) {
    return NextResponse.json({ error: 'Only the note\'s owners can pick who sends this.' }, { status: 403 });
  }
  if (!ownerIds.includes(userId)) return NextResponse.json({ error: 'The sender must be one of the note\'s owners.' }, { status: 400 });

  const [from, to] = await Promise.all([
    draft.userId ? prisma.user.findUnique({ where: { id: draft.userId } }) : null,
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!to) return NextResponse.json({ error: 'That person was not found.' }, { status: 400 });

  const updated = await prisma.botDraft.update({
    where: { id: draft.id },
    data:  {
      userId, senderPending: false,
      body: from && from.id !== to.id ? swapSender(draft.body, from, to) : draft.body,
    },
  });
  if (step) await logNoteChanges(prisma, step.noteId, user, [{ field: 'email sender', before: draft.senderPending ? null : from?.name || null, after: to.name }]);

  return NextResponse.json({ draft: updated });
}
