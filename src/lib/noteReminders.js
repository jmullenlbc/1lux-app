/**
 * noteReminders.js, deciding what a due sales-note reminder should do.
 *
 * ── Why this is not just written into the cron route ──
 * The route has to import `@/lib/db`, `@/lib/auth` and `next/server`, which
 * makes it unloadable outside a Next build and therefore untestable. The rules
 * below are the part that can actually be wrong, who gets nudged, what the
 * nudge says, and when a reminder is too old to be worth showing, so they live
 * here as one pure function with no imports, and the route stays a loop that
 * reads rows, calls this, and writes rows.
 */

/**
 * A reminder that came due long ago is stale rather than urgent. Surfacing a
 * three-month-old nudge as if it were new is noise, and noise in the bell is
 * how a bell stops being read.
 */
export const MAX_LATE_DAYS = 30;

/**
 * Who hears about a step (0108, Mike 9-27): its lead, else every owner of the
 * note. A note from before 0108 with no owner rows falls back to its author.
 * Copied from src/lib/notes/owners.js so this file keeps no imports.
 */
function recipientsOf(action) {
  const note = action.note || {};
  let owners = [...new Set((note.owners || []).map(o => o.userId).filter(Boolean))];
  if (!owners.length && note.createdById) owners = [note.createdById];
  const lead = action.leadUserId;
  if (lead && (!owners.length || owners.includes(lead))) return [lead];
  return owners;
}

/**
 * Decide what to do with one note-action that the sweep found due.
 *
 * Pure. Returns one of three shapes, and never throws:
 *
 *   { do: 'skip',  reason }, leave the row alone, look again tomorrow
 *   { do: 'stale', reason }, stamp it so it stops coming back, tell nobody
 *   { do: 'send',  alert, reason }, stamp it AND ring the bell with `alert`
 *
 * @param {object} action  a NoteAction with its `note` included
 * @param {object} [opts]
 * @param {Date}   [opts.now]
 * @param {number} [opts.maxLateDays]
 */
export function planNoteReminder(action, { now = new Date(), maxLateDays = MAX_LATE_DAYS } = {}) {
  if (!action?.id) return { do: 'skip', reason: 'no action' };

  // A note reverted to draft is being reworked by a human right now. Nudging
  // about an action inside it is nagging about something they are holding.
  if (!action.note?.isPublished) return { do: 'skip', reason: 'note not published' };

  // Skip rather than stamp: the note has an author in every normal case, and a
  // missing one is a data problem worth still being visible tomorrow.
  const recipients = recipientsOf(action);
  if (!recipients.length) return { do: 'skip', reason: 'note has no author' };

  // Guard the raw value before constructing: `new Date(null)` is the epoch, a
  // perfectly valid date that is due, and 56 years stale, so a row with no
  // reminder date would be stamped and thrown away instead of skipped.
  if (action.remindAt == null) return { do: 'skip', reason: 'no remindAt' };
  const remindAt = action.remindAt instanceof Date ? action.remindAt : new Date(action.remindAt);
  if (Number.isNaN(remindAt.getTime())) return { do: 'skip', reason: 'unparseable remindAt' };
  if (remindAt > now) return { do: 'skip', reason: 'not due yet' };

  const cutoff = new Date(now.getTime() - maxLateDays * 86400000);
  if (remindAt < cutoff) return { do: 'stale', reason: `over ${maxLateDays} days late` };

  // Whoever the follow-up is about, in the order the bot is most likely to have
  // got right. The fallback is deliberately vague rather than blank, "Reminder:"
  // with nothing after it reads as a bug.
  const who  = action.contactName || action.targetName || action.company || 'a contact';
  const what = action.detail || action.rawText || 'a follow-up you set';
  // A "Remind me" step is about the thing to do, not a person.
  const title = action.type === 'REMIND_ME' && !action.contactName
    ? `Reminder: ${String(what).slice(0, 80)}`
    : `Reminder: ${who}`;

  // One bell per person. Keyed on the action, not on the day: the point of the
  // key is that this reminder can only ever be shown once, even if the stamp
  // fails to save. The author keeps the old key so nothing already shown repeats.
  const alerts = recipients.map(userId => ({
    userId,
    type:    'NOTE_REMINDER',
    title,
    message: String(what).slice(0, 400),
    link:    '/sales/desk',
    dedupeKey: userId === action.note.createdById
      ? `noteAction:${action.id}:reminder`
      : `noteAction:${action.id}:reminder:${userId}`,
  }));

  return { do: 'send', reason: 'due', alert: alerts[0], alerts };
}
