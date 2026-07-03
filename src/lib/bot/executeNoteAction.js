/**
 * executeNoteAction.js — baseline behavior when a NoteAction is confirmed.
 *
 *  • Email / Send-materials / Schedule → marked "ready"; the note consolidates
 *    ALL of a contact's asks into ONE email (see composeOutreach).
 *  • Expect-intro → schedules a reminder (remindAt).
 *  • Text / Call → confirmed to-do only — the bot can't send texts or place
 *    calls yet (down the road), so no draft is produced.
 *  • Add-to-list / Internal task / Other → confirmed to-do.
 */
import { prisma } from '@/lib/db';
import { OUTREACH_EMAIL_METHODS } from '@/lib/bot/composeOutreach';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} action  a NoteAction row
 * @param {object} type    its NoteActionType row (executor, reminderDays, …)
 * @param {object} opts    { ownerUserId, reviewWindowMinutes }
 */
export async function executeNoteAction(action, type, opts = {}) {
  const executor = type?.executor || 'OTHER';
  const now = new Date();

  // Email / Send-materials / Schedule → don't draft per item. Mark "ready" so the
  // note can consolidate ALL of a contact's asks into ONE email (composeOutreach).
  if (OUTREACH_EMAIL_METHODS.has(executor)) {
    await prisma.noteAction.update({ where: { id: action.id }, data: { confirmedAt: now } });
    return { ready: true, detail: 'ready for consolidated outreach email' };
  }

  // EXPECT_INTRO → schedule a reminder rather than drafting now.
  if (executor === 'EXPECT_INTRO') {
    const days = action.reminderDays ?? type?.reminderDays ?? 7;
    const remindAt = new Date(now.getTime() + days * DAY_MS);
    await prisma.noteAction.update({
      where: { id: action.id },
      data: { confirmedAt: now, remindAt },
    });
    return { remindAt, executed: false };
  }

  // Text / Call / Add-to-list / Internal task / Other → confirmed to-do, no draft
  // (the bot can't text or call yet — those stay manual tasks for now).
  await prisma.noteAction.update({
    where: { id: action.id },
    data: { confirmedAt: now, executedAt: now },
  });
  return { executed: true };
}

/**
 * Find EXPECT_INTRO actions whose reminder is due and create reminder drafts.
 * Called by the queue processor (cron). Returns the number of reminders fired.
 */
export async function fireDueIntroReminders() {
  const now = new Date();
  const due = await prisma.noteAction.findMany({
    where: {
      status: 'CONFIRMED',
      remindAt: { not: null, lte: now },
      executedAt: null,
    },
    include: { note: { select: { id: true, title: true, createdById: true } } },
    take: 100,
  });

  let fired = 0;
  for (const a of due) {
    const ownerUserId = a.note?.createdById;
    if (!ownerUserId) {
      // No owner to notify — just clear the reminder so we don't loop.
      await prisma.noteAction.update({ where: { id: a.id }, data: { executedAt: now } });
      continue;
    }
    const who    = a.contactName || 'someone';
    const target = a.targetName ? ` to ${a.targetName}` : '';
    const draft = await prisma.botDraft.create({
      data: {
        userId:  ownerUserId,
        type:    'FOLLOW_UP',   // surfaces in the Bot Queue → Follow-Ups tab
        status:  'PENDING_REVIEW',
        toEmail: '',
        toName:  who,
        subject: `Reminder: intro from ${who}${target}`,
        body:    `You were expecting ${who} to make an intro${target}. It's been a while — follow up?\n\n(From note: ${a.note?.title || ''})`,
        reviewWindowMinutes: 30,
        classificationReason: 'Expect-intro reminder',
      },
    });
    await prisma.noteAction.update({ where: { id: a.id }, data: { executedAt: now, botDraftId: draft.id } });
    fired++;
  }
  return fired;
}
