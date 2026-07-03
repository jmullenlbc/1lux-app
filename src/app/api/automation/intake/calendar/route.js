import { NextResponse } from 'next/server';
import { requireSalesAdmin } from '@/lib/auth';
import { ingestCalendarEvent } from '@/lib/bot/intake';

export const dynamic = 'force-dynamic';

// Inbound calendar event → automation engine. Microsoft 365 sync (Graph) posts
// normalized events here; reachable by a Sales Admin or the cron secret meanwhile.
export async function POST(req) {
  const cronOk = req.headers.get('x-cron-secret') === process.env.CRON_SECRET;
  if (!cronOk) {
    const { error } = await requireSalesAdmin();
    if (error) return error;
  }
  try {
    const body = await req.json();
    const result = await ingestCalendarEvent(body, { ownerUserId: body.ownerUserId, ownerEmail: body.ownerEmail });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('[intake/calendar] failed:', e?.message ?? e);
    return NextResponse.json({ error: 'intake failed' }, { status: 500 });
  }
}
