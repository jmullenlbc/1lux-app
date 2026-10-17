import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { captureAll } from '@/lib/calibration/capture';

export const dynamic = 'force-dynamic';

// POST /api/calibration/backfill, (re)capture calibration samples for every
// project. Admin only; idempotent (engine/bidmatrix rows are replaced,
// recorded actuals are kept).
export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!actsAsAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = await captureAll();
  return NextResponse.json(result);
}
