/**
 * My Desk (Mike 9-26): the one place a salesperson looks. Reminders from sales
 * notes, email drafts waiting for review, check-ins due, notes to finish.
 *
 * "We need them to really kind of have one place where they have information
 * or need to review things like reminders in draft emails."
 *
 * Pure: no imports, safe in the browser and in tests.
 */

const DAY = 24 * 60 * 60 * 1000;
export const MAX_SNOOZE_DAYS = 365;

/** The quick snooze buttons. Any other number, or a date, can be typed. */
export const SNOOZE_PRESETS = [
  { days: 1, label: 'Tomorrow' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
];

/** Groups, in the order they show on the page. */
export const DESK_GROUPS = [
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'TODAY',   label: 'Today' },
  { key: 'WEEK',    label: 'This week' },
  { key: 'WAITING', label: 'Waiting on them' },
  { key: 'LATER',   label: 'Later or no date' },
  { key: 'SNOOZED', label: 'Snoozed' },
  { key: 'PAUSED',  label: 'Paused' },
];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

/**
 * When a snooze ends. { days } is any whole number 1 to 365; { date } is a
 * YYYY-MM-DD picked by hand and wins over days. Returns null when neither is usable.
 * A picked date comes back at 8am Eastern (12:00 UTC), before the morning sweep.
 */
export function snoozeUntil({ days, date } = {}, now = new Date()) {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    const d = new Date(`${date}T12:00:00Z`);
    return Number.isNaN(d.getTime()) || d <= now ? null : d;
  }
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n < 1 || n > MAX_SNOOZE_DAYS) return null;
  return new Date(now.getTime() + n * DAY);
}

/** The date a step is due on the desk: the snooze end, else its reminder, else its due date. */
export function deskDue(a, now = new Date()) {
  if (a.snoozedUntil && new Date(a.snoozedUntil) > now) return new Date(a.snoozedUntil);
  const d = a.remindAt || a.dueDate;
  return d ? new Date(d) : null;
}

/** Which group a step sits in. `waiting` = its type waits on the other person. */
export function deskGroup(a, { waiting = false, now = new Date() } = {}) {
  if (a.pausedAt) return 'PAUSED';
  if (a.snoozedUntil && new Date(a.snoozedUntil) > now) return 'SNOOZED';
  const due = deskDue(a, now);
  const today = startOfDay(now);
  if (due && due < today) return 'OVERDUE';
  if (due && due < new Date(today.getTime() + DAY)) return 'TODAY';
  if (waiting) return 'WAITING';
  if (due && due < new Date(today.getTime() + 8 * DAY)) return 'WEEK';
  return 'LATER';
}

/** Steps sorted into the groups, soonest first inside each; empty groups dropped. */
export function groupDesk(items, { isWaiting = () => false, now = new Date() } = {}) {
  const by = new Map(DESK_GROUPS.map(g => [g.key, []]));
  for (const a of items) by.get(deskGroup(a, { waiting: isWaiting(a), now })).push(a);
  const t = a => deskDue(a, now)?.getTime() ?? Infinity;
  return DESK_GROUPS
    .map(g => ({ ...g, items: by.get(g.key).sort((x, y) => t(x) - t(y)) }))
    .filter(g => g.items.length);
}

/** The number on the sidebar and the dashboard card: things to act on now. */
export function deskAttention({ groups = [], drafts = 0 } = {}) {
  const now = groups.filter(g => g.key === 'OVERDUE' || g.key === 'TODAY').reduce((n, g) => n + g.items.length, 0);
  return now + drafts;
}

/** Browser event fired after a desk change, so the sidebar count refreshes. */
export const DESK_CHANGED = 'ilc:desk-changed';
