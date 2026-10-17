/**
 * History for a web budget (Mike 10-16: "I do want to have some kind of
 * history for duplicated budgets though so they can see what has changed").
 *
 * Every save that moves a value writes one ConceptualDraftSave row (who, when,
 * which step) with one ConceptualDraftChange row per value that moved. This
 * file is the PURE part: given what is stored and what just arrived, which
 * change rows to write, and plain-English names for them. No IO.
 *
 * @see src/app/api/intake/draft/route.js             writes the rows
 * @see src/app/api/intake/portal/history/route.js    reads them
 * @see prisma/migrations/0132_gc_portal               the tables
 */
import { INTAKE_QUESTIONS } from './questionnaire.js';

/** Row columns a change is recorded for, with the words the portal shows. */
export const TRACKED_ROW_KEYS = Object.freeze({
  projectName:  'Project name',
  budgetName:   'Budget description',
  city:         'City',
  state:        'State',
  zip:          'Zip',
  company:      'Company',
  haveDrawings: 'Have drawings',
  hasClubhouse: 'Clubhouse',
  buildingType: 'Building type',
  unitCount:    'Units',
  grossSf:      'Gross SF',
});

const QUESTION_LABEL = new Map(INTAKE_QUESTIONS.map(q => [q.key, q.label || q.question]));

/** "walkwayLengthFt" -> "Walkway length ft", "figureGrossSf" -> "Gross SF". */
function wordsFor(key) {
  const k = String(key || '').replace(/^figure/, '').replace(/^correct/, '');
  const words = k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').toLowerCase();
  return words.replace(/\bsf\b/g, 'SF').replace(/\bboh\b/g, 'BOH').replace(/^./, c => c.toUpperCase());
}

/** The words the portal shows for one change row. */
export function labelFor(kind, key) {
  if (kind === 'row') return TRACKED_ROW_KEYS[key] || wordsFor(key);
  if (kind === 'answer') return QUESTION_LABEL.get(key) || wordsFor(key);
  if (kind === 'figure') return `${wordsFor(key)} (typed)`;
  if (kind === 'correction') return `${wordsFor(key)} (corrected)`;
  if (kind === 'drawings') return 'Drawings';
  return wordsFor(key);
}

const text = v => (v == null ? '' : String(v));

/** Row column changes between the stored row and the incoming columns. */
export function rowChanges(before, after) {
  const out = [];
  for (const key of Object.keys(TRACKED_ROW_KEYS)) {
    if (!(key in (after || {}))) continue;
    const a = text(before?.[key]);
    const b = text(after[key]);
    if (a !== b) out.push({ kind: 'row', key, before: a, after: b });
  }
  return out;
}

/** Field changes: each write whose value differs from the stored one. */
export function fieldChanges(existing, writes) {
  const stored = new Map();
  for (const f of Array.isArray(existing) ? existing : []) stored.set(`${f.kind}:${f.key}`, text(f.value));
  const out = [];
  for (const w of Array.isArray(writes) ? writes : []) {
    const a = stored.get(`${w.kind}:${w.key}`) ?? '';
    const b = text(w.value);
    if (a !== b) out.push({ kind: w.kind, key: w.key, before: a, after: b });
  }
  return out;
}

/** A few words that say what a drawings read holds, for the history line. */
export function summarizeDrawings(json) {
  if (!json) return 'none';
  try {
    const d = JSON.parse(json);
    const files = Array.isArray(d?.files) ? d.files.length : (Array.isArray(d?.sources) ? d.sources.length : 0);
    const sf = d?.siteData?.grossSf ?? d?.grossSf;
    const bits = [];
    if (files) bits.push(`${files} file${files === 1 ? '' : 's'}`);
    if (Number.isFinite(Number(sf)) && Number(sf) > 0) bits.push(`${Math.round(Number(sf)).toLocaleString('en-US')} SF read`);
    return bits.length ? `read (${bits.join(', ')})` : 'read';
  } catch { return 'read'; }
}

/** One 'drawings' change when the stored read and the incoming one differ. */
export function drawingsChange(beforeJson, afterJson) {
  const a = text(beforeJson), b = text(afterJson);
  if (a === b) return [];
  return [{ kind: 'drawings', key: 'drawings', before: summarizeDrawings(a), after: summarizeDrawings(b) }];
}

/** Everything that moved in one save, ready to write. */
export function saveChanges({ existingRow, existingFields, row, writes, drawingsJson }) {
  return [
    ...rowChanges(existingRow, row),
    ...fieldChanges(existingFields, writes),
    ...drawingsChange(existingRow?.drawingsJson, drawingsJson),
  ];
}

/** Change rows that describe a brand new budget: every value set, from blank. */
export function createdChanges({ row, fields, drawingsJson }) {
  return [
    ...rowChanges({}, row),
    ...fieldChanges([], fields),
    ...drawingsChange(null, drawingsJson),
  ];
}
