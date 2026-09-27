/**
 * Check-in emails, the rules (Mike 9-26: "a day ahead"). Pure, no database.
 *
 * A person is due for a check-in the first day they show on the check-ins list:
 * their cadence has run out since we last saw or spoke to them, and any snooze
 * is over. The email is written the day BEFORE that, so it is waiting on My Desk
 * that morning. One email per person per check-in: a new one only after we have
 * been in touch again, or after a snooze.
 */
import { QUIET_AFTER_DAYS } from '../meeting/cards.js';

const DAY = 86_400_000;
export const DRAFT_DAYS_AHEAD = 1;

const dayOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => new Date(dayOf(d).getTime() + n * DAY);

/** The person's own cadence, else their company's, else their tier's, else the measured default. */
export function cadenceDaysFor(contact, ruleByTier = {}) {
  return contact.cadenceDays
    ?? contact.client?.cadenceDays
    ?? (contact.cadenceTier ? ruleByTier[contact.cadenceTier] : null)
    ?? QUIET_AFTER_DAYS;
}

/** When this round of the check-in started: our last touch, or the end of a snooze. */
export function checkInCycleStart(contact) {
  const ref = contact.lastInPersonAt ?? contact.lastTouchpointAt;
  if (!ref) return null;
  const snooze = contact.nextCheckInAt ? new Date(contact.nextCheckInAt) : null;
  return snooze && snooze > new Date(ref) ? snooze : new Date(ref);
}

/** First day the person shows as due on the check-ins list. Null with no touch on record. */
export function checkInDueDay(contact, cadenceDays) {
  const ref = contact.lastInPersonAt ?? contact.lastTouchpointAt;
  if (!ref) return null;
  const byCadence = addDays(ref, cadenceDays + 1);
  const bySnooze = contact.nextCheckInAt ? addDays(contact.nextCheckInAt, 1) : null;
  return bySnooze && bySnooze > byCadence ? bySnooze : byCadence;
}

/**
 * Should a check-in email be written for this person now?
 * `lastDraftAt` = when the newest check-in email to them was written, if ever.
 */
export function wantsCheckInDraft(contact, { cadenceDays, lastDraftAt = null, now = new Date() }) {
  if (!contact.email) return false;
  const due = checkInDueDay(contact, cadenceDays);
  if (!due || dayOf(now) < addDays(due, -DRAFT_DAYS_AHEAD)) return false;
  const start = checkInCycleStart(contact);
  return !lastDraftAt || new Date(lastDraftAt) < start;
}

/** Due, or due tomorrow: the day its email is written, whether or not there is an email address. */
export function isCheckInDue(contact, cadenceDays, now = new Date()) {
  const due = checkInDueDay(contact, cadenceDays);
  return Boolean(due) && dayOf(now) >= addDays(due, -DRAFT_DAYS_AHEAD);
}

/** Whose desk: the person's own owner, else the company's, else whoever last met them. Active users only. */
export function pickOwner(ids, activeIds) {
  return ids.find(id => id && activeIds.has(id)) || null;
}

/** Due tomorrow or today first (the day-ahead emails), then the backlog, longest waiting first. */
export function checkInOrder(a, b, now = new Date()) {
  const fresh = x => (dayOf(now) >= addDays(x.due, -DRAFT_DAYS_AHEAD) && dayOf(now) <= dayOf(x.due) ? 0 : 1);
  return fresh(a) - fresh(b) || a.due - b.due;
}
