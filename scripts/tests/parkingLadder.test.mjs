/**
 * Mike's surface-parking ladder (2026-09-11): "it says number spaces you find
 * it and put it in. then do units times the minimum required number of spaces
 * ... and if those don't work then you count it."
 *
 * Written number → units × required rate → counted stalls, with a typed
 * questionnaire figure outranking every estimate but never a written number.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeQuantities } from '../../src/lib/intake/quantities.js';
import { validateSiteData, mergeSiteData } from '../../src/lib/siteVision.js';
import { SITE_NUMBER_KEYS } from '../../src/lib/intake/combineResult.js';

const parking = (siteData, answers = {}) => {
  const d = { sources: ['site.pdf'], unitTypes: [], projectTotals: null, siteData: { confidence: 0.9, ...siteData } };
  return computeQuantities(d, answers).find(q => q.key === 'surfaceParking');
};

test('a surface stall number written on the drawings wins over everything', () => {
  const r = parking({ totalUnits: 200, surfaceParking: 250, parkingRatioRequired: 1.5, surfaceParkingCounted: 190, buildingType: 'garden' },
    { figureSurfaceParking: '99' });
  assert.equal(r.value, 250);
  assert.equal(r.source, 'drawing');
  assert.equal(r.flag, null);
});

test('a typed figure outranks every estimate', () => {
  const r = parking({ totalUnits: 200, parkingProvided: 300, parkingRatioRequired: 1.5, surfaceParkingCounted: 190, buildingType: 'garden' },
    { figureSurfaceParking: '96' });
  assert.equal(r.value, 96);
  assert.equal(r.source, 'questionnaire');
});

test('a stated provided total, less garages and carports, is the next rung', () => {
  const r = parking({ totalUnits: 200, parkingProvided: 330, garages: 20, carports: 10, parkingRatioRequired: 1.5, buildingType: 'garden' });
  assert.equal(r.value, 300);
  assert.equal(r.source, 'derived', 'derived, so the ask card offers an override');
  assert.match(r.how, /330 stalls provided, less 30 garage and carport stalls/);
  assert.match(r.flag, /no surface \/ garage split/);
});

test('no stall number → units × the required rate, rounded up, less garages', () => {
  const r = parking({ totalUnits: 201, parkingRatioRequired: 1.5, garages: 20, buildingType: 'garden' });
  assert.equal(r.value, Math.ceil(201 * 1.5) - 20); // 302 − 20 = 282
  assert.equal(r.source, 'derived');
  assert.match(r.how, /201 units × 1\.5 required spaces per unit/);
  assert.match(r.flag, /code-required parking/);
});

test('a stated required total is used before the rate', () => {
  const r = parking({ totalUnits: 200, parkingRequired: 350, parkingRatioRequired: 1.5, buildingType: 'garden' });
  assert.equal(r.value, 350);
  assert.match(r.how, /350 stalls code requires/);
});

test('counting the stalls is the LAST rung', () => {
  const r = parking({ totalUnits: 200, surfaceParkingCounted: 180, buildingType: 'garden' });
  assert.equal(r.value, 180);
  assert.equal(r.source, 'drawing', 'a count is off the drawing — the ask card must not re-ask it');
  assert.match(r.flag, /Counted off the site plan/);
});

test('the rate beats the count, and a big gap between them is flagged', () => {
  const r = parking({ totalUnits: 200, parkingRatioRequired: 1.5, surfaceParkingCounted: 150, buildingType: 'garden' });
  assert.equal(r.value, 300);
  assert.match(r.flag, /about 150 striped stalls/);
  const close = parking({ totalUnits: 200, parkingRatioRequired: 1.5, surfaceParkingCounted: 290, buildingType: 'garden' });
  assert.doesNotMatch(close.flag, /striped stalls/, 'within 20% is not worth a flag');
});

test('structured-parking buildings skip the total-based rungs', () => {
  for (const buildingType of ['wrap', 'podium', 'midRise', 'highRise']) {
    const r = parking({ totalUnits: 200, parkingProvided: 300, parkingRatioRequired: 1.5, buildingType });
    assert.equal(r.value, null, `${buildingType}: a site total must not become surface stalls`);
    assert.match(r.how, /mostly in a garage/);
    assert.equal(parking({ totalUnits: 200, parkingRatioRequired: 1.5, surfaceParkingCounted: 40, buildingType }).value, 40,
      `${buildingType}: a counted surface lot still counts`);
  }
});

test('the building type answered on the questionnaire steers the ladder', () => {
  // The visitor corrected the drawing's guess: the answer wins.
  assert.equal(parking({ totalUnits: 200, parkingProvided: 300, buildingType: 'garden' },
    { projectType: 'Podium (3-8 Levels)' }).value, null);
  assert.equal(parking({ totalUnits: 200, parkingProvided: 300, buildingType: 'podium' },
    { projectType: 'Garden (3 Levels)' }).value, 300);
});

test('nothing usable → null, so the visitor is asked', () => {
  assert.equal(parking({ totalUnits: 200, buildingType: 'garden' }).value, null);
  // Garages swallowing the whole total is not an answer either.
  assert.equal(parking({ totalUnits: 10, parkingProvided: 10, garages: 10, buildingType: 'garden' }).value, null);
});

test('vision: an out-of-range rate warns, a normal one does not', () => {
  const warns = d => (validateSiteData({ confidence: 0.9, ...d }).warnings || []).map(w => w.field);
  assert.ok(warns({ parkingRatioRequired: 6 }).includes('parkingRatioRequired'));
  assert.ok(warns({ parkingRatioRequired: 0.1 }).includes('parkingRatioRequired'));
  assert.ok(!warns({ parkingRatioRequired: 1.5 }).includes('parkingRatioRequired'));
});

test('vision: a stated surface number disagreeing with the count warns, never rewrites', () => {
  const r = validateSiteData({ confidence: 0.9, surfaceParking: 300, surfaceParkingCounted: 260 });
  assert.ok(r.warnings.some(w => w.field === 'surfaceParking'));
  assert.equal(r.surfaceParking, 300);
  assert.equal(r.surfaceParkingCounted, 260);
});

test('the new fields survive a multi-sheet merge and count as a real read', () => {
  const merged = mergeSiteData({ totalUnits: 200, confidence: 0.9 }, { parkingRatioRequired: 1.5, surfaceParkingCounted: 180, confidence: 0.8 }, 2);
  assert.equal(merged.parkingRatioRequired, 1.5);
  assert.equal(merged.surfaceParkingCounted, 180);
  assert.ok(SITE_NUMBER_KEYS.includes('parkingRatioRequired'));
  assert.ok(SITE_NUMBER_KEYS.includes('surfaceParkingCounted'));
});

/**
 * Mike, 2026-09-15: "It is not grabbing the number of parking stalls even if
 * it reads that in the drawings it seems."
 *
 * Structured-parking types (wrap / podium / mid-rise / high-rise) skipped BOTH
 * total-based rungs outright, so a set that plainly stated its stall count
 * produced no surface figure at all and the site-lighting line came in at
 * zero. A stated total IS usable on those buildings — but only once the
 * covered stalls are known, since that is the only way to tell how many of
 * them are out in the open.
 */
