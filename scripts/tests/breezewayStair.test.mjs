/**
 * Stair landings and breezeway stairs, Mike 2026-09-14:
 *   "regular stairwell = $200/landing (Up from $175/landing. We have seen a
 *   cost increase we need to change in master pricing)"
 *   Small breezeway (like Lowell + I76): "a 10-15% increase in cost"
 *   Long breezeway (like Lone Tree Ranch): "a 20-25% increase in cost"
 * Then: "I think we can only make these different prices when we have drawings
 * and can see small or large. No one will know what that means. If we don't
 * have drawings can we ask corridors + stairwells or breezeways (Interior or
 * Exterior) as a single select dropdown on the corridors section and then we
 * average the price?"
 *
 * So: breezeway landings price at $200 × 1.125 (small) = $225, × 1.225 (long)
 * = $245, or, until someone picks off the drawings, the average, × 1.175 =
 * $235. Interior vs breezeway is its own answer (corridors.stairType); unset,
 * it follows the building type.
 *
 * Run: node --test scripts/tests/breezewayStair.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  breezewayStairPackage, isBreezewayType, landingsPerStair, breezewayStyle, breezewayMultiplier,
  stairTypeFor, BREEZEWAY_STYLES, STAIR_TYPES,
} from '../../src/lib/stairLandings.js';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

const SMALL   = 225;
const LONG    = 245;
const AVERAGE = 235;

test('master sheet: $200 a landing; small 1.125 ($225), long 1.225 ($245); the flat 2.2× is gone', () => {
  assert.equal(PRICING.corridors.stairwellPerLanding.product, 200);
  assert.equal(PRICING.corridors.breezewaySmallMultiplier, 1.125);
  assert.equal(PRICING.corridors.breezewayLongMultiplier, 1.225);
  assert.equal(PRICING.corridors.breezewayLandingMultiplier, undefined);
  for (const k of ['landingLight', 'wallpackWithBattery', 'frogeye', 'vestibuleDisk']) {
    assert.equal(PRICING.breezewayStair[k], undefined, k);
  }
  assert.deepEqual(PRICING.breezewayStair.storiesDefault, { garden: 3, stackedFlats: 3, gurban: 4 });
});

test('small is 10 to 15% over a plain landing, long is 20 to 25%, average sits halfway ($235)', () => {
  const plain = PRICING.corridors.stairwellPerLanding.product;
  assert.ok(SMALL / plain >= 1.10 && SMALL / plain <= 1.15);
  assert.ok(LONG / plain >= 1.20 && LONG / plain <= 1.25);
  assert.equal(breezewayMultiplier('average'), 1.175);
  assert.equal(breezewayMultiplier(undefined), 1.175);
  assert.equal(breezewayMultiplier('small'), 1.125);
  assert.equal(breezewayMultiplier('long'), 1.225);
});

test('only garden / stacked flats / gurban are breezeway types', () => {
  for (const k of ['garden', 'stackedFlats', 'gurban']) assert.equal(isBreezewayType(k), true, k);
  for (const k of ['wrap', 'podium', 'midRise', 'highRise', 'townHouses', 'singleFamily', null, undefined, 7]) {
    assert.equal(isBreezewayType(k), false, String(k));
  }
});

test('stair type: an answer wins; unset follows the building type', () => {
  assert.deepEqual(Object.keys(STAIR_TYPES), ['interior', 'breezeway']);
  assert.equal(stairTypeFor('breezeway', 'midRise'), 'breezeway');
  assert.equal(stairTypeFor('interior', 'garden'), 'interior');
  assert.equal(stairTypeFor(undefined, 'garden'), 'breezeway');
  assert.equal(stairTypeFor('', 'wrap'), 'interior');
  assert.equal(stairTypeFor('junk', 'gurban'), 'breezeway');
  assert.equal(stairTypeFor(null, null), 'interior');
});

test('style: "small" and "long" only when picked; anything else is the average', () => {
  assert.equal(breezewayStyle('long'), 'long');
  assert.equal(breezewayStyle('small'), 'small');
  for (const v of [undefined, null, '', 'average', 'LONG', 'medium']) assert.equal(breezewayStyle(v), 'average', String(v));
  assert.deepEqual(Object.keys(BREEZEWAY_STYLES).sort(), ['average', 'long', 'small']);
});

test('no drawings (no style): 125 landings × $235, about 25 stairs of 3 levels', () => {
  const landings = 25 * landingsPerStair(3);            // 125, no contingency (typed)
  const pkg = breezewayStairPackage({ landings, stories: 3, buildingTypeKey: 'garden' });
  assert.ok(pkg);
  assert.equal(pkg.landings, 125);
  assert.equal(pkg.style, 'average');
  assert.equal(pkg.perLanding, 200);
  assert.equal(pkg.multiplier, 1.175);
  assert.equal(pkg.ratePerLanding, AVERAGE);
  assert.equal(pkg.product, 125 * AVERAGE);
  assert.equal(pkg.stairs, 25);
  assert.equal(pkg.storiesDefaulted, false);
  assert.match(pkg.how, /breezeway \(average\)/);
  assert.doesNotMatch(pkg.how, /like null/);
});

test('Lowell off the drawings: small = $225 a landing and says so', () => {
  const pkg = breezewayStairPackage({ landings: 125, stories: 3, buildingTypeKey: 'garden', style: 'small' });
  assert.equal(pkg.style, 'small');
  assert.equal(pkg.multiplier, 1.125);
  assert.equal(pkg.ratePerLanding, SMALL);
  assert.equal(pkg.product, 28125);
  assert.match(pkg.how, /small breezeway \(like Lowell \+ I76\)/);
});

test('long breezeway: $245 a landing and says so', () => {
  const pkg = breezewayStairPackage({ landings: 100, stories: 3, buildingTypeKey: 'garden', style: 'long' });
  assert.equal(pkg.style, 'long');
  assert.equal(pkg.multiplier, 1.225);
  assert.equal(pkg.ratePerLanding, LONG);
  assert.equal(pkg.product, 100 * LONG);
  assert.match(pkg.how, /long breezeway \(like Lone Tree Ranch\)/);
});

test('stacked flats and gurban price the same way', () => {
  assert.equal(breezewayStairPackage({ landings: 100, stories: 3, buildingTypeKey: 'stackedFlats' }).product, 100 * AVERAGE);
  assert.equal(breezewayStairPackage({ landings: 70, buildingTypeKey: 'gurban', style: 'long' }).product, 70 * LONG);
});

test('the stair-type answer beats the building type, both ways', () => {
  // an exterior-breezeway wrap: breezeway pricing, 3 levels assumed with no story count
  const wrap = breezewayStairPackage({ landings: 50, buildingTypeKey: 'wrap', stairType: 'breezeway' });
  assert.ok(wrap);
  assert.equal(wrap.ratePerLanding, AVERAGE);
  assert.equal(wrap.stories, 3);
  // an interior-stair garden: plain landings
  assert.equal(breezewayStairPackage({ landings: 50, buildingTypeKey: 'garden', stairType: 'interior' }), null);
});

test('the price follows landings, not the rounded stair count', () => {
  // 138 landings ÷ 5 = 27.6 stairs, but the price is the landings
  const pkg = breezewayStairPackage({ landings: 138, stories: 3, buildingTypeKey: 'garden' });
  assert.equal(pkg.stairs, 28);
  assert.equal(pkg.product, 138 * AVERAGE);
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

test('a live pricing sheet overrides the rate, each multiplier (and so the average) and the level defaults; junk falls back', () => {
  const live = {
    corridors: { stairwellPerLanding: { product: 250 }, breezewaySmallMultiplier: 1.2, breezewayLongMultiplier: 1.3 },
    breezewayStair: { storiesDefault: { garden: 4 } },
  };
  const pkg = breezewayStairPackage({ landings: 70, buildingTypeKey: 'garden' }, live);
  assert.equal(pkg.stories, 4);
  assert.equal(pkg.ratePerLanding, 312.5);                // 250 × 1.25
  assert.equal(pkg.product, 21875);
  assert.equal(breezewayStairPackage({ landings: 10, buildingTypeKey: 'garden', style: 'small' }, live).ratePerLanding, 300);
  assert.equal(breezewayStairPackage({ landings: 10, buildingTypeKey: 'garden', style: 'long' }, live).ratePerLanding, 325);
  const junk = { corridors: { stairwellPerLanding: { product: 'x' }, breezewaySmallMultiplier: -1, breezewayLongMultiplier: 'y' } };
  assert.equal(breezewayStairPackage({ landings: 10, buildingTypeKey: 'garden' }, junk).ratePerLanding, AVERAGE);
  assert.equal(breezewayStairPackage({ landings: 10, buildingTypeKey: 'garden', style: 'long' }, junk).ratePerLanding, LONG);
});

test('an old saved sheet still carrying the 2.2× key is ignored', () => {
  const old = { corridors: { stairwellPerLanding: { product: 200 }, breezewayLandingMultiplier: 2.2 } };
  assert.equal(breezewayStairPackage({ landings: 10, buildingTypeKey: 'garden' }, old).ratePerLanding, AVERAGE);
});

// ── through the engine ─────────────────────────────────────────────────────

const base = { grossSf: 300000, unitsSf: 240000, numUnits: 250, numEgressStairwells: 125, numFloors: 3 };

test('engine: a garden project with no drawings prices landings × $235', () => {
  const b = calculateBudget({ ...base, buildingTypeKey: 'garden' }, {}, null);
  const st = b.sections.corridors.stairwells;
  assert.equal(st.product, 125 * AVERAGE);
  assert.equal(st.landings, 125);
  assert.equal(st.breezeway.ratePerLanding, AVERAGE);
  assert.equal(st.breezeway.style, 'average');
  assert.equal(b.questionCosts['corridors.stairType'].product, 125 * AVERAGE);
});

test('engine: the breezeway-style answer switches to $225 or $245', () => {
  const small = calculateBudget({ ...base, buildingTypeKey: 'garden' }, { corridors: { breezewayStyle: 'small' } }, null);
  assert.equal(small.sections.corridors.stairwells.product, 125 * SMALL);
  const long = calculateBudget({ ...base, buildingTypeKey: 'garden' }, { corridors: { breezewayStyle: 'long' } }, null);
  assert.equal(long.sections.corridors.stairwells.product, 125 * LONG);
  assert.equal(long.questionCosts['corridors.breezewayStyle'].product, 125 * LONG);
});

test('engine: a mid-rise project prices $200/landing and has no breezeway-style cost', () => {
  const b = calculateBudget({ ...base, buildingTypeKey: 'midRise' }, { corridors: { breezewayStyle: 'long' } }, null);
  const st = b.sections.corridors.stairwells;
  assert.equal(st.product, 125 * 200);
  assert.equal(st.breezeway, null);
  assert.equal(b.questionCosts['corridors.breezewayStyle'], undefined);
  assert.equal(b.questionCosts['corridors.stairType'].product, 125 * 200);
});

test('engine: the dropdown flips a mid-rise to breezeways and a garden to interior stairs', () => {
  const mid = calculateBudget({ ...base, buildingTypeKey: 'midRise' }, { corridors: { stairType: 'breezeway' } }, null);
  assert.equal(mid.sections.corridors.stairwells.product, 125 * AVERAGE);
  const garden = calculateBudget({ ...base, buildingTypeKey: 'garden' }, { corridors: { stairType: 'interior', breezewayStyle: 'long' } }, null);
  assert.equal(garden.sections.corridors.stairwells.product, 125 * 200);
  assert.equal(garden.sections.corridors.stairwells.breezeway, null);
});

test('engine: the building type from the questionnaire counts when the project has none', () => {
  const b = calculateBudget(base, { controls: { buildingType: 'stackedFlats' } }, null);
  assert.ok(b.sections.corridors.stairwells.breezeway);
  assert.equal(b.sections.corridors.stairwells.product, 125 * AVERAGE);
});

test('engine: the elevated-design adder still rides on landings, on top', () => {
  const code = calculateBudget({ ...base, buildingTypeKey: 'garden' }, { corridors: { stairwellDesign: 'code' } }, null);
  const elev = calculateBudget({ ...base, buildingTypeKey: 'garden' }, { corridors: { stairwellDesign: 'elevated' } }, null);
  assert.equal(elev.sections.corridors.stairwells.product, code.sections.corridors.stairwells.product);
  assert.equal(elev.lightingProductSubtotal - code.lightingProductSubtotal, 125 * PRICING.designCorridors.stairwellElevatedAdder);
});

test('engine: a frozen $175 snapshot keeps its $175 and picks up the average multiplier from master', () => {
  const b = calculateBudget({ ...base, buildingTypeKey: 'garden' }, {}, { corridors: { diskPerSf: 0.27, stairwellPerLanding: { product: 175 } } });
  const rate = Math.round(175 * 1.175 * 100) / 100;      // 205.63
  assert.equal(b.sections.corridors.stairwells.product, Math.round(125 * rate * 100) / 100);
});
