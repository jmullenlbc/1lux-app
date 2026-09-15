import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { notifyUser } from '@/lib/alerts';
import { planNoteReminder, MAX_LATE_DAYS } from '@/lib/noteReminders';

/**
 * GET /api/cron/note-reminders
 * Daily. Delivers sales-note reminders that have come due.
 *
 * ── Why this exists ──
 * The bot could already SET a reminder: confirm an "expect an intro" action and
 * `NoteAction.remindAt` gets a date seven days out. Nothing ever read it back.
 * `remindAt` was written in three places and read in zero, so every reminder
 * the bot has ever set has silently done nothing. This is the other half.
 *
 * ── Why remindedAt has to exist ──
 * `remindAt` stays in the past once it passes, so "is it due?" answers yes
 * forever. Stamping `remindedAt` is what turns a daily sweep into a single
 * nudge. The alert's dedupeKey is a second belt on the same trousers: even if
 * the stamp fails to save, the bell will not show the same reminder twice.
 *
 * Protected by x-cron-secret. Admins can also run it by hand, which is the only
 * practical way to prove it works before an EventBridge rule exists.
 *
 * The rules for what a due reminder should say, and when one is too old to be
 * worth saying, live in `@/lib/noteReminders` so they can be tested without a
 * Next build. This file is the part that touches the database.
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

  const now = new Date();
  const log = { due: 0, sent: 0, skipped: 0, stale: 0, errors: [] };

  try {
    const due = await prisma.noteAction.findMany({
      where: {
        remindAt:   { lte: now },
        remindedAt: null,
        status:     { in: ['CONFIRMED', 'SUGGESTED'] },
        kind:       'ACTION',
      },
      orderBy: { remindAt: 'asc' },
      take: 500,
      include: {
        note: { select: { id: true, title: true, createdById: true, isPublished: true } },
      },
    });

    log.due = due.length;

    for (const action of due) {
      try {
        const plan = planNoteReminder(action, { now, maxLateDays: MAX_LATE_DAYS });

        // Leave the row alone — whatever stopped it may not be true tomorrow.
        if (plan.do === 'skip') { log.skipped++; continue; }

        // Stamp a stale one so it stops turning up in every future sweep, but
        // tell nobody: a three-month-old nudge is not news.
        if (plan.do === 'stale') {
          await prisma.noteAction.update({ where: { id: action.id }, data: { remindedAt: now } });
          log.stale++;
          continue;
        }

        const res = await notifyUser(plan.alert);

        // Stamp whether or not the bell accepted it. A duplicate means the
        // person has already been told; leaving it unstamped would make this
        // row reappear in tomorrow's sweep for no reason.
        await prisma.noteAction.update({ where: { id: action.id }, data: { remindedAt: now } });

        if (res.created) log.sent++; else log.skipped++;
      } catch (err) {
        log.errors.push(`${action.id}: ${err?.message ?? err}`);
      }
    }

    return NextResponse.json({ ok: true, log });
  } catch (err) {
    console.error('[cron/note-reminders]', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'failed' }, { status: 500 });
  }
}
