import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { notifyUser } from '@/lib/alerts';
import { planNoteReminder, MAX_LATE_DAYS } from '@/lib/noteReminders';
import { sendDueWaitReminders } from '@/lib/followUp/engine';
import { WAIT_EXECUTORS } from '@/lib/followUp/watch';
import { writeDueCheckInDrafts } from '@/lib/checkIns/checkInDrafts';

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
  const log = { due: 0, sent: 0, skipped: 0, stale: 0, errors: [], waiting: null, checkIns: null };

  try {
    // Waiting on them (reply, drawings, invite, intro): the reminder ladder —
    // a "still waiting" draft for review plus a bell, then the next rung.
    try {
      log.waiting = await sendDueWaitReminders(prisma, { now });
    } catch (err) {
      log.errors.push(`waiting: ${err?.message ?? err}`);
    }
    const waitTypes = await prisma.noteActionType.findMany({
      where: { executor: { in: Object.keys(WAIT_EXECUTORS) } }, select: { key: true },
    });

    // Everything else: the one-time bell.
    const due = await prisma.noteAction.findMany({
      where: {
        remindAt:   { lte: now },
        remindedAt: null,
        pausedAt:   null,
        status:     { in: ['CONFIRMED', 'SUGGESTED'] },
        kind:       'ACTION',
        type:       { notIn: waitTypes.map(t => t.key) },
      },
      orderBy: { remindAt: 'asc' },
      take: 500,
      include: {
        note: { select: { id: true, title: true, createdById: true, isPublished: true, owners: { select: { userId: true } } } },
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

        // Every owner, or just the step's lead (0108).
        let created = false;
        for (const alert of plan.alerts) created = (await notifyUser(alert)).created || created;

        // Stamp whether or not the bell accepted it. A duplicate means the
        // person has already been told; leaving it unstamped would make this
        // row reappear in tomorrow's sweep for no reason.
        await prisma.noteAction.update({ where: { id: action.id }, data: { remindedAt: now } });

        if (created) log.sent++; else log.skipped++;
      } catch (err) {
        log.errors.push(`${action.id}: ${err?.message ?? err}`);
      }
    }

    // Check-in emails, written a day ahead (Mike 9-26). Last, with whatever time
    // is left, so a long backlog never crowds out the reminders above.
    try {
      log.checkIns = await writeDueCheckInDrafts({ now, budgetMs: Math.max(0, 20_000 - (Date.now() - now.getTime())) });
    } catch (err) {
      log.errors.push(`checkIns: ${err?.message ?? err}`);
    }

    return NextResponse.json({ ok: true, log });
  } catch (err) {
    console.error('[cron/note-reminders]', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'failed' }, { status: 500 });
  }
}
