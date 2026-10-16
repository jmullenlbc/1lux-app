/**
 * The public conceptual-budget page must not publish ILC's formulas.
 *
 * Mike, 2026-09-16: "We don't want to give away to the world all the math we
 * are doing… Someone could steal all the math."
 *
 * /api/intake/estimate and /api/intake/pdf answer a stranger's browser. They
 * send publicIntakeEstimate(): labels, the visitor's own quantities and the
 * dollars. This test walks that object looking for anything shaped like a
 * rate, a count-times-price, a multiplier or a written rule.
 *
 * Run: node --test scripts/tests/intakePublicMath.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeIntakeEstimate, publicIntakeEstimate, publicQuantity, approxWords, MATH_RE,
} from '../../src/lib/intake/estimate.js';

const GARDEN = 'Garden (3 Levels)';
const PODIUM = 'Podium (3-8 Levels)';

const ANSWERS = {
  noDrawings: 'yes',
  projectType: GARDEN,
  figureTotalUnits: '200',
  figureGrossSf: '250000',
  figureStories: '3',
  figureSurfaceParking: '300',
  figureExteriorAmenitySf: '5000', hasPool: 'no',
};

/** Keys that only ever carry working-out. None may appear anywhere public. */
const FORBIDDEN_KEYS = new Set([
  'qty', 'rate', 'each', 'laborEach', 'count_each', 'fixtures', 'fixtureKind',
  'how', 'multiplier', 'solarMultiplier', 'countLabel', 'ftPer', 'perFt',
  'controlsRateUsed', 'controlsBasis', 'controlsBasisSf', 'formulaTotal',
  'garageBatteries', 'fanCount', 'qtyOverridden', 'strategy', 'note',
]);

function walk(node, path, hits) {
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    const here = `${path}.${k}`;
    if (FORBIDDEN_KEYS.has(k)) hits.push(here);
    walk(v, here, hits);
  }
}

test('the public budget carries no rate, count × price, multiplier or rule', () => {
  const pub = publicIntakeEstimate({ answers: ANSWERS, drawings: null });
  assert.ok(pub.budget, 'a typed-in budget should price');
  const hits = [];
  walk(pub.budget, 'budget', hits);
  assert.deepEqual(hits, [], `formula-shaped keys reached the public budget: ${hits.join(', ')}`);
});

test('question cost cards keep dollars and a rounded count in words, and drop the price each', () => {
  const full = computeIntakeEstimate({ answers: ANSWERS, drawings: null });
  const pub  = publicIntakeEstimate({ answers: ANSWERS, drawings: null });
  const keys = Object.keys(full.budget.questionCosts || {});
  assert.ok(keys.length > 0, 'the engine should price at least one question');
  for (const k of keys) {
    const f = full.budget.questionCosts[k];
    const p = pub.budget.questionCosts[k];
    assert.equal(p.product, f.product, `${k} product`);
    assert.equal(p.lines.length, f.lines.length, `${k} lines`);
    for (const [i, line] of p.lines.entries()) {
      assert.deepEqual(Object.keys(line).sort(), ['approx', 'label', 'labor', 'product']);
      const fl = f.lines[i];
      if (fl.count > 0 && fl.countLabel) {
        assert.match(line.approx, /^approx\. [\d,]+ [a-z -]+$/, `${k} approx: ${line.approx}`);
        assert.ok(!/[$×=%]/.test(line.approx));
      } else {
        assert.equal(line.approx, null);
      }
    }
  }
});

