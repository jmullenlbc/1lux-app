/**
 * Breezeway stairs — Mike 2026-09-12: "Maybe move to 2.2x ... in the
 * breezeway situation it's a corridor and stairwell in one. Yes stacked flats
 * should count too." Garden / stacked-flat / gurban walk-ups price each landing
 * at the stairwell rate × 2.2 ($175 × 2.2 = $385). This replaced the
 * 2026-09-05 per-stair package ($2,311 per 3-story stair).
 *
 * Run: node --test scripts/tests/breezewayStair.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { breezewayStairPackage, isBreezewayType, landingsPerStair } from '../../src/lib/stairLandings.js';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

const RATE = Math.round(PRICING.corridors.stairwellPerLanding.product * PRICING.corridors.breezewayLandingMultiplier * 100) / 100;

test('master sheet: 2.2 × $175 = $385 a breezeway landing; the old package prices are gone', () => {
  assert.equal(PRICING.corridors.breezewayLandingMultiplier, 2.2);
  assert.equal(PRICING.corridors.stairwellPerLanding.product, 175);
  assert.equal(RATE, 385);
  for (const k of ['landingLight', 'wallpackWithBattery', 'frogeye', 'vestibuleDisk']) {
    assert.equal(PRICING.breezewayStair[k], undefined, k);
  }
  assert.deepEqual(PRICING.breezewayStair.storiesDefault, { garden: 3, stackedFlats: 3, gurban: 4 });
});

test('only garden / stacked flats / gurban are breezeway types', () => {
  for (const k of ['garden', 'stackedFlats', 'gurban']) assert.equal(isBreezewayType(k), true, k);
  for (const k of ['wrap', 'podium', 'midRise', 'highRise', 'townHouses', 'singleFamily', null, undefined, 7]) {
    assert.equal(isBreezewayType(k), false, String(k));
  }
});

test('Lowell: 125 landings × $385, about 25 stairs of 3 levels', () => {
  const landings = 25 * landingsPerStair(3);            // 125, no contingency (typed)
  const pkg = breezewayStairPackage({ landings, stories: 3, buildingTypeKey: 'garden' });
  assert.ok(pkg);
  assert.equal(pkg.landings, 125);
  assert.equal(pkg.perLanding, 175);
  assert.equal(pkg.multiplier, 2.2);
  assert.equal(pkg.ratePerLanding, 385);
  assert.equal(pkg.product, 48125);
  assert.equal(pkg.stairs, 25);
  assert.equal(pkg.storiesDefaulted, false);
  assert.match(pkg.how, /corridor and the stairwell in one/);
});

test('stacked flats and gurban price the same way', () => {
  assert.equal(breezewayStairPackage({ landings: 100, stories: 3, buildingTypeKey: 'stackedFlats' }).product, 100 * RATE);
  assert.equal(breezewayStairPackage({ landings: 70, buildingTypeKey: 'gurban' }).product, 70 * RATE);
});

test('the price follows landings, not the rounded stair count', () => {
  // 138 landings ÷ 5 = 27.6 stairs, but the price is the landings
  const pkg = breezewayStairPackage({ landings: 138, stories: 3, buildingTypeKey: 'garden' });
  assert.equal(pkg.stairs, 28);
  assert.equal(pkg.product, 138 * RATE);
});

test('no story count → the type default (garden 3, gurban 4), and says so', () => {
  const g = breezewayStairPackage({ landings: 50, buildingTypeKey: 'garden' });
  assert.equal(g.stories, 3);
  assert.equal(g.storiesDefaulted, true);
  assert.match(g.how, /3 levels assumed/);
  const u = breezewayStairPackage({ landings: 70, buildingTypeKey: 'gurban' });
  assert.equal(u.stories, 4);
  assert.equal(u.stairs, 10);                            // 70 ÷ 7
});

test('never fewer than one stair once there are landings; null with none', () => {
  assert.equal(breezewayStairPackage({ landings: 1, stories: 3, buildingTypeKey: 'garden' }).stairs, 1);
  assert.equal(breezewayStairPackage({ landings: 0, stories: 3, buildingTypeKey: 'garden' }), null);
  assert.equal(breezewayStairPackage({ landings: null, buildingTypeKey: 'garden' }), null);
  assert.equal(breezewayStairPackage({ landings: 25, stories: 3, buildingTypeKey: 'midRise' }), null);
  assert.equal(breezewayStairPackage({ landings: 25, stories: 3 }), null);
});

test('a live pricing sheet overrides the rate, the multiplier and the level defaults; junk falls back', () => {
  const live = { corridors: { stairwellPerLanding: { product: 200 }, breezewayLandingMultiplier: 2 }, breezewayStair: { storiesDefault: { garden: 4 } } };
  const pkg = breezewayStairPackage({ landings: 70, buildingTypeKey: 'garden' }, live);
  assert.equal(pkg.stories, 4);
  assert.equal(pkg.ratePerLanding, 400);
  assert.equal(pkg.product, 28000);
  const junk = { corridors: { stairwellPerLanding: { product: 'x' }, breezewayLandingMultiplier: -1 } };
  assert.equal(breezewayStairPackage({ landings: 10, buildingTypeKey: 'garden' }, junk).ratePerLanding, 385);
});

// ── through the engine ─────────────────────────────────────────────────────

const base = { grossSf: 300000, unitsSf: 240000, numUnits: 250, numEgressStairwells: 125, numFloors: 3 };

test('engine: a garden project prices landings × $385', () => {
  const b = calculateBudget({ ...base, buildingTypeKey: 'garden' }, {}, null);
  const st = b.sections.corridors.stairwells;
  assert.equal(st.product, 125 * RATE);
  assert.equal(st.landings, 125);
  assert.equal(st.breezeway.ratePerLanding, 385);
});

test('engine: a mid-rise project is untouched — still $175/landing', () => {
  const b = calculateBudget({ ...base, buildingTypeKey: 'midRise' }, {}, null);
  const st = b.sections.corridors.stairwells;
  assert.equal(st.product, 125 * PRICING.corridors.stairwellPerLanding.product);
  assert.equal(st.breezeway, null);
});

test('engine: the building type from the questionnaire counts when the project has none', () => {
  const b = calculateBudget(base, { controls: { buildingType: 'stackedFlats' } }, null);
  assert.ok(b.sections.corridors.stairwells.breezeway);
  assert.equal(b.sections.corridors.stairwells.product, 125 * RATE);
});

test('engine: the elevated-design adder still rides on landings, on top', () => {
  const code = calculateBudget({ ...base, buildingTypeKey: 'garden' }, { corridors: { stairwellDesign: 'code' } }, null);
  const elev = calculateBudget({ ...base, buildingTypeKey: 'garden' }, { corridors: { stairwellDesign: 'elevated' } }, null);
  assert.equal(elev.sections.corridors.stairwells.product, code.sections.corridors.stairwells.product);
  assert.equal(elev.lightingProductSubtotal - code.lightingProductSubtotal, 125 * PRICING.designCorridors.stairwellElevatedAdder);
});

test('engine: a frozen pricing snapshot without the multiplier still prices 2.2× from master', () => {
  const b = calculateBudget({ ...base, buildingTypeKey: 'garden' }, {}, { corridors: { diskPerSf: 0.27, stairwellPerLanding: { product: 175 } } });
  assert.equal(b.sections.corridors.stairwells.product, 125 * RATE);
});
