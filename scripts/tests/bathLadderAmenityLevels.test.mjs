/**
 * Mike 2026-09-24: bathrooms come from the drawings → the typed count →
 * the bedroom rule (studio/1/2-bed = 1 bath, 3/4-bed = 2) → 1 per unit.
 * And the amenity SF is summed from the area-by-level table when the
 * drawings print one (Modera Town Lake: interior 13,876, deck 8,918).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeQuantities } from '../../src/lib/intake/quantities.js';
import { bathsFromBedrooms } from '../../src/lib/unitRules.js';

const byKey = (qs) => Object.fromEntries(qs.map(q => [q.key, q]));
const drawings = (unitTypes, totals = {}) => ({
  sources: ['a.pdf'], unitTypes,
  projectTotals: { grossInteriorSf: 300000, statedTotalUnits: unitTypes.reduce((s, u) => s + u.qty, 0), buildingType: 'podium', ...totals },
  siteData: {},
});

test('bathsFromBedrooms: studio/1/2 = 1, 3/4 = 2, unknown = 1', () => {
  assert.deepEqual([0, 1, 2, 3, 4, null, 'x'].map(bathsFromBedrooms), [1, 1, 1, 2, 2, 1, 1]);
});

test('stated bathrooms on the drawings always win', () => {
  const q = byKey(computeQuantities(drawings([
    { code: 'B2', qty: 10, bedrooms: 2, bathrooms: 2 },
  ]), []));
  assert.equal(q.bathrooms.value, 20);
  assert.equal(q.bathrooms.source, 'drawing');
  assert.equal(q.vanities.value, 20);
});

test('no bath column → bedroom rule, flagged ESTIMATED', () => {
  const q = byKey(computeQuantities(drawings([
    { code: 'A1', qty: 10, bedrooms: 1 },
    { code: 'B2', qty: 10, bedrooms: 2 },
    { code: 'C3', qty: 5, bedrooms: 3 },
  ]), []));
  assert.equal(q.bathrooms.value, 10 + 10 + 10);
  assert.equal(q.bathrooms.source, 'derived');
  assert.match(q.bathrooms.flag, /ESTIMATED/);
  assert.equal(q.vanities.value, 30);
});

test('no baths and no bedrooms → 1 bath per unit', () => {
  const q = byKey(computeQuantities(drawings([{ code: 'X', qty: 40 }]), []));
  assert.equal(q.bathrooms.value, 40);
  assert.equal(q.vanities.value, 40);
});

test('amenity SF sums the area-by-level table', () => {
  const q = byKey(computeQuantities(drawings([{ code: 'A1', qty: 100, bedrooms: 1, bathrooms: 1 }], {
    amenityLevels: [
      { level: 'L1', interiorSf: 4354, exteriorSf: null },
      { level: 'L2', interiorSf: 3177, exteriorSf: null },
      { level: 'L5', interiorSf: 6345, exteriorSf: 4540 },
      { level: 'L6', interiorSf: null, exteriorSf: 4378 },
    ],
  }), []));
  assert.equal(q.interiorAmenitySf.value, 13876);
  assert.equal(q.exteriorAmenitySf.value, 8918);
});
