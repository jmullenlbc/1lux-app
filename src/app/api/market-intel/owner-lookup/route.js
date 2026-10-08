import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runParkedJob, readJobRequest } from '@/lib/parkedJob';
import { runOwnerLookups } from '@/lib/market-intel/ownerLookup';

// POST /api/market-intel/owner-lookup (0126)
// { signalId } looks one permit up on the web (the card's "Find the owner" or
// "Search again"); {} does the next three never looked up (the header button
// loops it). Park-and-poll because a web research call runs past the front
// door's ~30 s; { jobKey } polls.
export const maxDuration = 300;
const INFLIGHT_MS = 180_000;

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const { body } = await readJobRequest(request);

  let args = null;
  if (!body.jobKey) {
    const signalId = String(body.signalId || '').trim() || null;
    if (signalId) {
      const row = await prisma.marketSignal.findUnique({ where: { id: signalId }, select: { kind: true } });
      if (!row || row.kind !== 'PERMIT') return NextResponse.json({ error: 'Not a permit' }, { status: 404 });
      // "Search again": clear the stamp so the lookup runs once more.
      await prisma.marketSignal.update({ where: { id: signalId }, data: { ownerLookupAt: null } });
      args = { signalId, limit: 1 };
    } else {
      args = { limit: Math.min(5, Math.max(1, parseInt(body.limit, 10) || 3)) };
    }
  }

  return runParkedJob({
    body, kind: 'market.ownerLookup', scope: user.id, args, inflightMs: INFLIGHT_MS,
    run: (a) => runOwnerLookups({ ...a, userId: user.id, deadline: Date.now() + 240_000 }).then(log => ({ log })),
  });
}
