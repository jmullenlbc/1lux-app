import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { recordMatchFeedback } from '@/lib/market-intel/fuzzy-matcher';

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const body = await request.json();

  // Load the current signal so we know the developer name + previous client
  const existing = await prisma.marketSignal.findUnique({
    where:  { id: params.id },
    select: { developerNames: true, linkedClientId: true, matchStatus: true },
  });

  const data = {};
  if (body.reviewStatus !== undefined) data.reviewStatus = body.reviewStatus;
  if (body.matchStatus  !== undefined) data.matchStatus  = body.matchStatus;

  // A project link is confirmed or rejected independently of the client link.
  // They are two different claims about the article — "this is Zocalo" and
  // "this is Trailhead" — and one can be right while the other is wrong.
  if ('linkedProjectId' in body) {
    data.linkedProjectId    = body.linkedProjectId || null;
    data.projectMatchStatus = body.linkedProjectId ? 'CONFIRMED' : 'REJECTED';
  }

  if ('linkedClientId' in body) {
    data.linkedClientId = body.linkedClientId || null;
    if (body.linkedClientId) {
      data.matchStatus = 'CONFIRMED';
    } else if (body.matchStatus === 'REJECTED' || !body.linkedClientId) {
      data.matchStatus = 'REJECTED';
    }
  }

  const signal = await prisma.marketSignal.update({
    where: { id: params.id },
    data,
    include: {
      source:        { select: { name: true } },
      linkedClient:  { select: { id: true, name: true } },
      linkedProject: { select: { id: true, name: true, projectNumber: true } },
    },
  });

  // Record feedback so future polls learn from confirmations and rejections
  const isConfirm = data.matchStatus === 'CONFIRMED' && data.linkedClientId;
  const isReject  = data.matchStatus === 'REJECTED'  && existing?.linkedClientId;

  if ((isConfirm || isReject) && existing?.developerNames) {
    try {
      const devNames = JSON.parse(existing.developerNames || '[]');
      const targetClientId = isReject ? existing.linkedClientId : data.linkedClientId;
      const outcome = isConfirm ? 'CONFIRMED' : 'REJECTED';

      for (const candidateName of devNames) {
        await recordMatchFeedback({
          candidateName,
          matchedClientId: targetClientId,
          outcome,
          signalId:  params.id,
          userId:    user.id || user.userId || 'unknown',
        }).catch(() => {});
      }
    } catch {}
  }

  return NextResponse.json(signal);
}
