// numberInput.js — one reading of "what number did they type?"
//
// People type money and counts the way they write them: "1,200,000",
// "$41,200.50", "226,000 SF", "12%", "(500)". JavaScript disagrees with
// every one of those: Number("1,200,000") is NaN (which blanked the money
// field, Maram 9-18) and parseFloat("1,200,000") is 1 (which silently saved
// the wrong figure). Every route that turns a typed value into a number goes
// through here instead (Mike 9-18: "any field that is a currency or number
// field [must] be okay with accepting commas").
//
// Pure module: no pricing, no Prisma, safe to import from the public bundle.

/**
 * parseLooseNumber(v)
 *   undefined            → undefined   (field not sent — leave it alone)
 *   null | '' | '   '    → null        (deliberately blank)
 *   12 / 12.5            → 12 / 12.5   (already a number; NaN/Infinity → NaN)
 *   "1,200,000"          → 1200000
 *   "$41,200.50"         → 41200.5
 *   "226,000 SF" / "12%" → 226000 / 12 (units and % are dressing)
 *   "-500" / "(500)"     → -500        (accounting parentheses = negative)
 *   "abc" / "$" / "1.2.3"→ NaN         (typed something, but not a number)
 *
 * NaN means "refuse this", never "treat as zero" — callers decide whether
 * that is a 400, a skip, or a fallback. Use Number.isFinite() to check.
 */
export function parseLooseNumber(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') {
    // Booleans, objects, arrays: nobody typed those into a number box.
    return NaN;
  }
  let s = v.trim();
  if (s === '') return null;

  // "(500)" is how accounting writes -500.
  let negative = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) { negative = true; s = paren[1].trim(); }

  // Strip everything that is not part of the number itself: currency
  // marks, thousands separators, spaces, unit words, a trailing %.
  // Keep digits, one dot and a leading minus.
  const lead = /^-/.test(s);
  s = s.replace(/[^0-9.]/g, '');
  if (!/[0-9]/.test(s)) return NaN;          // "$", "abc", "SF" — not a number
  if ((s.match(/\./g) || []).length > 1) return NaN; // "1.2.3"
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return (lead || negative) ? -n : n;
}

/**
 * looseNumberOrNull(v) — same reading, but anything unreadable becomes
 * null instead of NaN. For "skip what we can't read" callers (bulk grids,
 * imports) where a 400 for one bad cell would throw away the good ones.
 */
export function looseNumberOrNull(v) {
  const n = parseLooseNumber(v);
  if (n === undefined) return undefined;
  return Number.isFinite(n) ? n : null;
}

/**
 * looseInteger(v) — counts and quantities: parse loosely, then round.
 * "1,250" → 1250, "12.6" → 13, "" → null, "abc" → NaN.
 */
export function looseInteger(v) {
  const n = parseLooseNumber(v);
  if (n === undefined || n === null || !Number.isFinite(n)) return n;
  return Math.round(n);
}

/**
 * isUnreadableNumber(raw) — true when somebody typed something that is not
 * a number ("abc"). Blank and missing are NOT unreadable; they are choices.
 * Handy for the "400 with a friendly message" branch.
 */
export function isUnreadableNumber(raw) {
  const n = parseLooseNumber(raw);
  return n !== undefined && n !== null && !Number.isFinite(n);
}

/**
 * cleanNumberInput(raw) — for text boxes on the client: what to send to the
 * server. A readable figure goes as its plain digits ("1,200,000" →
 * "1200000") so an older server still reads it; blank stays blank; anything
 * unreadable is passed through untouched so the server can refuse it with a
 * message rather than the box silently going empty.
 */
export function cleanNumberInput(raw) {
  if (raw === undefined || raw === null) return raw;
  if (typeof raw === 'number') return raw;
  const n = parseLooseNumber(raw);
  if (n === null) return '';
  if (!Number.isFinite(n)) return raw;
  return String(n);
}

export const NUMBER_HELP = 'Please enter the amount as a number, like 1,200,000.';

/**
 * wholeFigure(v) — the ONE reading of a figure a visitor typed on the public
 * budget form, shared by the readiness gate, the submit whitelist and the
 * quantity ladders so a number prices the same live, on save and on hand-off
 * (big error test 10-14: the three used to disagree on "$300", "0.5", "1e9").
 * Dressing is fine (Mike 9-18): "$300", "226,000 SF", " 2,500 " read as the
 * figure they mean; decimals round; anything unreadable, negative or over
 * nine digits is null. 0 is returned as 0 — callers decide whether 0 counts.
 */
export const WHOLE_FIGURE_MAX = 999_999_999;
export function wholeFigure(v) {
  if (v == null || v === '') return null;
  const n = looseInteger(typeof v === 'string' ? v : String(v));
  if (n == null || !Number.isFinite(n)) return null;
  if (n < 0 || n > WHOLE_FIGURE_MAX) return null;
  return n;
}
