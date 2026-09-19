/**
 * Stair landings — Mike's ladder (2026-09-05): drawings → building code →
 * a human. Pins the 2N−1 rule (the middle landing between floors), the +10%
 * contingency on derived counts, and the code-minimum fallback (≥2 exit
 * stairs per building, one per ~15,000 SF of corridor floor plate or ~5,000
 * SF of breezeway walk-up plate; townhouse stairs are private → zero).
 *
 * Run: node --test scripts/tests/stairLandings.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateStairLandings, landingsPerStair, landingFactors } from '../../src/lib/stairLandings.js';
import { PRICING } from '../../src/lib/pricing.js';

test('the factors live on the master pricing sheet at the values Mike set', () => {
  const f = landingFactors();
  assert.equal(f.contingency, 0.10);
  assert.equal(f.minStairs, 2);
  assert.equal(f.plateSfPerStair, 15000);                     // corridor, calibrated 2026-09-05
  assert.equal(f.breezewayPlateSfPerStair, 5000);             // garden walk-ups, same day
  assert.equal(PRICING.estimation.landingsContingency, 0.10);
});

test('a live pricing sheet overrides the factors; a bad value falls back', () => {
  const f = landingFactors({ estimation: { landingsContingency: 0.2, exitStairsMinPerBuilding: 3, floorPlateSfPerExitStair: 'x', breezewayPlateSfPerExitStair: -1 } });
  assert.equal(f.contingency, 0.2);
  assert.equal(f.minStairs, 3);
  assert.equal(f.plateSfPerStair, 15000);
  assert.equal(f.breezewayPlateSfPerStair, 5000);
});

test('2N−1: a stair serving 3 floors has 3 floor landings + 2 in between', () => {
  assert.equal(landingsPerStair(3), 5);
  assert.equal(landingsPerStair(1), 1);
  assert.equal(landingsPerStair(0), 0);
  assert.equal(landingsPerStair(null), 0);
});

test('drawings say it: stairs × (2N−1) + 10%', () => {
  const e = estimateStairLandings({ stories: 4, stairs: 2 });
  assert.equal(e.base, 14);
  assert.equal(e.landings, 15);                              // 15.4 → 15
  assert.equal(e.estimated, false);
  assert.equal(e.flag, null);
  assert.match(e.how, /2 stairs × \(2 × 4 stories − 1\) = 14 landings, \+ 10% = 15/);
  assert.match(e.how, /mid-level landing/);
});

test('Town Lake shape: 2 stairs on a 20-story tower ≈ Mike\'s 80 landings', () => {
  const e = estimateStairLandings({ stories: 20, stairs: 2 });
  assert.equal(e.base, 78);
  assert.equal(e.landings, 86);
});

test('Lone Tree shape (Mike 2026-09-16): 3 stairs per building × 4 buildings, 7 stories', () => {
  const e = estimateStairLandings({ stories: 7, stairsPerBuilding: 3, buildings: 4 });
  assert.equal(e.stairs, 12);
  assert.equal(e.base, 156);                                   // 12 × (2 × 7 − 1)
  assert.equal(e.landings, 172);                               // 171.6 → 172
  assert.equal(e.perBuildingGiven, true);
  assert.equal(e.estimated, false);
  assert.equal(e.flag, null);
  assert.match(e.how, /4 buildings × 3 exit stairs each = 12 stairs/);
  assert.match(e.how, /12 stairs × \(2 × 7 stories − 1\) = 156 landings, \+ 10% = 172/);
});

test('a project-total stair count is never multiplied by the building count', () => {
  const e = estimateStairLandings({ stories: 7, stairs: 12, buildings: 4 });
  assert.equal(e.stairs, 12);
  assert.equal(e.perBuildingGiven, false);
  assert.equal(e.landings, 172);
});

test('no stair count: code minimum of 2 per building when there is no footprint', () => {
  const e = estimateStairLandings({ stories: 3, stairs: null, buildings: 5 });
  assert.equal(e.stairsEstimated, true);
  assert.equal(e.stairs, 10);
  assert.equal(e.base, 50);
  assert.equal(e.landings, 55);
  assert.match(e.flag, /ESTIMATED from building-code/);
  assert.match(e.how, /5 buildings × 2 exit stairs/);
});

test('no stair count: a long floor plate gets more stairs (one per 15,000 SF, corridor)', () => {
  // Broadstone-sized wrap: one building, ~140,000 SF plate → 9 stairs —
  // Broadstone's actual drawings work out to ~11, so 15,000 lands close.
  const e = estimateStairLandings({ stories: 5, stairs: null, buildings: 1, footprintSf: 139541 });
  assert.equal(e.stairsPerBuilding, 9);
  assert.equal(e.stairs, 9);
  assert.equal(e.base, 81);
  assert.equal(e.landings, 89);
  // A small plate never drops below the minimum.
  const s = estimateStairLandings({ stories: 3, stairs: null, buildings: 1, footprintSf: 12000 });
  assert.equal(s.stairsPerBuilding, 2);
});

test('garden walk-ups pack stairs much tighter: one breezeway stair per 5,000 SF', () => {
  // Fulshear-sized garden project: ~130,000 SF of plate → 26 breezeway
  // stairs (its actual drawings imply ~25 — each stair serves ~5K SF).
  const e = estimateStairLandings({ stories: 3, stairs: null, buildings: 1, footprintSf: 130463, buildingTypeKey: 'garden' });
  assert.equal(e.stairs, 26);
  assert.equal(e.base, 130);                                  // 26 × (2×3−1)
  assert.equal(e.landings, 143);
  assert.match(e.how, /breezeway stair per 5,000 SF/);
  // Same shape read as a corridor building: 130,463 ÷ 15,000 → 9 stairs.
  const c = estimateStairLandings({ stories: 3, stairs: null, buildings: 1, footprintSf: 130463 });
  assert.equal(c.stairs, 9);
  // gurban and stacked flats ride the breezeway factor too.
  assert.equal(estimateStairLandings({ stories: 3, stairs: null, buildings: 1, footprintSf: 130463, buildingTypeKey: 'gurban' }).stairs, 26);
  assert.equal(estimateStairLandings({ stories: 3, stairs: null, buildings: 1, footprintSf: 130463, buildingTypeKey: 'stackedFlats' }).stairs, 26);
});

test('townhouse stairs are private — zero shared landings, still an answer', () => {
  const e = estimateStairLandings({ stories: 3, stairs: null, buildings: 8, footprintSf: 60000, buildingTypeKey: 'townHouses' });
  assert.equal(e.stairs, 0);
  assert.equal(e.landings, 0);
  assert.match(e.how, /private, inside each unit/);
  assert.equal(estimateStairLandings({ stories: 2, stairs: null, buildingTypeKey: 'singleFamily' }).landings, 0);
});

test('the building type only matters when the stair count is estimated — a drawn count wins untouched', () => {
  const e = estimateStairLandings({ stories: 3, stairs: 4, buildingTypeKey: 'townHouses' });
  assert.equal(e.stairs, 4);
  assert.equal(e.landings, 22);                               // 4 × 5 = 20, +10%
});

test('no stair count on a single-story building: zero stairs, zero landings, still an answer', () => {
  const e = estimateStairLandings({ stories: 1, stairs: null, buildings: 4 });
  assert.equal(e.stairs, 0);
  assert.equal(e.landings, 0);
  assert.match(e.how, /single-story/);
});

test('a stated zero stair count is a real answer, not a missing one', () => {
  const e = estimateStairLandings({ stories: 3, stairs: 0 });
  assert.equal(e.stairsEstimated, false);
  assert.equal(e.landings, 0);
});

test('no story count: estimated from gross ÷ footprint', () => {
  const e = estimateStairLandings({ stories: null, stairs: 2, grossSf: 260000, footprintSf: 60000 });
  assert.equal(e.storiesEstimated, true);
  assert.equal(e.stories, 4);
  assert.equal(e.landings, 15);
  assert.match(e.how, /gross 260,000 SF ÷ footprint 60,000 SF = 4/);
});

test('nothing to go on → null, so the field is asked for (never guessed from nothing)', () => {
  assert.equal(estimateStairLandings({ stories: null, stairs: 2 }), null);
  assert.equal(estimateStairLandings({}), null);
  assert.equal(estimateStairLandings(null), null);
  // gross smaller than footprint is a misread, not a story count
  assert.equal(estimateStairLandings({ grossSf: 10000, footprintSf: 60000, stairs: 2 }), null);
});

test('the contingency is configurable and zero means none', () => {
  const e = estimateStairLandings({ stories: 4, stairs: 2 }, { estimation: { landingsContingency: 0 } });
  assert.equal(e.landings, 14);
  assert.ok(!/\+ 0%/.test(e.how));
});