test('approxWords rounds and never carries a price or a rule', () => {
  assert.equal(approxWords(47, 'area lights'), 'approx. 45 area lights');
  assert.equal(approxWords(48, 'area lights'), 'approx. 50 area lights');
  assert.equal(approxWords(7, 'poles'), 'approx. 7 poles');
  assert.equal(approxWords(1234, 'units'), 'approx. 1,235 units');
  assert.equal(approxWords(0, 'lights'), null);
  assert.equal(approxWords(12, null), null);
  // The summary rows that carry a count on the public page.
  const pub = publicIntakeEstimate({ answers: ANSWERS, drawings: null });
  const parking = pub.budget.sections.exterior.parking;
  assert.deepEqual(Object.keys(parking).sort(), ['approx', 'product']);
  assert.match(parking.approx, /^approx\. [\d,]+ area lights$/);
  const wp = pub.budget.sections.exterior.wallpacks;
  assert.deepEqual(Object.keys(wp).sort(), ['approx', 'product']);
  // The card and the breakdown both print the phrase; the PDF prints section totals only.
  const card = readFileSync(new URL('../../src/components/sections/QuestionCard.jsx', import.meta.url), 'utf8');
  assert.ok(card.includes('l.approx'));
  const shared = readFileSync(new URL('../../src/app/(app)/project/[id]/summary/SummaryBudgetBreakdown.jsx', import.meta.url), 'utf8');
  assert.ok(shared.includes('approxSuffix(sections?.exterior?.parking)'));
  assert.ok(shared.includes('approxSuffix(sections?.exterior?.wallpacks)'));
  assert.ok(shared.includes('siteFeatureLineLabel(i) + approxSuffix(i)'));
});

test('every dollar figure the public page prints matches the full estimate', () => {
  const full = computeIntakeEstimate({ answers: ANSWERS, drawings: null });
  const pub  = publicIntakeEstimate({ answers: ANSWERS, drawings: null });
  for (const k of ['totalWithControls', 'subtotalLightingOnly', 'controlsTotal', 'lightingProductSubtotal',
                   'freight', 'warehousing', 'controls', 'perSf', 'perUnit']) {
    assert.equal(pub.budget[k], full.budget[k], k);
  }
  const fs = full.budget.sections, ps = pub.budget.sections;
  assert.equal(ps.units.total.product, fs.units.total.product);
  assert.equal(ps.units.fans.product, fs.units.fans.product);
  assert.equal(ps.corridors.total.product, fs.corridors.total.product);
  assert.equal(ps.exterior.total.product, fs.exterior.total.product);
  assert.equal(ps.exterior.parking.product, fs.exterior.parking.product);
  assert.equal(ps.emergency.product, fs.emergency.product);
  assert.equal(ps.exitSigns.product, fs.exitSigns.product);
  assert.deepEqual(pub.projectData, full.projectData);
  assert.deepEqual(pub.range, full.range);
});

test('site features show the finding and its dollars, not the fixture rule', () => {
  const answers = { ...ANSWERS, figureDogParks: '1', figurePickleballCourts: '2', figureCourtyardFt: '90' };
  const full = computeIntakeEstimate({ answers, drawings: null });
  const pub  = publicIntakeEstimate({ answers, drawings: null });
  const fItems = full.budget.sections.exterior.siteFeatures?.items || [];
  const pItems = pub.budget.sections.exterior.siteFeatures?.items || [];
  assert.equal(pItems.length, fItems.length);
  for (const i of pItems) {
    assert.deepEqual(Object.keys(i).sort(), ['approx', 'count', 'label', 'lengthFt', 'product', 'type']);
    if (i.approx) assert.match(i.approx, /^approx\. [\d,]+ (area lights|poles)$/);
  }
});

test('no takeoff row explains how its number was worked out', () => {
  for (const answers of [ANSWERS, { ...ANSWERS, projectType: PODIUM, figureStories: '6' }]) {
    const pub = publicIntakeEstimate({ answers, drawings: null });
    assert.ok(pub.quantities.length > 5);
    for (const r of pub.quantities) {
      assert.ok(!r.how  || !MATH_RE.test(r.how),  `${r.key} how still shows working: "${r.how}"`);
      assert.ok(!r.flag || !MATH_RE.test(r.flag), `${r.key} flag still shows working: "${r.flag}"`);
    }
    // …and the numbers themselves are untouched.
    const full = computeIntakeEstimate({ answers, drawings: null });
    assert.deepEqual(pub.quantities.map(r => [r.key, r.value, r.source]),
                     full.quantities.map(r => [r.key, r.value, r.source]));
  }
});

