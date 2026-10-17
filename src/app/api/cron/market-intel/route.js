import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { runPoll } from '@/lib/market-intel/poller';
import { pullMacroStats, macroStale } from '@/lib/market-intel/macroStats';

/**
 * GET /api/cron/market-intel
 * Polls every active news source, extracts who and what each article is about,
 * and links it to the client and the job it names.
 *
 * ── Why this exists when /api/market-intel/poll already does the same work ──
 * That route is a POST behind a button. Market intel that only arrives when
 * somebody remembers to press a button is not intelligence, the value is
 * entirely in it having already happened by the time you look. This is the same
 * poll on the same code, reachable the way every other scheduled job in this
 * folder is reachable, so all of them can be found and reasoned about in one
 * place rather than one being a button that happens to accept a secret.
 *
 * ── NOT SCHEDULED YET ──
 * Deliberate. See `.claude/coordination.md` for the exact EventBridge rule and
 * the instruction not to create it yet. Until then this runs when an admin asks
 * for it, which is also the only way to prove it works.
 *
 * Protected by x-cron-secret, with an admin fallback for a manual run.
 */
export async function GET(req) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET;

  if (!isCron) {
    const { user, error } = await requireAuth();
    if (error) return error;
    if (!actsAsAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const deadline = Date.now() + 22000;
    // The national numbers (0128) once a day, a few seconds at most, before the feeds.
    let macro = null;
    if (await macroStale().catch(() => false)) macro = await pullMacroStats({ deadline: Date.now() + 6000 }).catch(err => ({ errors: [{ error: err.message }] }));
    const log = await runPoll({ deadline });
    return NextResponse.json({ ok: true, log, macro });
  } catch (err) {
    // A feed being down, a source changing its markup, or the AI key being out
    // of credit are all normal and none of them should look like an outage.
    console.error('[cron/market-intel]', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'failed' }, { status: 500 });
  }
}
