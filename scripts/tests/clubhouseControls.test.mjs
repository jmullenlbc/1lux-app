/**
 * Clubhouse-only controls for town houses / single family (Mike 2026-09-15).
 *
 * Those two types carry a $0/SF controls rate, the homes have no common-area
 * controls. The clubhouse does: "Charge $5/SF and make that editable in master
 * pricing." So on a $0-rate type with clubhouse SF, controls = clubhouse SF ×
 * PRICING.controls.clubhousePerSf. No clubhouse = $0, as before. The caps, the
 * manual override and the energy-credit adder all still apply on top.
 *
 * Run: node --test scripts/tests/clubhouseControls.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget, fillPricingDefaults } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

const SECTIONS = { exterior: { siteDesignLevel: 'conventional' } };
const pd = (buildingTypeKey, extra = {}) => ({ grossSf: 226_396, unitsSf: 198_450, numUnits: 168, buildingTypeKey, ...extra });

test('the master sheet carries the clubhouse rate at $5/SF', () => {
  assert.equal(PRICING.controls.clubhousePerSf, 5);
  assert.equal(PRICING.controls.rates.townHouses.perSf, 0);
  assert.equal(PRICING.controls.rates.singleFamily.perSf, 0);
});

test('town houses with a 4,000 SF clubhouse: controls = 4,000 × $5 = $20,000', () => {
  const b = calculateBudget(pd('townHouses', { interiorAmenitySf: 4000 }), SECTIONS);
  assert.equal(b.controls, 20_000);
  assert.equal(b.controlsBasis, 'clubhouse');
  assert.equal(b.controlsBasisSf, 4000);
  assert.equal(b.controlsRateUsed, 5);
});

test('town houses with NO clubhouse still get $0 controls', () => {
  const b = calculateBudget(pd('townHouses', { interiorAmenitySf: 0 }), SECTIONS);
  assert.equal(b.controls, 0);
  assert.equal(b.controlsBasis, 'gross');
});

test('single family follows the same rule', () => {
  const b = calculateBudget(pd('singleFamily', { interiorAmenitySf: 2500 }), SECTIONS);
  assert.equal(b.controls, 12_500);
  assert.equal(b.controlsBasis, 'clubhouse');
});

test('a garden building with a clubhouse is untouched: still $/SF of gross', () => {
  const b = calculateBudget(pd('garden', { interiorAmenitySf: 5588 }), SECTIONS);
  assert.equal(b.controlsBasis, 'gross');
  assert.equal(b.controlsBasisSf, 226_396);
  assert.equal(b.controls, Math.min(226_396 * 0.18, 65_000));
});

test('the clubhouse rate is editable in master pricing and flows through the snapshot fill', () => {
  const sheet = fillPricingDefaults(PRICING, { controls: { clubhousePerSf: 7.5 } });
  const b = calculateBudget(pd('townHouses', { interiorAmenitySf: 4000 }), SECTIONS, sheet);
  assert.equal(b.controls, 30_000);
  assert.equal(b.controlsRateUsed, 7.5);
});

test('an old frozen sheet without the key picks up the $5 default', () => {
  const s = JSON.parse(JSON.stringify(PRICING));
  delete s.controls.clubhousePerSf;
  const b = calculateBudget(pd('townHouses', { interiorAmenitySf: 4000 }), SECTIONS, s);
  assert.equal(b.controls, 20_000);
});

test('the type cap still holds on a huge clubhouse', () => {
  const b = calculateBudget(pd('townHouses', { interiorAmenitySf: 20_000 }), SECTIONS);   // 20,000 × 5 = 100,000 uncapped
  assert.equal(b.controls, PRICING.controls.rates.townHouses.cap);
  assert.equal(b.controls, 50_000);
});

test('the manual override still replaces the clubhouse formula', () => {
  const b = calculateBudget(pd('townHouses', { interiorAmenitySf: 4000 }), { ...SECTIONS, controls: { controlsOverride: 9_000 } });
  assert.equal(b.controls, 9_000);
});

test('the energy-credit adder rides on top of the clubhouse controls', () => {
  const b = calculateBudget(pd('townHouses', { interiorAmenitySf: 4000 }), { ...SECTIONS, controls: { energyCredit: 'yes', energyCreditProgram: 'leed' } });
  assert.equal(b.controls, 20_000);
  assert.equal(Math.round(b.energyCreditControls), Math.round(20_000 * PRICING.controls.energyCreditPrograms.leed.controls));
});

// Mike 10-15: LEED and NGBS add 3% to lighting and 3% to controls; WELL adds
// 10% to lighting and 30% to controls; None removes the credit entirely, even
// when a stale energyCredit 'yes' is still stored from an earlier pick.
test('energy credit per program: LEED/NGBS 3/3, WELL 10/30, None 0/0', () => {
  const run = program => calculateBudget(pd('townHouses', { interiorAmenitySf: 4000 }), { ...SECTIONS, controls: { energyCredit: 'yes', energyCreditProgram: program } });
  const leed = run('leed'), ngbs = run('ngbs'), well = run('well'), none = run('none');
  assert.equal(leed.energyCreditLightingPct, 0.03);
  assert.equal(leed.energyCreditControlsPct, 0.03);
  assert.equal(ngbs.energyCreditLightingPct, 0.03);
  assert.equal(ngbs.energyCreditControlsPct, 0.03);
  assert.equal(well.energyCreditLightingPct, 0.10);
  assert.equal(well.energyCreditControlsPct, 0.30);
  assert.equal(Math.round(well.energyCreditControls), Math.round(well.controls * 0.30));
  assert.equal(none.energyCreditLightingPct, 0);
  assert.equal(none.energyCreditControls, 0);
  assert.equal(none.energyCreditLighting, 0);
  assert.ok(well.controlsTotal > leed.controlsTotal && leed.controlsTotal > none.controlsTotal);
});

// Mike, 2026-09-24: balconies can never outnumber units, whatever was typed.
test('engine caps balconies at the unit count', () => {
  const r = calculateBudget({ numUnits: 245, numBalconies: 23488 }, { units: { balcony: 'disk5inch' } });
  const capped = calculateBudget({ numUnits: 245, numBalconies: 245 }, { units: { balcony: 'disk5inch' } });
  assert.ok(capped.sections.units.balcony.product > 0);
  assert.equal(r.sections.units.balcony.product, capped.sections.units.balcony.product);
});

test('controls report their cap and whether it bit, and the public words show the math', async () => {
  const { controlsMathOf, controlsMathWords } = await import('../../src/lib/intake/controlsWords.js');
  const big = calculateBudget(pd('highRise', { grossSf: 5_000_000 }), SECTIONS);
  assert.equal(big.controlsCap, Math.min(PRICING.controls.rates.highRise.cap, PRICING.controls.cap));
  assert.equal(big.controlsCapped, true);
  assert.equal(big.controls, big.controlsCap);
  assert.match(controlsMathWords(controlsMathOf(big)), /\/SF × 5,000,000 SF = .*capped at \$/);

  const small = calculateBudget(pd('garden', { grossSf: 50_000 }), SECTIONS);
  assert.equal(small.controlsCapped, false);
  assert.doesNotMatch(controlsMathWords(controlsMathOf(small)), /capped at \$[\d,]+\. Controls are capped because/);

  const over = calculateBudget(pd('highRise'), { ...SECTIONS, controls: { controlsOverride: 50_000 } });
  assert.equal(controlsMathOf(over), null);
});
