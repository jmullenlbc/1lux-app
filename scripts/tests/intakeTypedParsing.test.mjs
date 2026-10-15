// Big error test 10-14 (both public paths). Two faults it found, pinned here:
//
//  A. A correction typed over the Project Data grid (correct<RowKey>) priced
//     the live sidebar but validateAnswers dropped it, so the saved
//     submission, the pre-con email and the hand-off ran on the uncorrected
//     drawing read.
//  B. Three parsers read a typed figure three ways: the readiness gate
//     rounded "0.5" to 1, the quantity ladders priced it as 0.5, and the
//     submit whitelist dropped "$300" and "226,000 SF" outright (Mike 9-18:
//     commas and dressing are fine in any number field).
//
// Now there is one reading, wholeFigure() in numberInput.js, and the
// corrections ride through validateAnswers under their own whitelist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wholeFigure, WHOLE_FIGURE_MAX } from '../../src/lib/numberInput.js';
import { validateAnswers, noDrawingsReady, CORRECTABLE_ROW_KEYS, correctionKeyFor as keyFromQuestionnaire } from '../../src/lib/intake/questionnaire.js';
import { computeQuantities, correctionKeyFor } from '../../src/lib/intake/quantities.js';
import { computeIntakeEstimate } from '../../src/lib/intake/estimate.js';
import { SITE_FEATURE_ROW_KEYS, LEGACY_COURTYARD_FT_KEY } from '../../src/lib/siteFeatureWords.js';

const answerOf = (rows, key) => rows.find(r => r.questionKey === key)?.answer;

test('wholeFigure: dressing is fine, decimals round, junk / negatives / ten digits are null', () => {
  assert.equal(wholeFigure('300'), 300);
  assert.equal(wholeFigure('$300'), 300);
  assert.equal(wholeFigure('226,000 SF'), 226000);
  assert.equal(wholeFigure(' 2,500 '), 2500);
  assert.equal(wholeFigure('300 units'), 300);
  assert.equal(wholeFigure('0.5'), 1);
  assert.equal(wholeFigure('12.7'), 13);
  assert.equal(wholeFigure('0'), 0);
  assert.equal(wholeFigure(''), null);
  assert.equal(wholeFigure(null), null);
  assert.equal(wholeFigure('abc'), null);
  assert.equal(wholeFigure('-5'), null);
  assert.equal(wholeFigure('(5)'), null);
  assert.equal(wholeFigure('1,000,000,000'), null);
  assert.equal(wholeFigure(String(WHOLE_FIGURE_MAX)), WHOLE_FIGURE_MAX);
  assert.equal(wholeFigure(1250), 1250);
});

test('gate, submit whitelist and quantity ladders read the same typed figure', () => {
  const base = { noDrawings: 'yes', projectType: 'Garden (3 Levels)', figureGrossSf: '250,000', figureStories: '3', figureSurfaceParking: '300', hasPool: 'no' };
  for (const [typed, want] of [['300', 300], ['$300', 300], ['300 units', 300], [' 2,500 ', 2500], ['0.5', 1], ['12.7', 13]]) {
    const ans = { ...base, figureTotalUnits: typed };
    assert.equal(noDrawingsReady(ans).ready, true, `gate ${typed}`);
    assert.equal(answerOf(validateAnswers(ans), 'figureTotalUnits'), String(want), `submit ${typed}`);
    const q = computeQuantities(null, ans).find(r => r.key === 'totalUnits');
    assert.equal(q.value, want, `quantities ${typed}`);
  }
  for (const typed of ['abc', '-5', '(5)', '1,000,000,000']) {
    const ans = { ...base, figureTotalUnits: typed };
    assert.equal(noDrawingsReady(ans).ready, false, `gate refuses ${typed}`);
    assert.equal(answerOf(validateAnswers(ans), 'figureTotalUnits'), undefined, `submit drops ${typed}`);
  }
  // A typed 0 stays 0 where 0 is a real answer, and is dropped where it is not.
  const zero = { ...base, figureTotalUnits: '200', figureSurfaceParking: '0', figureStories: '0' };
  assert.equal(answerOf(validateAnswers(zero), 'figureSurfaceParking'), '0');
  assert.equal(answerOf(validateAnswers(zero), 'figureStories'), undefined);
  assert.equal(noDrawingsReady(zero).ready, false);
});

const DRAWINGS = {
  sources: ['a.pdf'],
  unitTypes: [{ code: 'A1', qty: 200, unitSf: 800, bedrooms: 1, bathrooms: 1, balconies: 1 }],
  projectTotals: { grossInteriorSf: 260000, statedTotalUnits: 200, corridorSf: 18000 },
  siteData: { stories: 4, surfaceParking: 120, egressStairwells: 2, exitDoors: 6 },
};

test('corrections typed over the drawings grid survive submit and price the same', () => {
  const ans = { projectType: 'Garden (3 Levels)', figureExteriorAmenitySf: '9000', correctTotalUnits: '120', correctSurfaceParking: '0', correctGrossSf: '$200,000' };
  const rows = validateAnswers(ans);
  assert.equal(answerOf(rows, 'correctTotalUnits'), '120');
  assert.equal(answerOf(rows, 'correctSurfaceParking'), '0');
  assert.equal(answerOf(rows, 'correctGrossSf'), '200000');
  assert.ok(rows.filter(r => r.questionKey.startsWith('correct')).every(r => r.section === 'Corrections'));
  const live = computeIntakeEstimate({ answers: ans, drawings: DRAWINGS });
  const saved = computeIntakeEstimate({ answers: rows, drawings: DRAWINGS });
  assert.equal(saved.projectData.numUnits, 120);
  assert.equal(saved.projectData.numSurfaceParking, 0);
  assert.equal(saved.projectData.grossSf, 200000);
  assert.equal(saved.budget.totalWithControls, live.budget.totalWithControls);
  // junk, negatives and unknown row keys never become rows
  const junk = validateAnswers({ projectType: 'Garden (3 Levels)', correctTotalUnits: 'abc', correctBedrooms: '-3', correctNotARow: '5', correctTotalUnitsX: '5' });
  assert.equal(junk.some(r => r.questionKey.startsWith('correct')), false);
});

test('every row key quantities.js can emit is on the corrections whitelist', () => {
  const src = readFileSync(new URL('../../src/lib/intake/quantities.js', import.meta.url), 'utf8');
  const literal = new Set();
  for (const m of src.matchAll(/\b(?:add|areaRow|coveredRow)\('([A-Za-z]+)'/g)) literal.add(m[1]);
  assert.ok(literal.size >= 20, `found ${literal.size} literal row keys`);
  const missing = [...literal, ...Object.values(SITE_FEATURE_ROW_KEYS), LEGACY_COURTYARD_FT_KEY].filter(k => !CORRECTABLE_ROW_KEYS.includes(k));
  assert.deepEqual(missing, []);
  assert.equal(keyFromQuestionnaire, correctionKeyFor);
  assert.equal(correctionKeyFor('exteriorAmenitySf'), 'correctExteriorAmenitySf');
});
