/**
 * noteActionRunner.js — runs the bot side of a note's actions, but ONLY for
 * PUBLISHED notes. While a note is a draft, confirming actions just records
 * them; nothing is drafted, scheduled, or rule-fired until the note is published
 * (the publish toggle is the "go" switch for the bot + reviews).
 */
import { prisma } from '@/lib/db';
import { runTrigger } from '@/lib/bot/ruleEngine';
import { draftContactOutreach, RECAP_EMAIL_METHODS } from '@/lib/bot/composeOutreach';
import { isWaitExecutor } from '@/lib/followUp/watch';
import { firstRemindAt } from '@/lib/followUp/engine';

async function reviewWindow() {
  try { const cfg = await prisma.botConfig.findFirst(); if (cfg?.reviewWindowMinutes > 0) return cfg.reviewWindowMinutes; } catch {}
  return 30;
}

/**
 * Execute one CONFIRMED action: run the trigger (baseline + user if-then rules)
 * once, then (re)consolidate the contact's outreach email. Safe to call repeatedly.
 */
export async function fireNoteActionConfirmed(noteId, actionId, opts = {}) {
  const action = await prisma.noteAction.findUnique({ where: { id: actionId } });
  if (!action || action.kind === 'INTEL' || action.status !== 'CONFIRMED') return;

  const [type, note, contact] = await Promise.all([
    prisma.noteActionType.findUnique({ where: { key: action.type } }),
    prisma.note.findUnique({ where: { id: noteId }, select: { createdById: true, title: true, meetingDate: true } }),
    action.contactId
      ? prisma.contact.findUnique({ where: { id: action.contactId }, select: { id: true, name: true, email: true, company: true } }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const rw = opts.reviewWindowMinutes ?? await reviewWindow();

  // Trigger baseline + user rules — once per action. A waiting step (intro,
  // reply, drawings, invite) is also in the recap email, which stamps
  // executedAt on it — so for those, "already started" means its reminder
  // ladder has begun, not executedAt. (Found by the Lee demo, 9-25: only the
  // first waiting step on a note ever got a reminder date.)
  const waiting = isWaitExecutor(type?.executor);
  const started = waiting
    ? Boolean(action.remindAt || action.reminderCount || action.fulfilledAt)
    : Boolean(action.executedAt || action.remindAt);
  if (!started) {
    const payload = {
      method:      type?.executor || action.type,
      typeKey:     action.type,
      typeLabel:   type?.label || action.type,
      contactName: action.contactName || '',
      company:     action.company || contact?.company || '',
      targetName:  action.targetName || '',
      hasContact:  !!action.contactId,
      detail:      action.detail || action.rawText || '',
      rawText:     action.rawText || '',
      noteTitle:   note?.title || '',
    };
    await runTrigger('NOTE_ACTION_CONFIRMED', payload, {
      ownerUserId: action.leadUserId || note?.createdById, contact, reviewWindowMinutes: rw,
      action, type, noteActionId: action.id, eventRef: action.id,
    });
  } else if (waiting && !action.remindAt && !action.fulfilledAt) {
    // Re-published after a pause: pick the ladder up on the rung it was on.
    const remindAt = firstRemindAt(action, type, note || {});
    if (remindAt) await prisma.noteAction.update({ where: { id: action.id }, data: { remindAt } });
  }

  // Consolidate the contact's outreach email (recompose-aware, idempotent).
  if (RECAP_EMAIL_METHODS.has(type?.executor) && action.contactId) {
    await draftContactOutreach(noteId, action.contactId, note?.createdById, rw);
  }
}

/**
 * On revert-to-draft: pause the bot for this note. Any unsent drafts it created
 * go back to a paused 'DRAFT' state (out of the review queue) and the actions'
 * executed/reminder flags are cleared — so on re-publish they re-run and the
 * SAME draft is reactivated + updated with anything new. Sent drafts are left
 * alone (can't un-send).
 */
export async function pauseNoteOnUnpublish(noteId) {
  const actions = await prisma.noteAction.findMany({
    where: { noteId, kind: 'ACTION', status: 'CONFIRMED' },
    select: { id: true, botDraftId: true },
  });
  const draftIds = [...new Set(actions.map(a => a.botDraftId).filter(Boolean))];
  if (draftIds.length) {
    // Only pending (unsent) drafts get paused; sent/cancelled stay as-is.
    await prisma.botDraft.updateMany({
      where: { id: { in: draftIds }, status: 'PENDING_REVIEW' },
      data: { status: 'DRAFT' },
    });
  }
  // Reset execution so re-publish re-runs everything (keep botDraftId for reuse).
  await prisma.noteAction.updateMany({
    where: { noteId, kind: 'ACTION', status: 'CONFIRMED' },
    data: { executedAt: null, remindAt: null },
  });
  return actions.length;
}

/**
 * On publish: fire the NOTE_PUBLISHED trigger, then execute every confirmed
 * action on the note.
 *
 * The trigger goes first and deliberately so: a rule built on "a sales note is
 * published" is usually about the note as a whole (log it, tell someone, tag
 * it), and should not have to wait behind however many emails the actions
 * queue. It was also, until 2026-08-22, never fired at all — the trigger was
 * offered in the rule builder and nothing in the app raised it, so any rule
 * anyone built on it sat there looking active and never ran once.
 */
export async function executeNotePublished(noteId) {
  const [note, actions] = await Promise.all([
    prisma.note.findUnique({
      where:  { id: noteId },
      select: { id: true, title: true, activityType: true, createdById: true },
    }),
    prisma.noteAction.findMany({
      where: { noteId, kind: 'ACTION', status: 'CONFIRMED' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const rw = await reviewWindow();

  try {
    await runTrigger('NOTE_PUBLISHED', {
      noteTitle:    note?.title || '',
      activityType: note?.activityType || '',
    }, {
      ownerUserId: note?.createdById,
      reviewWindowMinutes: rw,
      eventRef: noteId,
    });
  } catch (e) {
    // A rule misbehaving must not stop the note's own actions from running.
    console.error('[executeNotePublished] NOTE_PUBLISHED trigger failed:', e?.message ?? e);
  }

  for (const a of actions) {
    try { await fireNoteActionConfirmed(noteId, a.id, { reviewWindowMinutes: rw }); }
    catch (e) { console.error('[executeNotePublished] action failed:', a.id, e?.message ?? e); }
  }
  return actions.length;
}
