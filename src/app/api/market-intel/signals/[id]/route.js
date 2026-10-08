import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { recordMatchFeedback } from '@/lib/market-intel/fuzzy-matcher';
import { attachSignalToClient } from '@/lib/market-intel/tags';
import { notifyUser } from '@/lib/alerts';

const INCLUDE = {
  source:        { select: { name: true } },
  linkedClient:  { select: { id: true, name: true } },
  linkedProject: { select: { id: true, name: true, projectNumber: true } },
  assignedTo:    { select: { id: true, name: true } },
  supersededBy:  { select: { id: true, kind: true, title: true } },
  tags:          { select: { role: true, tag: { select: { id: true, kind: true, name: true, normalized: true, clientId: true } } } },
};

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const userId = user.id || user.userId || 'unknown';

  const body = await request.json();

  // Load the current signal so we know the developer name + previous client
  const existing = await prisma.marketSignal.findUnique({
    where:  { id: params.id },
    select: { title: true, developerNames: true, linkedClientId: true, matchStatus: true, assignedToId: true },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = {};
  if (body.reviewStatus !== undefined) data.reviewStatus = body.reviewStatus;
  if (body.matchStatus  !== undefined) data.matchStatus  = body.matchStatus;
  if ('unitCount' in body) {
    const n = parseInt(body.unitCount, 10);
    data.unitCount = Number.isFinite(n) && n > 0 ? n : null;
  }

  // A project link is confirmed or rejected independently of the client link.
  // They are two different claims about the article: "this is Zocalo" and
  // "this is Trailhead", and one can be right while the other is wrong.
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

  // "Not the same building" (0124): clear the pointer and remember the answer
  // so the next retag does not put it back.
  if ('supersededById' in body && !body.supersededById) {
    data.supersededById    = null;
    data.supersededAt      = null;
    data.supersedeReviewed = true;
  }

  // Hand the article to a salesperson (0122). Null clears it. The bell rings
  // only when the person changes, so re-saving the same name is silent.
  let notifyAssignee = false;
  if ('assignedToId' in body) {
    const next = body.assignedToId || null;
    data.assignedToId = next;
    data.assignedById = next ? userId : null;
    data.assignedAt   = next ? new Date() : null;
    notifyAssignee    = !!next && next !== existing.assignedToId && next !== userId;
  }

  const signal = await prisma.marketSignal.update({
    where: { id: params.id },
    data,
    include: INCLUDE,
  });

  if (notifyAssignee) {
    await notifyUser({
      userId:    signal.assignedToId,
      type:      'MARKET_SIGNAL_ASSIGNED',
      title:     signal.kind === 'PERMIT' ? 'Building permit assigned to you' : 'Market article assigned to you',
      message:   `${user.name || 'A teammate'} assigned you: ${existing.title}`.slice(0, 300),
      link:      `${signal.kind === 'PERMIT' ? '/market-intel/permits' : '/market-intel'}?signal=${signal.id}`,
      dedupeKey: `market-signal-assigned:${signal.id}:${signal.assignedToId}`,
    }).catch(() => {});
  }

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
          userId,
        }).catch(() => {});
      }
      // A confirmed client inherits the article's place tags and owns its
      // company tag from now on.
      if (isConfirm) await attachSignalToClient(params.id, data.linkedClientId, { companyNames: devNames }).catch(() => {});
    } catch {}
  }

  return NextResponse.json(signal);
}
