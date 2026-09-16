/**
 * draftReminder.js — the reminder about unpublished calendar notes.
 *
 * Mike, 2026-09-15: calendar drafts never expire, and "there should be a
 * reminder that never leaves". Every synced meeting becomes a DRAFT note, and
 * nothing the bot does with a note happens until a person publishes it. A draft
 * nobody publishes is a meeting that quietly never counted.
 *
 * So the reminder has no close button and no snooze. The only way to make it go
 * away is to publish (or archive) the note.
 *
 * What counts, for one person:
 *   - a note the calendar made (calendarRef set) that they own,
 *   - still a draft, not archived,
 *   - for a meeting that has already started. A meeting next week has nothing
 *     to write up yet, so it is not nagged about until it happens.
 *
 * No imports, so the rule is testable and the screen and the count route can
 * never disagree about what a waiting draft is.
 */

/** Prisma `where` for one person's waiting calendar drafts. */
export function draftReminderWhere(userId, now = new Date()) {
  return {
    createdById: userId,
    calendarRef: { not: null },
    isPublished: false,
    archivedAt:  null,
    OR: [{ meetingDate: null }, { meetingDate: { lte: now } }],
  };
}

/** The same rule for one note already on screen (the notes list filter). */
export function isReminderDraft(note, userId, now = new Date()) {
  if (!note || !userId) return false;
  if (note.createdById !== userId) return false;
  if (!note.calendarRef || note.isPublished || note.archivedAt) return false;
  if (note.meetingDate == null) return true;
  const d = new Date(note.meetingDate);
  return Number.isNaN(d.getTime()) || d <= now;
}

/** One plain sentence for the banner. Empty when there is nothing waiting. */
export function draftReminderText(count) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  return n === 1
    ? '1 meeting from your calendar still needs its note published.'
    : `${n} meetings from your calendar still need their notes published.`;
}
