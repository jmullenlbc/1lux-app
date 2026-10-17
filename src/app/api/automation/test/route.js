import { NextResponse } from 'next/server';
import { requireSalesAdmin } from '@/lib/auth';
import { runTrigger } from '@/lib/bot/ruleEngine';
import { normalizeEmail, normalizeCalendarEvent } from '@/lib/bot/intake';

export const dynamic = 'force-dynamic';

// Simulate a trigger to test your rules without M365. Dry run by default
// (evaluates + reports, mutates nothing). { run: true } actually fires, any
// resulting drafts land in the caller's Bot Queue.
export async function POST(req) {
  const { user, error } = await requireSalesAdmin();
  if (error) return error;

  const { triggerType, payload = {}, raw, run } = await req.json();
  if (!triggerType) return NextResponse.json({ error: 'triggerType required' }, { status: 400 });

  // Accept either an engine-shaped payload or a raw provider payload to normalize.
  let p = payload;
  if (raw) {
    if (triggerType === 'EMAIL_RECEIVED') p = normalizeEmail(raw);
    else if (triggerType === 'CALENDAR_EVENT_CREATED') p = normalizeCalendarEvent(raw);
  }

  const result = await runTrigger(triggerType, p, {
    dryRun: !run,
    ownerUserId: run ? user.id : undefined, // real runs queue drafts to the tester
    eventRef: run ? `test-${Date.now()}` : null,
  });
  return NextResponse.json({ ok: true, result });
}
