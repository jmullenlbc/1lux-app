import { NextResponse } from 'next/server';
import { requireAuth, requireSalesAdmin } from '@/lib/auth';
import { ingestEmail } from '@/lib/bot/intake';

export const dynamic = 'force-dynamic';

// Inbound email → automation engine. Microsoft 365 sync (Graph) posts normalized
// messages here; until then it's reachable by an authenticated Sales Admin (or
// the cron secret) so the pipeline can be exercised.
export async function POST(req) {
  const cronOk = req.headers.get('x-cron-secret') === process.env.CRON_SECRET;
  if (!cronOk) {
    const { error } = await requireSalesAdmin();
    if (error) return error;
  }
  try {
    const body = await req.json();
    const result = await ingestEmail(body, { ownerUserId: body.ownerUserId, ownerEmail: body.ownerEmail });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('[intake/email] failed:', e?.message ?? e);
    return NextResponse.json({ error: 'intake failed' }, { status: 500 });
  }
}
