/**
 * Breezeway stair package — Mike 2026-09-05: "Where it does matter a lot is
 * breezeways ... you have landings and you have the lighting on the stairs
 * and egress." Pinned to the Lowell + I76 GMP set: 7 × 3-story garden
 * buildings, 25 open stairs, each with 3 C4 landing disks, 7 W1 wall packs
 * w/ battery (2N+1), 3 X1 frogeyes, 2 C6 vestibule disks (N−1). The ground
 * egress wall pack (EW2) is the exterior wallpacks line — not repeated.
 * Prices are Mike's 2026-09-05: disk $12, wall pack $300, frogeye $25,
 * vestibule disk w/ battery $50 → $2,311 per 3-story stair.
 *
 * Run: node --test scripts/tests/breezewayStair.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { breezewayStairPackage, isBreezewayType, landingsPerStair } from '../../src/lib/stairLandings.js';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

const R = PRICING.breezewayStair;
const perStair3 = 3 * R.landingLight + 7 * R.wallpackWithBattery + 3 * R.frogeye + 2 * R.vestibuleDisk;

test('master sheet carries Mike\'s 2026-09-05 prices', () => {
  assert.deepEqual(
    { l: R.landingLight, w: R.wallpackWithBattery, f: R.frogeye, v: R.vestibuleDisk },
    { l: 12, w: 300, f: 25, v: 50 },
  );
  assert.equal(perStair3, 2311);
});

test('only garden / stacked flats / gurban are breezeway types', () => {
  for (const k of ['garden', 'stackedFlats', 'gurban']) assert.equal(isBreezewayType(k), true, k);
  for (const k of ['wrap', 'podium', 'midRise', 'highRise', 'townHouses', 'singleFamily', null, undefined, 7]) {
    assert.equal(isBreezewayType(k), false, String(k));
  }
});

test('Lowell: 25 stairs × 3 levels → 125 landings → the per-stair package × 25', () => {
  const landings = 25 * landingsPerStair(3);            // 125, no contingency (typed)
  const pkg = breezewayStairPackage({ landings, stories: 3, buildingTypeKey: 'garden' });
  assert.ok(pkg);
  assert.equal(pkg.stairs, 25);
  assert.equal(pkg.stories, 3);
  assert.equal(pkg.storiesDefaulted, false);
  assert.deepEqual(pkg.perStair, { landingLights: 3, wallpacks: 7, frogeyes: 3, vestibuleDisks: 2 });
  assert.deepEqual(pkg.counts,   { landingLights: 75, wallpacks: 175, frogeyes: 75, vestibuleDisks: 50 });
  assert.equal(pkg.perStairProduct, perStair3);
  assert.equal(pkg.product, 25 * perStair3);
  assert.match(pkg.how, /25 breezeway stairs/);
  assert.match(pkg.how, /exterior wallpacks line/);
});

test('the +10% landings contingency rides through as extra stairs', () => {
  // 125 × 1.10 = 138 landings, 138 ÷ 5 = 27.6 → 28 stairs
  const pkg = breezewayStairPackage({ landings: 138, stories: 3, buildingTypeKey: 'garden' });
  assert.equal(pkg.stairs, 28);
  assert.equal(pkg.product, 28 * perStair3);
});

test('no story count → the type default (garden 3, gurban 4), and says so', () => {
  const g = breezewayStairPackage({ landings: 50, buildingTypeKey: 'garden' });
  assert.equal(g.stories, 3);
  assert.equal(g.storiesDefaulted, true);
  assert.match(g.how, /3 levels assumed/);
  const u = breezewayStairPackage({ landings: 70, buildingTypeKey: 'gurban' });
  assert.equal(u.stories, 4);
  assert.deepEqual(u.perStair, { landingLights: 4, wallpacks: 9, frogeyes: 4, vestibuleDisks: 3 });
  assert.equal(u.stairs, 10);                            // 70 ÷ 7
});

test('never fewer than one stair once there are landings; null with none', () => {
  assert.equal(breezewayStairPackage({ landings: 1, stories: 3, buildingTypeKey: 'garden' }).stairs, 1);
  assert.equal(breezewayStairPackage({ landings: 0, stories: 3, buildingTypeKey: 'garden' }), null);
  assert.equal(breezewayStairPackage({ landings: null, buildingTypeKey: 'garden' }), null);
  assert.equal(breezewayStairPackage({ landings: 25, stories: 3, buildingTypeKey: 'midRise' }), null);
  assert.equal(breezewayStairPackage({ landings: 25, stories: 3 }), null);
});

test('a live pricing sheet overrides the unit prices and the level defaults; junk falls back', () => {
  const live = { breezewayStair: { landingLight: 100, wallpackWithBattery: 'x', frogeye: -5, vestibuleDisk: 0, storiesDefault: { garden: 4 } } };
  const pkg = breezewayStairPackage({ landings: 70, buildingTypeKey: 'garden' }, live);
  assert.equal(pkg.stories, 4);
  assert.deepEqual(pkg.rates, { landingLight: 100, wallpackWithBattery: R.wallpackWithBattery, frogeye: R.frogeye, vestibuleDisk: 0 });
  assert.equal(pkg.perStairProduct, 4 * 100 + 9 * R.wallpackWithBattery + 4 * R.frogeye + 0);
});

// ── through the engine ─────────────────────────────────────────────────────

const base = { grossSf: 300000, unitsSf: 240000, numUnits: 250, numEgressStairwells: 125, numFloors: 3 };

test('engine: a garden project prices the breezeway package, exposes the counts', () => {
  const b = calculateBudget({ ...base, buildingTypeKey: 'garden' }, {}, null);
  const st = b.sections.corridors.stairwells;
  assert.equal(st.product, 25 * perStair3);
  assert.equal(st.landings, 125);
  assert.equal(st.breezeway.stairs, 25);
  assert.equal(st.breezeway.counts.wallpacks, 175);
});

test('engine: a mid-rise project is untouched — still $/landing, no package', () => {
  const b = calculateBudget({ ...base, buildingTypeKey: 'midRise' }, {}, null);
  const st = b.sections.corridors.stairwells;
  assert.equal(st.product, 125 * PRICING.corridors.stairwellPerLanding.product);
  assert.equal(st.breezeway, null);
});

test('engine: the building type from the questionnaire counts when the project has none', () => {
  const b = calculateBudget(base, { controls: { buildingType: 'stackedFlats' } }, null);
  assert.ok(b.sections.corridors.stairwells.breezeway);
  assert.equal(b.sections.corridors.stairwells.breezeway.stairs, 25);
});

test('engine: the elevated-design adder still rides on landings, on top of the package', () => {
  const code = calculateBudget({ ...base, buildingTypeKey: 'garden' }, { corridors: { stairwellDesign: 'code' } }, null);
  const elev = calculateBudget({ ...base, buildingTypeKey: 'garden' }, { corridors: { stairwellDesign: 'elevated' } }, null);
  assert.equal(elev.sections.corridors.stairwells.product, code.sections.corridors.stairwells.product);
  assert.equal(elev.lightingProductSubtotal - code.lightingProductSubtotal, 125 * PRICING.designCorridors.stairwellElevatedAdder);
});

test('engine: a frozen pricing snapshot without the new keys still prices the package from master', () => {
  const b = calculateBudget({ ...base, buildingTypeKey: 'garden' }, {}, { corridors: { diskPerSf: 0.27, stairwellPerLanding: { product: 175 } } });
  assert.equal(b.sections.corridors.stairwells.product, 25 * perStair3);
});
