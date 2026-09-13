import { NextResponse } from 'next/server';
import { requireIntakeReviewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  // requireAdmin needs the request to read the auth cookie — calling it bare
  // threw on every request, 500ing the review queue's approve/reject.
  // Sales can work the queue too (2026-09-12); the portal invite stays admin-only.
  const { user, error } = await requireIntakeReviewer(request);
  if (error) return error;

  const { status, reviewNote, clientId, duplicateMatchId, dismissSuggestion } = await request.json();

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
      // Only touch clientId when the request explicitly sends it. The previous
      // `clientId || null` NULLED the link on every PATCH that omitted the
      // field — so approving a submission after linking a client silently
      // unlinked it, which would break the Task 27 invite bridge.
      clientId: clientId !== undefined ? (clientId || null) : submission.clientId,
      duplicateMatchId: duplicateMatchId !== undefined ? (duplicateMatchId || null) : submission.duplicateMatchId,
      // "Not the same job" — the guess stays on the row (so we can see later
      // what it thought), it just stops being shown.
      ...(dismissSuggestion ? { suggestionDismissedAt: new Date() } : {}),
      reviewedById: user.id,
      // NOTE: no `reviewedAt` — the model has no such column, and writing it
      // made Prisma reject the entire update, 500ing every approve/reject
      // since the 08-04 deploy. `updatedAt` already records review time.
    },
    include: {
      reviewedBy: { select: { name: true } },
      client: { select: { id: true, name: true } },
      suggestedProject: { select: { id: true, name: true, city: true, state: true, zip: true } },
    },
  });

  return NextResponse.json({ submission: updated });
}
