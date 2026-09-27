/**
 * My Desk flags (Mike 9-26): "You had an in-person meeting this week and that
 * person is not in the system. Please add them so the follow-up email can be
 * written." Plus the Quick Note's title. Pure, safe in the browser and tests.
 */
import { OUR_DOMAIN } from '../calendar/worthANote.js';
import { isInPersonType, normalizeActivityType } from '../calendar/inPerson.js';

const DAY = 86_400_000;
/** "This week": meetings in the last seven days. */
export const NEEDS_PERSON_DAYS = 7;

const lower = s => String(s || '').trim().toLowerCase();

/** The outside guests on a meeting (our own people left off). */
export function outsideGuests(attendees) {
  let list = attendees;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const a of list) {
    const email = lower(typeof a === 'string' ? a : a?.email);
    const name = String((typeof a === 'string' ? '' : a?.name) || '').trim();
    if (!email || !email.includes('@') || email.endsWith(`@${OUR_DOMAIN}`) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name });
  }
  return out;
}

/**
 * Is this meeting missing people? Null when it is fine.
 * `note`: { isInPerson, activityType, meetingDate, attendees, peopleSkippedAt, contactCount }
 * `knownEmails`: Set of lower-case emails already in the CRM.
 * @returns { unknown: [{email,name}], nobody: boolean } | null
 */
export function needsPerson(note, knownEmails = new Set(), now = new Date()) {
  if (!note || note.peopleSkippedAt) return null;
  if (!(note.isInPerson || isInPersonType(note.activityType))) return null;
  const when = note.meetingDate ? new Date(note.meetingDate) : null;
  if (!when || when > now || now - when > NEEDS_PERSON_DAYS * DAY) return null;
  const unknown = outsideGuests(note.attendees).filter(g => !knownEmails.has(g.email));
  const nobody = (note.contactCount || 0) === 0 && unknown.length === 0;
  return unknown.length || nobody ? { unknown, nobody } : null;
}

/** A guest's name from their email when the invite has none: jane.doe@x.com → Jane Doe. */
export function nameFromEmail(email) {
  const local = lower(email).split('@')[0] || '';
  return local.split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

const TYPE_WORDS = {
  COFFEE: 'Coffee', MEAL: 'Meal', GOLF: 'Golf', HAPPY_HOUR: 'Happy hour', SITE_VISIT: 'Site visit',
  CALL: 'Call', EVENT: 'Event', TRAVEL: 'Trip', OTHER: 'Meeting',
};

/** The Quick Note's picks, phone first. */
export const QUICK_NOTE_TYPES = ['COFFEE', 'MEAL', 'SITE_VISIT', 'CALL', 'HAPPY_HOUR', 'GOLF', 'EVENT', 'OTHER']
  .map(key => ({ key, label: TYPE_WORDS[key] }));

/** "Coffee with Jane Doe and Sam Lee". */
export function quickNoteTitle(activityType, people = []) {
  const word = TYPE_WORDS[normalizeActivityType(activityType)] || 'Note';
  const names = people.map(p => p?.name).filter(Boolean);
  if (!names.length) return word;
  const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  return `${word} with ${list}`;
}

/**
 * After someone is added to a published meeting: which of its loose next steps
 * (no person on them yet) are theirs? A named step whose name matches, or any
 * unnamed step when they are now the only person on the note (same rule as publish).
 */
export function stepIsFor(stepName, personName, onlyPerson) {
  const n = lower(stepName);
  if (!n) return Boolean(onlyPerson);
  const full = lower(personName);
  return n === full || n === full.split(/\s+/)[0] || full.startsWith(`${n} `);
}
