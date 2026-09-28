/**
 * Next-step clean-up after the AI reads a note (Mike 9-27). Pure: no imports,
 * safe in tests.
 *   1. "by Friday", "in 2 weeks" → a due date.
 *   2. "remind me to check in with Sam in 2 weeks" → a Remind me step.
 *   3. "email Jane the specs" → Email, not Send materials.
 */

const DAY = 86_400_000;
/** A "remind me" with no date comes back in a week. */
export const REMIND_ME_DEFAULT_DAYS = 7;

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Mike to email…", "Mike: email…" → "email…". Only the ILC person's name comes off. */
function dropLeadName(text, ownerNames = []) {
  let t = String(text || '').trim();
  for (const n of ownerNames) {
    const f = String(n || '').trim().split(/\s+/)[0];
    if (!f) continue;
    const m = t.match(new RegExp(`^${esc(f)}(?:\\s*[:\\-]\\s*|\\s+(?:to|will|should|needs to)\\s+)`, 'i'));
    if (m) { t = t.slice(m[0].length); break; }
  }
  return t;
}

/**
 * The type the step should have, given what the line says.
 * @param valid Set of type keys that exist right now
 */
export function fixStepType(type, rawText, valid = new Set(), ownerNames = []) {
  const t = dropLeadName(rawText, ownerNames).toLowerCase();
  if (valid.has('REMIND_ME') && /^(?:please\s+)?remind me\b/.test(t)) return 'REMIND_ME';
  if (valid.has('EMAIL') && (type === 'SEND_MATERIALS' || type === 'OTHER') && /^(?:e-?mail|shoot (?:an? )?e-?mail)\b/.test(t)) return 'EMAIL';
  return type;
}

const ymd = d => d.toISOString().slice(0, 10);
const atNoon = s => new Date(`${s}T12:00:00.000Z`);

/**
 * The AI's "due" (YYYY-MM-DD), kept only when it is a real date near the
 * meeting: no earlier than a week before it, no later than 13 months after.
 */
export function cleanDue(due, meetingDate = new Date()) {
  const s = String(due || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = atNoon(s);
  if (Number.isNaN(d.getTime()) || ymd(d) !== s) return null;
  const base = new Date(meetingDate || Date.now());
  if (d < new Date(base.getTime() - 7 * DAY) || d > new Date(base.getTime() + 400 * DAY)) return null;
  return d;
}

const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2, few: 3 };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * A backstop when the AI gives no date: the plain phrases people write.
 * "in 2 weeks", "in a month", "tomorrow", "next week", "by Friday", "end of month".
 */
export function dueFromText(rawText, meetingDate = new Date()) {
  const t = String(rawText || '').toLowerCase();
  const base = new Date(meetingDate || Date.now());
  const day0 = atNoon(ymd(base));
  const plus = n => new Date(day0.getTime() + n * DAY);
  let m = t.match(/\bin\s+(?:a\s+)?(\d+|an?|one|two|three|four|five|six|couple(?: of)?|few)\s+(day|week|month)s?\b/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUM[m[1].replace(' of', '')] || 1;
    return plus(n * (m[2] === 'day' ? 1 : m[2] === 'week' ? 7 : 30));
  }
  if (/\btomorrow\b/.test(t)) return plus(1);
  if (/\bnext week\b/.test(t)) return plus(7);
  if (/\b(?:end of (?:the )?month|eom)\b/.test(t)) return atNoon(ymd(new Date(Date.UTC(day0.getUTCFullYear(), day0.getUTCMonth() + 1, 0))));
  m = t.match(/\b(?:by|on|this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) {
    let ahead = (WEEKDAYS.indexOf(m[1]) - day0.getUTCDay() + 7) % 7 || 7;
    if (/\bnext\s/.test(m[0]) && ahead < 7) ahead += 7;
    return plus(ahead);
  }
  return null;
}

/** The step's due date: the AI's answer if it is sound, else the plain-phrase backstop, else none. */
export function stepDue(aiDue, rawText, meetingDate) {
  return cleanDue(aiDue, meetingDate) || dueFromText(rawText, meetingDate);
}

/** When a Remind me step goes off: its due date, else a week after the meeting (never in the past). */
export function remindMeAt(dueDate, meetingDate, now = new Date()) {
  if (dueDate) return new Date(dueDate);
  const from = new Date(Math.max(new Date(meetingDate || now).getTime(), now.getTime() - DAY));
  return new Date(from.getTime() + REMIND_ME_DEFAULT_DAYS * DAY);
}
