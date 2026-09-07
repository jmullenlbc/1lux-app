import { NextResponse } from 'next/server';
import { requireSalesAdmin } from '@/lib/auth';
import { ingestCalendarEvent } from '@/lib/bot/intake';

export const dynamic = 'force-dynamic';

/**
 * Inbound calendar event → a draft sales note + the automation engine.
 *
 * This is the door the Microsoft 365 sync (Graph) will knock on; a Sales Admin
 * or the cron secret can reach it in the meantime. A raw Graph event can be
 * posted as-is — it is recognised and translated here.
 *
 * Body: the event, plus any of
 *   format      'graph' | 'loose' | 'auto'   defaults to auto (it sniffs)
 *   ownerEmail  the mailbox this came from
 *   dryRun      classify and preview the rules, write no note
 *   createNote  false to fire the rules only
 *
 * The reply carries `classification` (what it decided, and why, in plain
 * English) and `note` (whether a draft was created, updated or left alone), so a
 * sync can log exactly what happened to each event.
 */
export async function POST(req) {
  const cronOk = req.headers.get('x-cron-secret') === process.env.CRON_SECRET;
  if (!cronOk) {
    const { error } = await requireSalesAdmin();
    if (error) return error;
  }
  try {
    const body = await req.json();
    const result = await ingestCalendarEvent(body, {
      ownerUserId:    body.ownerUserId,
      ownerEmail:     body.ownerEmail,
      mailboxAddress: body.mailboxAddress,
      format:         body.format,
      projectId:      body.projectId,
      dryRun:         body.dryRun,
      createNote:     body.createNote,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('[intake/calendar] failed:', e?.message ?? e);
    return NextResponse.json({ error: 'intake failed' }, { status: 500 });
  }
}
