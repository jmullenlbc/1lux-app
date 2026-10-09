import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { retagUntagged, UNSCREENED } from '@/lib/market-intel/poller';

export const maxDuration = 60;

// GET /api/market-intel/retag: how many articles are still waiting to be
// read for tags (Mike 10-9: the articles tab says so and offers the button).
export async function GET(request) {
  const { error } = await requireAuth(request);
  if (error) return error;
  const remaining = await prisma.marketSignal.count({ where: UNSCREENED });
  return NextResponse.json({ remaining });
}

// POST /api/market-intel/retag
// "Read tags": the next slice of articles not yet screened for "is this
// about a project" (0125) or with no tags (0122). Each press does up to 25,
// five at a time, inside a 22 s slice (Amplify cuts a request at ~30 s); the
// answer says how many are still waiting. Any signed in user may press it: it
// only reads, and the cost is a QUICK model call per article.
export async function POST(request) {
  const { error } = await requireAuth(request);
  if (error) return error;
  const log = await retagUntagged({ limit: 25, deadline: Date.now() + 22000 });
  return NextResponse.json({ log });
}
