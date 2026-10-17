/**
 * What did the human change about the AI's unit matrix?
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Step 17's queue is only as good as the verdicts in it, and a verdict costs a
 * click. The unit-matrix flow already has the click: somebody looks at the
 * extraction in the review modal, edits what is wrong, and presses "Apply to
 * Project". That press is a verdict, it just was not being recorded as one.
 *
 * So instead of asking Mike's team to review the same extraction twice, the
 * commit route diffs what they applied against what the model proposed and
 * writes the verdict itself: unchanged is `accepted`, edited is `corrected`, and
 * the diff becomes the correction text. Trust tiers then build from work that
 * was already happening.
 *
 * ── Why the diff runs on the server, against the stored proposal ─────────────
 * The obvious implementation is for the browser to send "I changed 3 rows". The
 * browser is also the one thing in this loop with an interest in the answer
 * an accuracy record that the reviewed party reports on itself is not a record.
 * The commit route reloads the model's ORIGINAL output from the review store and
 * diffs against that, so the summary describes what actually changed no matter
 * what the client claims.
 *
 * Pure: no IO, no store, no clock.
 *
 * @see src/lib/agent/reviewStore.js, where the original proposal is read back
 * @see scripts/tests/unitMatrixDiff.test.mjs
 */

/** The fields a reviewer can edit in the modal, in display order. */
const FIELDS = [
  ['qty',       'qty'],
  ['unitSf',    'unit SF'],
  ['bedrooms',  'bed'],
  ['bathrooms', 'bath'],
  ['balconies', 'balc'],
];

function key(row) { return String(row?.code ?? '').trim().toLowerCase(); }

/** null, undefined and '' are all "not set" and must not read as a change. */
function norm(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
}

function fmt(v) { return v == null ? '—' : (typeof v === 'number' ? v.toLocaleString() : String(v)); }

/**
 * Describe the difference between the model's rows and the ones a human applied.
 *
 * @param {Array} proposed  unitTypes as the model returned them
 * @param {Array} committed unitTypes as the human applied them
 * @returns {{changed: boolean, summary: string, counts: {added: number, removed: number, edited: number}}}
 */
export function describeUnitMatrixCorrection(proposed, committed) {
  const before = new Map();
  for (const r of Array.isArray(proposed) ? proposed : []) {
    const k = key(r);
    if (k) before.set(k, r);
  }

  const after = new Map();
  for (const r of Array.isArray(committed) ? committed : []) {
    const k = key(r);
    if (k) after.set(k, r);
  }

  const added   = [...after.keys()].filter(k => !before.has(k));
  const removed = [...before.keys()].filter(k => !after.has(k));

  const edits = [];
  for (const [k, b] of before) {
    const a = after.get(k);
    if (!a) continue;
    const changes = [];
    for (const [field, label] of FIELDS) {
      const wasV = norm(b[field]);
      const nowV = norm(a[field]);
      if (wasV !== nowV) changes.push(`${label} ${fmt(wasV)}→${fmt(nowV)}`);
    }
    if (changes.length) edits.push(`${b.code}: ${changes.join(', ')}`);
  }

  // Rows the reviewer typed in by hand carry no code, so they never land in the
  // keyed maps above. Count them explicitly rather than letting them vanish
  // an added type is exactly the correction worth learning from.
  const uncodedAdds = (Array.isArray(committed) ? committed : []).filter(r => !key(r)).length;

  const counts = {
    added:   added.length + uncodedAdds,
    removed: removed.length,
    edited:  edits.length,
  };
  const changed = counts.added > 0 || counts.removed > 0 || counts.edited > 0;

  if (!changed) {
    return { changed: false, summary: 'Applied unchanged.', counts };
  }

  const parts = [];
  if (edits.length) parts.push(`Edited: ${edits.slice(0, 8).join('; ')}${edits.length > 8 ? `; +${edits.length - 8} more` : ''}`);
  if (added.length) parts.push(`Added: ${added.slice(0, 6).join(', ')}${added.length > 6 ? `, +${added.length - 6} more` : ''}`);
  if (uncodedAdds)  parts.push(`Added: ${uncodedAdds} row(s) with no type code`);
  if (removed.length) parts.push(`Removed: ${removed.slice(0, 6).join(', ')}${removed.length > 6 ? `, +${removed.length - 6} more` : ''}`);

  return { changed: true, summary: parts.join('. ') + '.', counts };
}
