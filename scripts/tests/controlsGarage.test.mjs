// Mike 10-15: controls is ONE number, but behind it the garage is its own
// piece that scales with garage size: $0.035/SF, never under $2,000 and never
// over $10,000. The building piece runs on gross SF without the garage when
// the stated gross clearly included it. Run: node scripts/tests/controlsGarage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICING } from '../../src/lib/pricing.js';
import { controlsGaragePiece, programPcts } from '../../src/lib/controlsMath.js';
import { calculateBudget } from '../../src/lib/calculations.js';

const G = PRICING.controls.garage;

test('sheet values: $0.035/SF between $2,000 and $10,000', () => {
  assert.equal(G.perSf, 0.035);
  assert.equal(G.minDollars, 2000);
  assert.equal(G.maxDollars, 10000);
});

test('no garage: no garage piece, building SF is the gross', () => {
  const p = controlsGaragePiece(PRICING, { grossSf: 300_000, garageSf: 0, unitsSf: 240_000, corridorSf: 30_000, intAmenitySf: 6_000 });
  assert.equal(p.dollars, 0);
  assert.equal(p.buildingSf, 300_000);
});

test('a small garage is floored at $2,000, a huge one capped at $10,000', () => {
  const small = controlsGaragePiece(PRICING, { grossSf: 300_000, garageSf: 20_000, unitsSf: 200_000, corridorSf: 30_000, intAmenitySf: 6_000 });
  assert.equal(small.dollars, 2000);
  const huge = controlsGaragePiece(PRICING, { grossSf: 900_000, garageSf: 400_000, unitsSf: 400_000, corridorSf: 50_000, intAmenitySf: 10_000 });
  assert.equal(huge.dollars, 10000);
  const mid = controlsGaragePiece(PRICING, { grossSf: 500_000, garageSf: 156_000, unitsSf: 280_000, corridorSf: 40_500, intAmenitySf: 6_600 });
  assert.equal(mid.dollars, Math.round(156_000 * 0.035 * 100) / 100);
});

test('gross that includes the garage loses it from the building piece; gross that does not keeps it', () => {
  // 500K gross with a 156K garage still leaves room for units + corridors + amenity: the garage was inside the gross.
  const inside = controlsGaragePiece(PRICING, { grossSf: 500_000, garageSf: 156_000, unitsSf: 280_000, corridorSf: 40_500, intAmenitySf: 6_600 });
  assert.equal(inside.grossIncludedGarage, true);
  assert.equal(inside.buildingSf, 344_000);
  // 330K gross is already just the units + corridors + amenity: the garage was NOT inside the gross.
  const outside = controlsGaragePiece(PRICING, { grossSf: 330_000, garageSf: 156_000, unitsSf: 280_000, corridorSf: 40_500, intAmenitySf: 6_600 });
  assert.equal(outside.grossIncludedGarage, false);
  assert.equal(outside.buildingSf, 330_000);
});

test('the engine folds the garage piece into the one controls number', () => {
  const pdNoGar = { projectType: 'wrap', numUnits: 300, grossSf: 344_000, unitsSf: 280_000, corridorSf: 40_500, interiorAmenitySf: 6_600, garageSf: 0 };
  const pdGar   = { ...pdNoGar, grossSf: 500_000, garageSf: 156_000 };
  const a = calculateBudget(pdNoGar, {});
  const b = calculateBudget(pdGar, {});
  assert.equal(a.controlsGarage, 0);
  assert.equal(b.controlsGarage, 5460);
  assert.equal(Math.round(b.controls - a.controls), 5460);
  // The public budget only ever shows `controls`; the garage is inside it.
  assert.ok(b.controls > a.controls);
});

test('program percents: a number applies to both sides, an object per side, unknown falls back to 3%', () => {
  assert.deepEqual(programPcts({ controls: { energyCreditAdderPct: 0.03, energyCreditPrograms: { x: 0.05 } } }, 'x'), { lighting: 0.05, controls: 0.05 });
  assert.deepEqual(programPcts(PRICING, 'well'), { lighting: 0.10, controls: 0.30 });
  assert.deepEqual(programPcts(PRICING, 'other'), { lighting: 0.03, controls: 0.03 });
  assert.deepEqual(programPcts(PRICING, 'nope'), { lighting: 0.03, controls: 0.03 });
});
