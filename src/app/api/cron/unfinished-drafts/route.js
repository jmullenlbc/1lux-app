import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { sweepUnfinishedDrafts } from '@/lib/intake/conceptualProjects';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/unfinished-drafts
 * Hourly is plenty. Public budgets left for a day without being sent become
 * projects (Conceptual Budget, Qualified) and Sales gets a bell saying it was
 * unfinished (Mike, 2026-10-03). The staff web requests page runs the same
 * sweep, throttled, so it works before Sean adds the schedule.
 *
 * Protected by x-cron-secret. Admins can run it by hand.
 */
export async function GET(req) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET;
  if (!isCron) {
    const { user, error } = await requireAuth();
    if (error) return error;
    if (!actsAsAdmin(user)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await sweepUnfinishedDrafts(prisma));
  } catch (e) {
    console.error('[cron/unfinished-drafts]', e?.message || e);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}