test('publicQuantity: the rules it rewrites and the ones it leaves alone', () => {
  const base = { key: 'k', label: 'L', unit: 'ea', value: 10, flag: null };
  assert.equal(publicQuantity({ ...base, source: 'drawing', how: 'Stated on the drawing.' }).how, 'Stated on the drawing.');
  assert.match(publicQuantity({ ...base, source: 'derived', how: '200 units × 1.4 per unit, typical.' }).how, /^Our estimate/);
  assert.equal(publicQuantity({ ...base, source: 'drawing', how: 'Printed canopy areas ÷ 189 SF a stall.' }).how,
    'Worked out from figures printed on the drawings.');
  const fixed = publicQuantity({ ...base, source: 'questionnaire', corrected: true, wasValue: 8,
    how: 'Corrected by you to 10. We read 8, 5% of gross.' });
  assert.equal(fixed.how, 'Corrected by you.');
  assert.equal(fixed.wasValue, 8);
  assert.equal(publicQuantity({ ...base, source: 'drawing', how: 'x', flag: 'Capped at 5% of gross.' }).flag,
    'Please confirm this figure.');
});

test('both public routes send the public projection, never the full estimate', () => {
  for (const f of ['src/app/api/intake/estimate/route.js', 'src/app/api/intake/pdf/route.js']) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.ok(src.includes('publicIntakeEstimate('), `${f} must call publicIntakeEstimate`);
    assert.ok(!/\bcomputeIntakeEstimate\b/.test(src), `${f} must not touch computeIntakeEstimate`);
  }
});

// Mike, 2026-09-17: "Pull the 6% and 3% from visibility. Keep the freight and
// warehousing number." Dollars yes, the rate behind them never.
test('freight and warehousing: the dollars are public, the percentages are not', () => {
  const pub = publicIntakeEstimate({ answers: ANSWERS, drawings: null });
  assert.ok(pub.budget.freight > 0 && pub.budget.warehousing > 0);
  assert.ok(!('freightRate' in pub.budget) && !('warehousingRate' in pub.budget));
  for (const f of ['src/app/conceptual_budget/IntakeClient.jsx', 'src/lib/intake/pdfHtml.js']) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.ok(!/freightPct|warehousingPct|freightRate|warehousingRate/.test(src), `${f} still knows a freight or warehousing rate`);
  }
  // The shared breakdown prints a bare label when no percentage is handed in.
  const shared = readFileSync(new URL('../../src/app/(app)/project/[id]/summary/SummaryBudgetBreakdown.jsx', import.meta.url), 'utf8');
  assert.ok(shared.includes("freightPct     == null ? 'Freight'"));
  assert.ok(shared.includes("warehousingPct == null ? 'Warehousing'"));
});

test('the public page takes three drawing files at most, and says so', () => {
  const src = readFileSync(new URL('../../src/components/intake/DrawingDropzone.jsx', import.meta.url), 'utf8');
  assert.match(src, /const MAX_FILES = 3;/);
  assert.ok(src.includes('{MAX_FILES} files maximum'));
});

test('controls is the one line that shows its $/SF math, on purpose (Mike 2026-09-24)', () => {
  const full = computeIntakeEstimate({ answers: ANSWERS, drawings: null });
  const pub  = publicIntakeEstimate({ answers: ANSWERS, drawings: null });
  assert.deepEqual(Object.keys(pub.budget.controlsMath).filter(k => k !== 'garage').sort(), ['cap', 'capped', 'perSf', 'sf']);
  assert.equal(pub.budget.controlsMath.sf, full.budget.controlsBasisSf);
  assert.equal(pub.budget.controlsMath.perSf, full.budget.controlsRateUsed);
});
