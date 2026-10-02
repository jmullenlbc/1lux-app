/**
 * Design budget matches the Conceptual budget (Mike, 2026-09-12: "We need the
 * design questionnaire to match everything we have done with the conceptual
 * questionnaire"). Both budgets are priced by the same calculateBudget, so these
 * pin the shared rules the two screens now agree on.
 *
 *   1. Garage batteries: every emergency strategy except generator puts a
 *      battery in every other garage fixture (1 fixture / 625 SF, $120 each).
 *   2. The Design garage controls never charge that battery twice.
 *   3. Exit signs: edge-lit $120, mixed $75, thermoplastic $22, 1 per 5,000 SF.
 *   4. The 12" entry disk is actually charged (+$25/unit).
 *   5. The public questionnaire's walking-path bollard answer reaches the engine.
 *
 * Run: node --test scripts/tests/designMatch.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget } from '../../src/lib/calculations.js';
import { emergencyStrategyCost } from '../../src/lib/emergencyCost.js';
import { PRICING } from '../../src/lib/pricing.js';
import { INTAKE_QUESTIONS, answersToEngine } from '../../src/lib/intake/questionnaire.js';

const PD = { numUnits: 100, grossSf: 100000, garageSf: 50000, buildingTypeKey: 'podium' };
const budget = (responses = {}, pd = PD) => calculateBudget(pd, responses);

// ── 1. garage batteries ─────────────────────────────────────────────────────

test('only the integrated strategies buy garage batteries: 50,000 SF → 40 × $120 (Mike 10-2)', () => {
  for (const key of Object.keys(PRICING.emergency.strategies)) {
    const c = emergencyStrategyCost(PRICING, key, { garageSf: 50000 });
    if (key.startsWith('integrated_')) {
      assert.equal(c.garageBattery, true, `${key} should buy garage batteries`);
      assert.equal(c.batteryCount, 40);
      assert.equal(c.batteryCost, 4800);
      assert.equal(c.garage, 0, `${key} must not also charge a garage $/SF`);
    } else {
      assert.equal(c.garageBattery, false);
      assert.equal(c.batteryCost, 0);
    }
  }
  assert.equal(emergencyStrategyCost(PRICING, 'generator', { garageSf: 50000 }).garage, 0);
  assert.equal(emergencyStrategyCost(PRICING, 'frogeyes', { garageSf: 50000 }).garage, 50000 * 0.17);
  assert.equal(emergencyStrategyCost(PRICING, 'frogeyes_inv', { garageSf: 50000 }).garage, 50000 * 0.15);
  assert.equal(emergencyStrategyCost(PRICING, 'inverters', { garageSf: 50000 }).garage, 50000 * 0.50);
});

test('with a garage, all six emergency choices price differently (Mike 10-2)', () => {
  const totals = Object.keys(PRICING.emergency.strategies)
    .map(k => emergencyStrategyCost(PRICING, k, { corridorSf: 20000, intAmenitySf: 5000, garageSf: 50000 }).total);
  assert.equal(new Set(totals).size, totals.length, totals.join(', '));
});

test('an unanswered emergency question prices as Frogeyes (Mike 2026-09-12)', () => {
  assert.equal(
    budget({}).sections.emergency.product,
    budget({ emergency: { strategy: 'frogeyes' } }).sections.emergency.product,
  );
  const intake = INTAKE_QUESTIONS.find(x => x.engine?.section === 'emergency' && x.engine?.field === 'strategy');
  assert.equal(intake.engine.map[intake.default], 'frogeyes', 'the public form starts on Frogeyes too');
});

test('no garage, no batteries', () => {
  const c = emergencyStrategyCost(PRICING, 'integrated_inverters', { corridorSf: 10000, garageSf: 0 });
  assert.equal(c.garageBattery, false);
  assert.equal(c.batteryCost, 0);
});

test('the budget reports the garage battery count on the emergency line', () => {
  const e = budget({ emergency: { strategy: 'integrated_inverters' } }).sections.emergency;
  assert.deepEqual(e.garageBatteries, { count: 40, cost: 4800 });
  assert.equal(budget({ emergency: { strategy: 'generator' } }).sections.emergency.garageBatteries, null);
});

// ── 2. no double battery charge ─────────────────────────────────────────────

const designAdder = (strategy, garageControls) => budget({
  emergency: { strategy },
  corridors: { garageDesignLevel: 'medium', garageControls },
}).sections.designAdder.product;

test('Design garage "battery" adds $0 when the Emergency line already buys the batteries', () => {
  assert.equal(designAdder('integrated_inverters', 'battery'), designAdder('integrated_inverters', 'none'));
});

test('Design garage "battery + sensor" adds only the sensor when batteries are on Emergency', () => {
  assert.equal(designAdder('integrated_inverters', 'batteryAndSensor'), designAdder('integrated_inverters', 'occSensor'));
});

test('with a generator, the Design garage battery options are still charged', () => {
  const diff = designAdder('generator', 'battery') - designAdder('generator', 'none');
  assert.ok(Math.abs(diff - 50000 * PRICING.designGarage.batteryAdderPerSf) < 0.01, `got ${diff}`);
});

test('Design garage base rates: standard $0.20/SF, enhanced $0.25/SF', () => {
  const std = designAdder('generator', 'none');
  const enh = budget({ emergency: { strategy: 'generator' }, corridors: { garageDesignLevel: 'enhanced', garageControls: 'none' } })
    .sections.designAdder.product;
  assert.ok(Math.abs((enh - std) - 50000 * 0.05) < 0.01, `enhanced − standard = ${enh - std}`);
});

// ── 3. exit signs ───────────────────────────────────────────────────────────

test('exit signs: edge-lit is $120/sign, thermoplastic $22, one sign per 5,000 SF', () => {
  const edge  = budget({ corridors: { exitSignType: 'edgelit' } }).sections.designAdder.product;
  const thermo = budget({ corridors: { exitSignType: 'thermoplastic' } }).sections.designAdder.product;
  assert.equal(PRICING.designExitSigns.edgelitPerSign, 120);
  assert.ok(Math.abs((edge - thermo) - 20 * (120 - 22)) < 0.01, `got ${edge - thermo}`);
});

// ── 4. entry disk ───────────────────────────────────────────────────────────

test('the 12" entry disk is charged at +$25 per unit', () => {
  const typical = budget({ units: { entryDisk: 'typical' } }).sections.designAdder.product;
  const big     = budget({ units: { entryDisk: '12inch' } }).sections.designAdder.product;
  assert.equal(big - typical, 100 * 25);
});

// ── 5. public questionnaire ─────────────────────────────────────────────────

test('walking-path bollards: Yes/No reach the engine as exterior.pathwayBollards', () => {
  assert.equal(answersToEngine({ pathwayBollards: 'Yes' }).sections.exterior.pathwayBollards, 'yes');
  assert.equal(answersToEngine({ pathwayBollards: 'No' }).sections.exterior.pathwayBollards, 'no');
  const q = INTAKE_QUESTIONS.find(x => x.key === 'pathwayBollards');
  assert.equal(q.default, 'No');
});

test('the public form offers the Low-finish illuminated mirror, same as the Design screen (Mike 2026-09-13)', () => {
  const q = INTAKE_QUESTIONS.find(x => x.key === 'vanityLighting');
  assert.ok(q.options.includes('Illuminated mirror (Low finish)'));
  assert.equal(answersToEngine({ vanityLighting: 'Illuminated mirror (Low finish)' }).sections.units.vanity, 'illuminatedMirrorLow');
  // $175 gross − $45 bath-bar credit = $130 per vanity.
  const pd = { ...PD, numVanities: 100 };
  assert.equal(budget({ units: { vanity: 'illuminatedMirrorLow' } }, pd).sections.units.vanity.product, 100 * 130);
});

test('project type is its own section (asked on the Drawings page, not Controls)', () => {
  const q = INTAKE_QUESTIONS.find(x => x.key === 'projectType');
  assert.equal(q.section, 'Project type');
  assert.ok(!INTAKE_QUESTIONS.some(x => x.section === 'Controls'), 'nothing is left on a Controls section');
});