test('a structured-parking job uses its stated total once the covered stalls are known', () => {
  const r = parking({ totalUnits: 300, parkingProvided: 420, garages: 260, carports: 20, buildingType: 'podium' });
  assert.equal(r.value, 140, '420 provided, less the 280 in the garage and carports');
  assert.equal(r.source, 'derived');
  assert.match(r.flag, /parks mostly in a garage/, 'says out loud what it assumed');
  assert.match(r.flag, /confirm the split/);
});

test('a structured-parking job with no covered count still refuses to guess', () => {
  // Nothing is known about the garage, so the total says nothing about how
  // many stalls are open-air. Asking beats inventing a number.
  const r = parking({ totalUnits: 300, parkingProvided: 420, buildingType: 'podium' });
  assert.equal(r.value, null);
  assert.match(r.how, /how many are surface stalls\?/);
});

test('a written surface number still beats the new rung', () => {
  const r = parking({ totalUnits: 300, parkingProvided: 420, surfaceParking: 95, garages: 260, buildingType: 'podium' });
  assert.equal(r.value, 95);
  assert.equal(r.source, 'drawing');
});

test('a typed correction overrules a stall count written on the site plan', () => {
  // The last rung of all: the drawings said 250 in writing and a person who
  // looked at the plans says otherwise.
  const r = parking({ totalUnits: 200, surfaceParking: 250, buildingType: 'garden' }, { correctSurfaceParking: '188' });
  assert.equal(r.value, 188);
  assert.equal(r.source, 'questionnaire');
  assert.equal(r.corrected, true);
  assert.equal(r.wasValue, 250);
});
