import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { retagUntagged } from '@/lib/market-intel/poller';

export const maxDuration = 60;

// POST /api/market-intel/retag
// Reads tags for the next slice of articles that have none (0122 backfill).
// Each press does 25; the answer says how many are still waiting. Any signed
// in user may press it: it only reads, and the cost is a QUICK model call per
// article.
export async function POST(request) {
  const { error } = await requireAuth(request);
  if (error) return error;
  const log = await retagUntagged({ limit: 25 });
  return NextResponse.json({ log });
}
