import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { runOwnerLookups } from '@/lib/market-intel/ownerLookup';

/**
 * GET /api/cron/market-owner-lookup (0126)
 * Looks the next ten permits with no owner up on the web, newest first. Same
 * work as the "Find owners" button on the Permits tab, reachable the way every
 * other scheduled job in this folder is.
 *
 * NOT SCHEDULED YET: needs an EventBridge rule (Sean), hourly is plenty; a
 * new city pull is a few hundred permits and this clears ten a run. Until
 * then an admin can open it by hand.
 *
 * Protected by x-cron-secret, with an admin fallback for a manual run.
 */
export const maxDuration = 300;

export async function GET(req) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET;
  if (!isCron) {
    const { user, error } = await requireAuth();
    if (error) return error;
    if (!actsAsAdmin(user)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const log = await runOwnerLookups({ limit: 10, deadline: Date.now() + 250_000 });
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    console.error('[cron/market-owner-lookup]', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'failed' }, { status: 500 });
  }
}
