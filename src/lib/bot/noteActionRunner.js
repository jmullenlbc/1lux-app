/**
 * noteActionRunner.js — runs the bot side of a note's actions, but ONLY for
 * PUBLISHED notes. While a note is a draft, confirming actions just records
 * them; nothing is drafted, scheduled, or rule-fired until the note is published
 * (the publish toggle is the "go" switch for the bot + reviews).
 */
import { prisma } from '@/lib/db';
import { runTrigger } from '@/lib/bot/ruleEngine';
import { draftContactOutreach, OUTREACH_EMAIL_METHODS } from '@/lib/bot/composeOutreach';

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
    prisma.note.findUnique({ where: { id: noteId }, select: { createdById: true, title: true } }),
    action.contactId
      ? prisma.contact.findUnique({ where: { id: action.contactId }, select: { id: true, name: true, email: true, company: true } }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const rw = opts.reviewWindowMinutes ?? await reviewWindow();

  // Trigger baseline + user rules — once per action (guard on executed/remind).
  if (!action.executedAt && !action.remindAt) {
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
      ownerUserId: note?.createdById, contact, reviewWindowMinutes: rw,
      action, type, noteActionId: action.id, eventRef: action.id,
    });
  }

  // Consolidate the contact's outreach email (recompose-aware, idempotent).
  if (OUTREACH_EMAIL_METHODS.has(type?.executor) && action.contactId) {
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

/** On publish: execute every confirmed action on the note. */
export async function executeNotePublished(noteId) {
  const actions = await prisma.noteAction.findMany({
    where: { noteId, kind: 'ACTION', status: 'CONFIRMED' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const rw = await reviewWindow();
  for (const a of actions) {
    try { await fireNoteActionConfirmed(noteId, a.id, { reviewWindowMinutes: rw }); }
    catch (e) { console.error('[executeNotePublished] action failed:', a.id, e?.message ?? e); }
  }
  return actions.length;
}
