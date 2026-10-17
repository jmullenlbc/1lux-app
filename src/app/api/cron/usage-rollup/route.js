import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readLedgerTail } from '@/lib/agent/ledger';
import { collectMetrics, toSnapshot, rollupKey } from '@/lib/admin/metrics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/usage-rollup
 * Daily 07:00 ET, freeze yesterday's operational totals.
 * Protected by x-cron-secret header.
 * Triggered by AWS EventBridge Scheduler: cron(0 12 * * ? *)
 *
 * Follows the same shape as `/api/cron/digest` and `/api/cron/threshold`, one
 * secret-gated GET, no body, idempotent.
 *
 * ── Why a scheduled job at all, when the dashboard queries live tables ───────
 * Because two of the numbers cannot be recomputed later. The agent ledger's file
 * sink lives on a Lambda's ephemeral disk and is gone on the next cold start, so
 * "how many model calls did we make on the 4th" is unanswerable by Tuesday
 * unless something wrote it down. Rows get deleted too, a project removed in
 * September takes its uploads and activity out of every retroactive count for
 * August. The live query answers *now*; the snapshot is the only thing that
 * answers *then*.
 *
 * ── Costs nothing in model tokens ────────────────────────────────────────────
 * This job makes no Anthropic call. It counts rows and writes one k/v row. It is
 * a reader of the AI ledger, never a writer to the AI.
 *
 * ── Idempotent by construction ───────────────────────────────────────────────
 * The key is the date, and the write is an upsert. Running twice in one day
 * overwrites with the same answer; a missed day can be backfilled by passing
 * `?date=YYYY-MM-DD` rather than being lost.
 */
export async function GET(request) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get('date');

  // The window is one calendar day in UTC, ending at midnight. Anchoring on
  // midnight rather than "now minus 24h" is what makes the job idempotent: a
  // retry at 07:05 must produce the same row as the run at 07:00.
  const anchor = requested ? new Date(`${requested}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(anchor.getTime())) {
    return NextResponse.json({ error: 'Invalid date, expected YYYY-MM-DD' }, { status: 400 });
  }
  const until = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  const since = new Date(until.getTime() - 86400_000);

  try {
    const metrics  = await collectMetrics(prisma, { since, until, readLedger: () => readLedgerTail(5000) });
    const snapshot = toSnapshot(metrics);
    // toSnapshot dates from `window.until`, which is midnight of the *following*
    // day, label the row with the day actually measured.
    snapshot.day = since.toISOString().slice(0, 10);

    const key = rollupKey(since);
    await prisma.systemConfig.upsert({
      where:  { key },
      update: { value: JSON.stringify(snapshot) },
      create: { key, value: JSON.stringify(snapshot) },
    });

    return NextResponse.json({ ok: true, key, snapshot });
  } catch (e) {
    console.error('[cron/usage-rollup] failed:', e?.message || e);
    return NextResponse.json({ error: 'Rollup failed' }, { status: 500 });
  }
}
