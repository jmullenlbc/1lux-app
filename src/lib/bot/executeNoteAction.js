/**
 * executeNoteAction.js — baseline behavior when a NoteAction is confirmed.
 *
 *  • Email / Send-materials / Schedule → marked "ready"; the note consolidates
 *    ALL of a contact's asks into ONE email (see composeOutreach).
 *  • Expect intro / reply / drawings / invite → a "waiting" step: the email
 *    watch closes it when they do it, and the reminder ladder (14/30/60 days
 *    after the meeting, editable) nudges when they don't. See src/lib/followUp/.
 *  • Text / Call → confirmed to-do only — the bot can't send texts or place
 *    calls yet (down the road), so no draft is produced.
 *  • Add-to-list / Internal task / Other → confirmed to-do.
 */
import { prisma } from '@/lib/db';
import { OUTREACH_EMAIL_METHODS } from '@/lib/bot/composeOutreach';
import { isWaitExecutor } from '@/lib/followUp/watch';
import { firstRemindAt, sendDueWaitReminders } from '@/lib/followUp/engine';
import { remindMeAt } from '@/lib/notes/stepFixes';

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

  // Waiting on THEM (intro, reply, drawings, invite) → start the watch and put
  // the first rung of the reminder ladder on the calendar. Counted from the
  // meeting, not from publish, so a note written a week late is not a week late
  // on every reminder too.
  if (isWaitExecutor(executor)) {
    const note = await prisma.note.findUnique({ where: { id: action.noteId }, select: { meetingDate: true } });
    const remindAt = firstRemindAt({ ...action, confirmedAt: action.confirmedAt || now }, type, note || {});
    await prisma.noteAction.update({
      where: { id: action.id },
      data: { confirmedAt: action.confirmedAt || now, remindAt, reminderCount: 0 },
    });
    return { remindAt, executed: false };
  }

  // "Remind me" (Mike 9-27): the bell goes off on the due date, else a week
  // after the meeting. The step stays open until someone marks it done.
  if (executor === 'REMINDER') {
    const note = await prisma.note.findUnique({ where: { id: action.noteId }, select: { meetingDate: true } });
    const remindAt = action.remindAt || remindMeAt(action.dueDate, note?.meetingDate, now);
    await prisma.noteAction.update({ where: { id: action.id }, data: { confirmedAt: action.confirmedAt || now, remindAt } });
    return { remindAt, executed: false };
  }

  // Text / Call / Add-to-list / Internal task / Other → confirmed to-do, no draft
  // (the bot can't text or call yet — those stay manual tasks for now). A step
  // with a deadline ("by Friday") rings the bell on that day.
  await prisma.noteAction.update({
    where: { id: action.id },
    data: { confirmedAt: now, executedAt: now, ...(action.dueDate && !action.remindAt ? { remindAt: action.dueDate } : {}) },
  });
  return { executed: true };
}

/**
 * Waiting steps whose reminder is due → one "still waiting" draft per person
 * per note, and the next rung. Kept under its old name for the queue
 * processor; the work is src/lib/followUp/engine.js (Mike 9-25).
 */
export async function fireDueIntroReminders() {
  const log = await sendDueWaitReminders(prisma);
  return log.drafted;
}
