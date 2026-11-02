// Sales expenses (0129, Mike 10-9): "tie salesperson expenses to sales
// activity" and "how many meetings or how much money does it take to get the
// first project with a client".
//
// Pure helpers shared by the API routes, the note editor, the Activity page
// and the client page. No prisma here: the browser imports this file.

export const EXPENSE_CATEGORIES = [
  { key: 'MEAL',   label: 'Meal or drinks' },
  { key: 'TRAVEL', label: 'Travel' },
  { key: 'GOLF',   label: 'Golf' },
  { key: 'EVENT',  label: 'Event or tickets' },
  { key: 'GIFT',   label: 'Gift' },
  { key: 'OTHER',  label: 'Other' },
];
export const EXPENSE_CATEGORY_KEYS = EXPENSE_CATEGORIES.map(c => c.key);

export function categoryLabel(key) {
  return (EXPENSE_CATEGORIES.find(c => c.key === key) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]).label;
}

export function normalizeCategory(key) {
  return EXPENSE_CATEGORY_KEYS.includes(key) ? key : 'OTHER';
}

// A note's activity type says what kind of money it was.
const ACTIVITY_TO_CATEGORY = {
  COFFEE: 'MEAL', MEAL: 'MEAL', LUNCH: 'MEAL', HAPPY_HOUR: 'MEAL',
  GOLF: 'GOLF', TRAVEL: 'TRAVEL', SITE_VISIT: 'TRAVEL', EVENT: 'EVENT',
};
export function categoryForActivity(activityType) {
  return ACTIVITY_TO_CATEGORY[activityType] || 'OTHER';
}

/**
 * What someone typed into an amount box, to whole cents.
 *   "$1,234.50" | "1234.5" | 1234.5  -> 123450
 *   "" | null | undefined            -> null   (nothing entered)
 *   "abc" | "-5" | "1.234"           -> undefined (not a money amount)
 */
export function parseAmountCents(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return undefined;
    return Math.round(input * 100);
  }
  const s = String(input).replace(/[$,\s]/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return undefined;
  return Math.round(Number(s) * 100);
}

/** Cents back to what the amount box shows: 123450 -> "1234.50"; null -> "". */
export function centsToInput(cents) {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

/** Cents to money for reading: 123450 -> "$1,234.50"; 120000 -> "$1,200". */
export function formatMoney(cents) {
  const n = (Number(cents) || 0) / 100;
  const whole = Number.isInteger(n);
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

// ── Cost to first project ───────────────────────────────────────────────────
//
// One client's road to its first won project. Everything dated on or before
// the first win counts; a client with no win yet shows what has gone in so far.
//
//   notes:      published sales notes naming the client
//               [{ date, isInPerson, userId }]   (date = meetingDate, else createdAt)
//   expenses:   [{ spentOn, amountCents }]
//   firstWinAt: Date | string | null   (earliest WON status event on any of the
//               client's projects; see src/lib/sales/firstProject.js)
//   approximated: true when that date was a guess (deal history backfill), so
//               the per-client figures show but the averages leave the client out.

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

export function costToFirstProject({ notes = [], expenses = [], firstWinAt = null, approximated = false } = {}) {
  const cut = toDate(firstWinAt);
  const before = v => { const d = toDate(v); return !!d && (!cut || d <= cut); };

  const ns = (notes || []).filter(n => before(n.date));
  const es = (expenses || []).filter(e => before(e.spentOn));
  const firstTouchAt = ns.reduce((min, n) => { const d = toDate(n.date); return !min || d < min ? d : min; }, null);
  const spentCents = es.reduce((s, e) => s + (Number(e.amountCents) || 0), 0);

  return {
    won:          !!cut,
    approximated: !!cut && !!approximated,
    firstWinAt:   cut ? cut.toISOString() : null,
    firstTouchAt: firstTouchAt ? firstTouchAt.toISOString() : null,
    meetings:     ns.length,
    inPerson:     ns.filter(n => !!n.isInPerson).length,
    spentCents,
    daysToWin:    cut && firstTouchAt ? Math.max(0, Math.round((cut - firstTouchAt) / 86400000)) : null,
  };
}

function mean(xs)   { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Averages over many clients' rows (from costToFirstProject). Only clients
 * with a dated, non-approximated first win go into the averages; the others
 * are counted so the page can say how many are still open.
 */
export function summarizeFirstProjectCosts(rows = []) {
  const won   = rows.filter(r => r.won && !r.approximated);
  const open  = rows.filter(r => !r.won);
  const days  = won.map(r => r.daysToWin).filter(d => d !== null && d !== undefined);
  return {
    clients:            rows.length,
    wonClients:         won.length,
    approximatedClients: rows.filter(r => r.won && r.approximated).length,
    openClients:        open.length,
    avgMeetings:        mean(won.map(r => r.meetings)),
    medianMeetings:     median(won.map(r => r.meetings)),
    avgInPerson:        mean(won.map(r => r.inPerson)),
    avgSpentCents:      mean(won.map(r => r.spentCents)),
    medianSpentCents:   median(won.map(r => r.spentCents)),
    avgDaysToWin:       mean(days),
    medianDaysToWin:    median(days),
    openMeetings:       open.reduce((s, r) => s + r.meetings, 0),
    openSpentCents:     open.reduce((s, r) => s + r.spentCents, 0),
  };
}

/**
 * The top numbers on the Expenses page, in whole cents. Rows are { spentOn, amountCents, clientId, client }.
 * `today` is a YYYY-MM-DD day, compared as text so a late evening entry lands on its own day.
 */
export function expenseTopNumbers(rows, year, today) {
  const dayOf = (r) => new Date(r.spentOn).toISOString().slice(0, 10);
  let lastYearCents = 0, ytdCents = 0;
  const byClient = new Map();
  for (const r of rows) {
    const day = dayOf(r), y = Number(day.slice(0, 4));
    if (y === year - 1) lastYearCents += r.amountCents;
    if (y !== year || day > today) continue;
    ytdCents += r.amountCents;
    if (!r.clientId) continue;
    const c = byClient.get(r.clientId) || { name: r.client?.name || 'Unnamed client', cents: 0 };
    c.cents += r.amountCents;
    byClient.set(r.clientId, c);
  }
  const topClient = [...byClient.values()].sort((a, b) => b.cents - a.cents)[0] || null;
  return { lastYearCents, ytdCents, topClient };
}
