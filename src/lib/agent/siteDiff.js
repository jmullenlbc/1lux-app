/**
 * What did the human change about the AI's site reading?
 *
 * The unit-matrix twin of this file explains the principle; this one applies it
 * to a shape where "unchanged" is subtler. A unit matrix is a list, so a verdict
 * is about rows. A site reading is a handful of independent numbers, each with
 * its own tick box, so there are three distinct ways to disagree with it and
 * only one of them looks like an edit:
 *
 *   edited, the reviewer kept the field and changed the number.
 *   dropped, the reviewer ticked the field OFF. The model read something the
 *             reviewer would not stand behind. That is a rejection of that
 *             field, and it is the one this file exists to stop losing: a
 *             dropped field leaves no trace in the written record, so without
 *             this diff an extraction the reviewer threw half of away would be
 *             recorded as "accepted".
 *   added, the reviewer typed in a number the model never offered. Not a
 *             correction of the model, but evidence the extraction was thin.
 *
 * ── Diffed on the server, against the stored proposal ────────────────────────
 * The browser is the one participant with an interest in the answer, so what it
 * claims to have changed is not evidence. The commit route reloads the model's
 * ORIGINAL output from the review store and re-derives the proposal from it, so
 * the summary describes what actually changed regardless of what was sent.
 *
 * Pure: no IO, no store, no clock.
 *
 * @see src/lib/agent/unitMatrixDiff.js, the same idea for a list-shaped output
 * @see scripts/tests/siteDiff.test.mjs
 */
import { proposeSiteFields, SITE_FIELD_DEFS, buildingTypeKeyLabel } from '../siteFields.js';
import { BREEZEWAY_STYLES } from '../stairLandings.js';

const LABELS = Object.fromEntries(SITE_FIELD_DEFS.map(d => [d.key, d.label]));

/**
 * null, undefined and '' are all "not set" and must not read as a change.
 * Numbers compare as numbers; the building type (the one non-numeric field)
 * compares as the key string it is.
 */
function norm(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  return typeof v === 'string' ? v.trim() || null : null;
}

function fmt(v) {
  if (v == null) return '—';
  return typeof v === 'number' ? v.toLocaleString() : (BREEZEWAY_STYLES[v]?.label || buildingTypeKeyLabel(v));
}

/**
 * Describe the difference between what the model read off the drawing and what
 * a human applied to the project.
 *
 * @param {object} visionOutput  the model's output exactly as stored on the run
 * @param {object} committed     { projectDataKey: value } the reviewer applied
 * @returns {{changed: boolean, summary: string,
 *            counts: {edited: number, dropped: number, added: number, accepted: number}}}
 */
export function describeSiteCorrection(visionOutput, committed) {
  const proposed = new Map(
    proposeSiteFields(visionOutput || {}).map(r => [r.key, norm(r.value)])
  );

  const applied = new Map();
  for (const [k, v] of Object.entries(committed || {})) {
    // Only fields this extractor is allowed to propose count toward its record.
    // Anything else in the payload is someone else's write and says nothing
    // about how well the drawing was read.
    if (k in LABELS) applied.set(k, norm(v));
  }

  const edited = [], dropped = [], added = [];
  let accepted = 0;

  for (const [k, was] of proposed) {
    if (!applied.has(k)) { dropped.push(`${LABELS[k]} (${fmt(was)})`); continue; }
    const now = applied.get(k);
    if (now !== was) edited.push(`${LABELS[k]} ${fmt(was)}→${fmt(now)}`);
    else accepted++;
  }

  for (const [k, now] of applied) {
    if (!proposed.has(k)) added.push(`${LABELS[k]} = ${fmt(now)}`);
  }

  const counts = { edited: edited.length, dropped: dropped.length, added: added.length, accepted };
  const changed = counts.edited > 0 || counts.dropped > 0 || counts.added > 0;

  if (!changed) {
    return {
      changed: false,
      summary: accepted
        ? `Applied unchanged: ${accepted} field(s) accepted as read.`
        : 'Applied unchanged.',
      counts,
    };
  }

  const parts = [];
  if (edited.length)  parts.push(`Edited: ${edited.join('; ')}`);
  if (dropped.length) parts.push(`Rejected: ${dropped.join('; ')}`);
  if (added.length)   parts.push(`Added by hand: ${added.join('; ')}`);
  if (accepted)       parts.push(`${accepted} field(s) accepted as read`);

  return { changed: true, summary: parts.join('. ') + '.', counts };
}
