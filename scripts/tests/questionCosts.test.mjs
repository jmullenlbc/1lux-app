/**
 * Per-answer cost + estimated labor (Mike, 2026-09-13: "show correlated unit
 * cost, total cost and labor total cost … both internally and externally").
 * calculateBudget returns budget.questionCosts keyed "section.field"; every
 * questionnaire screen prints the chosen answer's entry under that answer.
 *
 *   1. Labor is an estimate beside the product — it never moves any total.
 *   2. Labor uses the RAW rates on the master sheet (no OH&P).
 *   3. $/SF answers carry no labor ("Leave labor off of those").
 *   4. A frogeye installs like a wall sconce, one per 300 SF of corridor.
 *   5. Every priced public-form question has an entry, and the public form
 *      never prices anything itself.
 *
 * Run: node --test scripts/tests/questionCosts.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';
import { INTAKE_QUESTIONS } from '../../src/lib/intake/questionnaire.js';

const PD = {
  numUnits: 100, grossSf: 100000, garageSf: 50000, corridorSf: 9000,
  interiorAmenitySf: 3000, exteriorAmenitySf: 5000, parkingStalls: 90,
  numBuildings: 1, buildingTypeKey: 'podium',
};
const RESP = {
  units:     { undercabinet: 'lineVoltage', fans: 'masterOnly', vanity: 'bathBarLow', balcony: 'disk5inch' },
  corridors: { unitSconce: 'basic', exitSignType: 'thermoplastic', stairwellDesign: 'code' },
  amenities: { interiorLevel: 'medium' },
  exterior:  { amenityLevel: 'medium', siteDesignLevel: 'base' },
  emergency: { strategy: 'frogeyes' },
};
const b = calculateBudget(PD, RESP);
const qc = b.questionCosts;
const close = (a, e, msg) => assert.ok(Math.abs(a - e) < 0.01, `${msg}: got ${a}, expected ${e}`);

test('questionCosts is on the budget', () => {
  assert.equal(typeof qc, 'object');
  assert.ok(Object.keys(qc).length > 10);
});

test('labor never changes the budget total', () => {
  // Zero every dollar rate; keep the two quantity knobs (feet, SF per frogeye).
  const QTY = ['undercabinetFtPerUnit', 'frogeyeSfEach'];
  const zeroLabor = Object.fromEntries(Object.entries(PRICING.labor).map(([k, v]) => [k, QTY.includes(k) ? v : 0]));
  const noLabor = calculateBudget(PD, RESP, { ...PRICING, labor: zeroLabor });
  assert.equal(noLabor.totalWithContingency, b.totalWithContingency);
  for (const e of Object.values(noLabor.questionCosts)) assert.equal(e.labor, 0);
});

test('an entry adds up: product and labor are the sums of its lines', () => {
  for (const [key, e] of Object.entries(qc)) {
    close(e.product, e.lines.reduce((s, l) => s + l.product, 0), `${key} product`);
    close(e.labor,   e.lines.reduce((s, l) => s + l.labor, 0),   `${key} labor`);
    for (const l of e.lines) if (l.count != null) close(l.product, l.count * l.each, `${key} ${l.label}`);
  }
});

test('fans: fan count × $225 raw labor', () => {
  assert.ok(b.fanCount > 0, 'fixture should buy fans');
  close(qc['units.fans'].labor, b.fanCount * PRICING.labor.ceilingFan, 'fan labor');
  assert.deepEqual(qc['units.fanLevel'], qc['units.fans'], 'both fan questions show the same line');
});

test('120V undercabinet: 8 ft per kitchen = four 24" pieces × $57.63', () => {
  close(qc['units.undercabinet'].labor, PD.numUnits * 4 * PRICING.labor.undercabinet24in, 'undercabinet labor');
});

test('frogeyes: one per 300 SF of corridor + amenity, each at sconce labor', () => {
  const count = Math.ceil((PD.corridorSf + PD.interiorAmenitySf) / 300);
  const fe = qc['emergency.strategy'].lines.find(l => l.label === 'Frogeyes');
  assert.equal(fe.count, count);
  close(fe.labor, count * PRICING.labor.sconce, 'frogeye labor');
});

test('$/SF answers show cost only — no labor', () => {
  for (const key of ['amenities.interiorLevel', 'exterior.amenityLevel', 'exterior.amenityHours']) {
    assert.ok(qc[key].product > 0, `${key} should have a cost`);
    assert.equal(qc[key].labor, 0, `${key} must carry no labor`);
  }
});

test('every priced public-form question has a questionCosts entry', () => {
  const priced = INTAKE_QUESTIONS
    .filter(q => q.engine?.section && q.engine?.field && q.engine.section !== 'controls')
    .map(q => `${q.engine.section}.${q.engine.field}`);
  assert.ok(priced.length >= 10);
  for (const key of priced) assert.ok(qc[key], `missing questionCosts['${key}']`);
});

test('the public form never prices anything in the browser', () => {
  const src = readFileSync(new URL('../../src/app/conceptual_budget/IntakeClient.jsx', import.meta.url), 'utf8');
  assert.ok(!/from ['"]@\/lib\/(calculations|pricing|estimate|quantities|noDrawingGuesses)['"]/.test(src));
  assert.match(src, /estimate\?\.budget\?\.questionCosts/);
});
