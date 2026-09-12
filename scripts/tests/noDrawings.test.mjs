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
  assert.deepEqual(r.missing, ['Project type', 'Total units', 'Total building SF or average unit size']);
});

test('noDrawingsReady rejects a project type that is not one of the options', () => {
  const r = noDrawingsReady({ projectType: 'Castle', figureTotalUnits: '200', figureGrossSf: '250000' });
  assert.deepEqual(r.missing, ['Project type']);
});

test('ready with total building SF, or with an average unit size instead', () => {
  assert.equal(noDrawingsReady({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250,000' }).ready, true);
  assert.equal(noDrawingsReady({ projectType: GARDEN, figureTotalUnits: '200', figureAvgUnitSf: '950' }).ready, true);
  assert.equal(noDrawingsReady({ projectType: GARDEN, figureTotalUnits: '0', figureAvgUnitSf: '950' }).ready, false);
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
  assert.equal(q.interiorAmenitySf.value, 4000, '200 units × 20 SF');
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

test('back of house is estimated from the building SF, capped at 5%, and flagged', () => {
  // 250,000 SF: units 200,000 (÷1.25), no corridors, 4,000 amenity → 46,000
  // left over, capped at 5% of the building.
  const q = rows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000' });
  assert.equal(q.bohSf.value, 12500);
  assert.equal(q.bohSf.source, 'derived');
  assert.match(q.bohSf.flag, /no drawings/);
  assert.match(q.bohSf.how, /5% of the 250,000 SF building/);
  // From the average unit size too: 200 × 950 = 190,000, × 1.25 = 237,500.
  const a = rows({ projectType: GARDEN, figureTotalUnits: '200', figureAvgUnitSf: '950' });
  assert.equal(a.bohSf.value, Math.round(237500 * 0.05));
});

test('a typed back-of-house figure beats the estimate', () => {
  const q = rows({ projectType: GARDEN, figureTotalUnits: '200', figureGrossSf: '250000', figureBohSf: '8,000' });
  assert.equal(q.bohSf.value, 8000);
  assert.equal(q.bohSf.source, 'questionnaire');
  assert.ok(validateAnswers({ figureBohSf: '8000' }).some(a => a.questionKey === 'figureBohSf'));
});

test('without the no-drawings marker nothing is guessed', () => {
  const out = {};
  for (const r of computeQuantities(null, { projectType: GARDEN, figureTotalUnits: '200', figureAvgUnitSf: '950' })) out[r.key] = r;
  assert.equal(out.stories.value, null);
  assert.equal(out.interiorAmenitySf.value, null);
  assert.notEqual(out.surfaceParking.source, 'derived');
});
