import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fireDueIntroReminders } from '@/lib/bot/executeNoteAction';

export const dynamic = 'force-dynamic';

// Fire due Expect-intro reminders. Callable by cron (x-cron-secret) or an
// authenticated admin (e.g. a "run now" button).
export async function POST(req) {
  const cronOk = req.headers.get('x-cron-secret') === process.env.CRON_SECRET;
  if (!cronOk) {
    const { error } = await requireAuth();
    if (error) return error;
  }
  try {
    const fired = await fireDueIntroReminders();
    return NextResponse.json({ ok: true, fired });
  } catch (e) {
    console.error('[process-note-actions] failed:', e?.message ?? e);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
