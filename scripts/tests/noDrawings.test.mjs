/**
 * The no-drawings conceptual budget (Mike, 2026-09-11): "someone without any
 * drawings can do a conceptual budget ... we need to figure out which ones
 * are actually required and which ones can be guessed."
 *
 * Required: project type, total units, and total building SF OR an average
 * unit size. Everything else is estimated — flagged, and only when the
 * visitor said "no drawings" (a drawing-backed takeoff never guesses).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeQuantities } from '../../src/lib/intake/quantities.js';
import { noDrawingsReady, validateAnswers, NO_DRAWINGS_KEY } from '../../src/lib/intake/questionnaire.js';
import { computeIntakeEstimate } from '../../src/lib/intake/estimate.js';
import { calculateBudget } from '../../src/lib/calculations.js';

const GARDEN = 'Garden (3 Levels)';
const PODIUM = 'Podium (3-8 Levels)';

const rows = answers => {
  const out = {};
  for (const r of computeQuantities(null, { noDrawings: 'yes', ...answers })) out[r.key] = r;
  return out;
};

test('noDrawingsReady lists every missing required figure', () => {
  const r = noDrawingsReady({});
  assert.equal(r.ready, false);
  assert.deepEqual(r.missing, [
    'Project type', 'Total units', 'Total building SF or average unit size', 'Stories', 'Surface parking stalls', 'Exterior amenity SF (0 if none)',
  ]);
});

// Stories and surface stalls are required too (Mike, 2026-09-12).
const EASY = { figureStories: '3', figureSurfaceParking: '300', figureExteriorAmenitySf: '5000' };

test('noDrawingsReady rejects a project type that is not one of the options', () => {
  const r = noDrawingsReady({ projectType: 'Castle', figureTotalUnits: '200', figureGrossSf: '250000', ...EASY });
  assert.deepEqual(r.missing, ['Project type']);
});

test('ready with total building SF, or with an average unit size instead', () => {
  assert.equal(noDrawingsReady({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250,000', ...EASY }).ready, true);
  assert.equal(noDrawingsReady({ projectType: GARDEN, figureTotalUnits: '200', figureAvgUnitSf: '950', ...EASY }).ready, true);
  assert.equal(noDrawingsReady({ projectType: GARDEN, figureTotalUnits: '0', figureAvgUnitSf: '950', ...EASY }).ready, false);
});

test('stories and surface stalls are required; 0 stalls is a real answer, 0 stories is not', () => {
  const base = { projectType: PODIUM, figureTotalUnits: '300', figureGrossSf: '400000', figureExteriorAmenitySf: '0' };
  assert.deepEqual(noDrawingsReady({ ...base, figureSurfaceParking: '20' }).missing, ['Stories']);
  assert.deepEqual(noDrawingsReady({ ...base, figureStories: '5' }).missing, ['Surface parking stalls']);
  assert.equal(noDrawingsReady({ ...base, figureStories: '5', figureSurfaceParking: '0' }).ready, true);
  assert.equal(noDrawingsReady({ ...base, figureStories: '0', figureSurfaceParking: '0' }).ready, false);
  assert.equal(noDrawingsReady({ ...base, figureStories: '5', figureSurfaceParking: 'lots' }).ready, false);
});

test('a typed 0 surface stalls survives validation and is used, not guessed over', () => {
  const kept = validateAnswers({ noDrawings: 'yes', figureSurfaceParking: '0', figureStories: '0' });
  const byKey = Object.fromEntries(kept.map(a => [a.questionKey, a.answer]));
  assert.equal(byKey.figureSurfaceParking, '0');
  assert.ok(!('figureStories' in byKey), '0 stories is dropped');
  const q = rows({ projectType: GARDEN, figureTotalUnits: '200', figureAvgUnitSf: '950', figureStories: '3', figureSurfaceParking: '0' });
  assert.equal(q.surfaceParking.value, 0);
  assert.equal(q.surfaceParking.source, 'questionnaire');
});

test('validateAnswers keeps the no-drawings marker and the new figure keys, and drops junk', () => {
  const kept = validateAnswers({ noDrawings: 'yes', figureAvgUnitSf: '950', figureCorridorSf: '12000', figureBuildings: '4' });
  const keys = kept.map(a => a.questionKey);
  assert.ok(keys.includes(NO_DRAWINGS_KEY));
  for (const k of ['figureAvgUnitSf', 'figureCorridorSf', 'figureBuildings']) assert.ok(keys.includes(k), k);
  const junk = validateAnswers({ noDrawings: 'maybe' }).map(a => a.questionKey);
  assert.ok(!junk.includes(NO_DRAWINGS_KEY));
});

test('a typed-in garden job: typed figures settled, blanks estimated and flagged', () => {
  const q = rows({ projectType: GARDEN, figureTotalUnits: '200', figureAvgUnitSf: '950' });
  assert.equal(q.totalUnits.value, 200);
  assert.equal(q.totalUnits.source, 'questionnaire');
  assert.equal(q.unitsSf.value, 190000);
  assert.equal(q.grossSf.value, Math.round(190000 * 1.25));
  assert.equal(q.grossSf.source, 'derived');
  assert.equal(q.stories.value, 3);
  assert.match(q.stories.flag, /no drawings/);
  assert.ok(q.stairLandings.value > 0, 'landings estimated');
  assert.equal(q.surfaceParking.value, 300, '200 units × 1.5');
  assert.equal(q.surfaceParking.source, 'derived');
  assert.equal(q.corridorSf.value ?? 0, 0, 'garden walk-ups have open breezeways, no corridors');
  assert.equal(q.interiorAmenitySf.value, 3800, '200 units × 19 SF');
  assert.equal(q.balconies.value, 200);
});

test('a podium job estimates corridors at 12% of gross and parks in its garage', () => {
  const q = rows({ projectType: PODIUM, figureTotalUnits: '300', figureGrossSf: '400000' });
  assert.equal(q.corridorSf.value, 48000);
  assert.match(q.corridorSf.flag, /no drawings/);
  assert.equal(q.stories.value, 5);
  assert.equal(q.unitsSf.value, 320000, 'gross ÷ 1.25');
});

test('typed figures always beat the guesses', () => {
  const q = rows({
    projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000',
    figureStories: '4', figureSurfaceParking: '222', figureCorridorSf: '9000',
    figureInteriorAmenitySf: '6500', figureBalconies: '150',
  });
  assert.equal(q.stories.value, 4);
  assert.equal(q.surfaceParking.value, 222);
  assert.equal(q.corridorSf.value, 9000);
  assert.equal(q.interiorAmenitySf.value, 6500);
  assert.equal(q.balconies.value, 150);
  for (const k of ['stories', 'surfaceParking', 'corridorSf', 'interiorAmenitySf', 'balconies']) {
    assert.equal(q[k].source, 'questionnaire', k);
  }
});

test('no balconies guessed when the visitor picked no balcony lighting', () => {
  const q = rows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000', balconyLighting: 'None' });
  assert.notEqual(q.balconies.value, 200);
});

test('back of house is estimated as the type\'s typical share of the building, and flagged', () => {
  // 250,000 SF garden: units 200,000 (÷1.25), no corridors, 3,800 amenity →
  // 46,200 left over; gardens run ~1% back of house (real budgets 0.7–0.9%).
  const q = rows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000' });
  assert.equal(q.bohSf.value, 2500);
  assert.equal(q.bohSf.source, 'derived');
  assert.match(q.bohSf.flag, /no drawings/);
  assert.match(q.bohSf.how, /1% of the 250,000 SF building/);
  // From the average unit size too: 200 × 950 = 190,000, × 1.25 = 237,500.
  const a = rows({ projectType: GARDEN, figureTotalUnits: '200', figureAvgUnitSf: '950' });
  assert.equal(a.bohSf.value, Math.round(237500 * 0.01));
  // A podium runs 2.5%, a high-rise 3.5% — still under the 5% cap.
  const p = rows({ projectType: PODIUM, figureTotalUnits: '300', figureGrossSf: '400000' });
  assert.equal(p.bohSf.value, 10000);
});

test('a typed back-of-house figure beats the estimate', () => {
  const q = rows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000', figureBohSf: '8,000' });
  assert.equal(q.bohSf.value, 8000);
  assert.equal(q.bohSf.source, 'questionnaire');
  assert.ok(validateAnswers({ figureBohSf: '8000' }).some(a => a.questionKey === 'figureBohSf'));
});

// ── Calibrated guesses (2026-09-12, ten real ILC budgets) ────────────────────
const TOWN = 'Town Houses (2-3 Levels)';

// Mike 2026-09-24: with no bath count and no bedroom mix, an apartment is one
// bath (the old 1.4 calibration is gone); townhomes keep 2.5 per home.
test('vanities with no bath count: 1 per apartment, 2.5 per townhome', () => {
  const g = rows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000' });
  assert.equal(g.bathrooms.value, 200);
  assert.equal(g.vanities.value, 200);
  const t = rows({ projectType: TOWN, figureTotalUnits: '64', figureAvgUnitSf: '1800' });
  assert.equal(t.vanities.value, 160);
  assert.match(t.vanities.flag, /no drawings/);
});

test('garage and outdoor amenity SF are guessed per unit by building type', () => {
  const p = rows({ projectType: PODIUM, figureTotalUnits: '300', figureGrossSf: '400000' });
  assert.equal(p.garageSf.value, 171000, '300 × 570');
  assert.equal(p.exteriorAmenitySf.value, 6000, '300 × 20');
  const g = rows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000' });
  assert.equal(g.garageSf.value, 0, 'walk-ups have no parking structure');
  assert.equal(g.exteriorAmenitySf.value, 5000, '200 × 25');
});

test('the clubhouse answer decides the interior amenity on a typed-in budget', () => {
  const base = { projectType: TOWN, figureTotalUnits: '64', figureAvgUnitSf: '1800' };
  assert.equal(rows(base).interiorAmenitySf.value, 0, 'townhomes assume none unless told');
  const yes = rows({ ...base, hasClubhouse: 'yes' }).interiorAmenitySf;
  assert.equal(yes.value, 4000);
  assert.match(yes.flag, /no drawings/);
  const no = rows({ ...base, hasClubhouse: 'no' }).interiorAmenitySf;
  assert.equal(no.value, 0);
  assert.equal(no.source, 'questionnaire');
  assert.equal(no.flag, null);
  // Apartments: "no" zeroes the per-unit share; "yes" keeps it.
  const g = { projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000' };
  assert.equal(rows({ ...g, hasClubhouse: 'no' }).interiorAmenitySf.value, 0);
  assert.equal(rows({ ...g, hasClubhouse: 'yes' }).interiorAmenitySf.value, 3800);
  // A typed SF still beats the answer.
  assert.equal(rows({ ...base, hasClubhouse: 'yes', figureInteriorAmenitySf: '2500' }).interiorAmenitySf.value, 2500);
});

test('validateAnswers keeps only yes/no for the clubhouse question', () => {
  const keyed = a => validateAnswers(a).find(r => r.questionKey === 'hasClubhouse');
  assert.equal(keyed({ hasClubhouse: 'yes' }).answer, 'yes');
  assert.equal(keyed({ hasClubhouse: 'no' }).answer, 'no');
  assert.equal(keyed({ hasClubhouse: 'maybe' }), undefined);
  assert.equal(keyed({}), undefined);
});

test('townhome drive-lane lights: half a light per home, less the parking lot\'s own poles', () => {
  const base = { projectType: TOWN, figureTotalUnits: '64', figureAvgUnitSf: '1800' };
  const none = rows({ ...base, figureSurfaceParking: '0' }).driveLaneLights;
  assert.equal(none.value, 32);
  assert.match(none.flag, /no drawings/);
  assert.equal(rows({ ...base, figureSurfaceParking: '90' }).driveLaneLights.value, 22, '32 − 90 ÷ 9');
  assert.equal(rows({ ...base, figureSurfaceParking: '400' }).driveLaneLights.value, 0, 'never below zero');
  assert.equal(rows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000' }).driveLaneLights, undefined);
});

test('single-family neighborhoods get drive-lane lights too (Mike 2026-09-12)', () => {
  const r = rows({ projectType: 'Single Family (1-2 Levels)', figureTotalUnits: '80', figureAvgUnitSf: '2200', figureSurfaceParking: '0' });
  assert.equal(r.driveLaneLights.value, 40, '80 homes × 0.5');
});

test('one typed area-light count replaces lot poles + drive lanes together', () => {
  const pd = { numUnits: 64, grossSf: 115200, unitsSf: 115200, numSurfaceParking: 90, buildingTypeKey: 'townHouses' };
  const typed = calculateBudget(pd, { exterior: { driveLaneLightsQty: 22, areaLightsQty: '15' } }).sections.exterior.parking;
  assert.equal(typed.fixtures, 15);
  assert.equal(typed.qtyOverridden, true);
  const cleared = calculateBudget(pd, { exterior: { driveLaneLightsQty: 22, areaLightsQty: 'auto' } }).sections.exterior.parking;
  assert.equal(cleared.fixtures, 32, "'auto' goes back to 10 lot poles + 22 drive-lane");
  assert.equal(cleared.qtyOverridden, false);
});

test('the engine adds drive-lane lights to the parking fixture count', () => {
  const pd = { numUnits: 64, grossSf: 115200, unitsSf: 115200, numSurfaceParking: 90, buildingTypeKey: 'townHouses' };
  const without = calculateBudget(pd, {}).sections.exterior.parking;
  const withLane = calculateBudget(pd, { exterior: { driveLaneLightsQty: 22 } }).sections.exterior.parking;
  assert.equal(without.fixtures, 10);
  assert.equal(withLane.fixtures, 32);
  assert.equal(withLane.driveLaneLights, 22);
  assert.ok(withLane.product > without.product);
});

test('a typed-in estimate carries a ±10% "likely between" range; a drawing-read one does not', () => {
  const answers = {
    noDrawings: 'yes', projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000',
    figureStories: '3', figureSurfaceParking: '300', figureExteriorAmenitySf: '5000',
  };
  const { budget, range } = computeIntakeEstimate({ answers });
  const total = budget.totalWithControls;
  assert.ok(range.low <= total * 0.9 && range.low > total * 0.9 - 1000);
  assert.ok(range.high >= total * 1.1 && range.high < total * 1.1 + 1000);
  assert.equal(range.low % 1000, 0);
  assert.equal(range.pct, 0.1);
  assert.equal(computeIntakeEstimate({ answers: { ...answers, noDrawings: undefined } }).range, undefined);
});

test('without the no-drawings marker nothing is guessed', () => {
  const out = {};
  for (const r of computeQuantities(null, { projectType: GARDEN, figureTotalUnits: '200', figureAvgUnitSf: '950' })) out[r.key] = r;
  assert.equal(out.stories.value, null);
  assert.equal(out.interiorAmenitySf.value, null);
  assert.notEqual(out.surfaceParking.source, 'derived');
});
