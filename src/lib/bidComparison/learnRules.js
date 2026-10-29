/**
 * Bid Comparison learning, the pure part (0139, Mike 10-22). Staff mark a
 * comparison line Right, Wrong kind (and which kind) or Wrong grade (Builder
 * or Spec). Once MIN_MARKS marks agree, the tool proposes one rule change for
 * a person to approve: a word a kind reads from, or a brand's grade. Same
 * pattern as the Sales bot's Not relevant button. No database here; the
 * route and learn.js feed this the rows.
 */
import { normText } from './kinds.js';
import { normMfr } from '../specSwap/family.js';

export const MIN_MARKS = 3;
export const MARKS = new Set(['RIGHT', 'WRONG_KIND', 'WRONG_GRADE']);
export const GRADES = new Set(['BUILDER', 'SPEC']);

// Words too common on a bid line to read a kind from.
const COMMON = new Set([
  'WITH', 'AND', 'THE', 'FOR', 'FROM', 'INTO', 'OVER', 'UNDER', 'PER', 'EACH', 'ONLY', 'SAME', 'PLUS', 'TYPE', 'SIZE',
  'LED', 'LIGHT', 'LIGHTS', 'LIGHTING', 'FIXTURE', 'FIXTURES', 'LUMEN', 'LUMENS', 'WATT', 'WATTS', 'VOLT', 'VOLTS', 'INCH',
  'WHITE', 'BLACK', 'BRONZE', 'NICKEL', 'BRUSHED', 'SATIN', 'MATTE', 'FLAT', 'FINISH', 'COLOR', 'STYLE',
  'MOUNT', 'MOUNTED', 'MOUNTING', 'DIMMABLE', 'DIMMING', 'TRIM', 'HOUSING', 'KIT', 'PACK', 'UNIT', 'UNITS',
  'SEE', 'PLAN', 'PLANS', 'SPEC', 'SPECS', 'PROVIDE', 'INSTALL', 'INSTALLED', 'STANDARD', 'ROUND', 'SQUARE',
]);

/** Words a kind could be read from: 4+ letters in the description, not common, not a number. */
export function wordCandidates(description) {
  const out = new Set();
  for (const w of normText(description).split(/[^A-Z0-9]+/)) {
    if (w.length < 4 || !/[A-Z]/.test(w) || /^\d/.test(w) || COMMON.has(w)) continue;
    out.add(w);
  }
  return [...out];
}

const push = (m, k, v) => {
  if (!m.has(k)) m.set(k, []);
  m.get(k).push(v);
};

/**
 * The proposals a set of marks adds up to. `rules` is rulesFromRows's result
 * (kinds with their match phrases, brands map). A Right mark that cuts the
 * other way counts against; a change needs more marks for it than against.
 * Returns [{ key, kind, kindKey, phrase, brand, grade, marks, against, sample }].
 */
export function proposeFromMarks(marks, rules, { minMarks = MIN_MARKS } = {}) {
  const kinds = new Map((rules.kinds || []).map((k) => [k.key, k]));
  const rights = marks.filter((m) => m.mark === 'RIGHT');
  const out = [];

  // Wrong kind: a word shared by minMarks+ marks that name the same kind.
  const byKind = new Map();
  for (const m of marks) if (m.mark === 'WRONG_KIND' && kinds.has(m.kindShould)) push(byKind, m.kindShould, m);
  for (const [kindKey, ms] of byKind) {
    const have = new Set((kinds.get(kindKey).match || []).map((p) => normText(p)));
    const byWord = new Map();
    for (const m of ms) for (const w of wordCandidates(m.description)) if (!have.has(w) && !have.has(`${w}*`)) push(byWord, w, m);
    for (const [phrase, hits] of byWord) {
      if (hits.length < minMarks) continue;
      const against = rights.filter((r) => r.kindRead !== kindKey && wordCandidates(r.description).includes(phrase)).length;
      if (against >= hits.length) continue;
      out.push({ key: `KIND_WORD|${kindKey}|${phrase}`, kind: 'KIND_WORD', kindKey, phrase, brand: null, grade: null, marks: hits.length, against, sample: hits[0].description });
    }
  }

  // Wrong grade: minMarks+ marks on one brand that name the same grade. A grade
  // the words set is not the brand's doing, so those marks do not count here.
  const byBrand = new Map();
  for (const m of marks) {
    if (m.mark !== 'WRONG_GRADE' || !GRADES.has(m.gradeShould) || m.gradeBy === 'words') continue;
    const brand = normMfr(m.mfr);
    if (brand) push(byBrand, `${brand}|${m.gradeShould}`, m);
  }
  for (const [k, ms] of byBrand) {
    if (ms.length < minMarks) continue;
    const [brand, grade] = k.split('|');
    if (rules.brands?.get(brand) === grade) continue;
    const against = rights.filter((r) => normMfr(r.mfr) === brand && r.gradeRead && r.gradeRead !== grade).length;
    if (against >= ms.length) continue;
    out.push({ key: `BRAND_GRADE|${brand}|${grade}`, kind: 'BRAND_GRADE', kindKey: null, phrase: null, brand, grade, marks: ms.length, against, sample: ms[0].description });
  }
  return out;
}
