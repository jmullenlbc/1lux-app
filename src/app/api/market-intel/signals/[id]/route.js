import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { recordMatchFeedback } from '@/lib/market-intel/fuzzy-matcher';

export async function PATCH(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Load the current signal so we know the developer name + previous client
  const existing = await prisma.marketSignal.findUnique({
    where:  { id: params.id },
    select: { developerNames: true, linkedClientId: true, matchStatus: true },
  });

  const data = {};
  if (body.reviewStatus !== undefined) data.reviewStatus = body.reviewStatus;
  if (body.matchStatus  !== undefined) data.matchStatus  = body.matchStatus;

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
      source:       { select: { name: true } },
      linkedClient: { select: { id: true, name: true } },
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
          userId:    session.id || session.userId || 'unknown',
        }).catch(() => {});
      }
    } catch {}
  }

  return NextResponse.json(signal);
}
