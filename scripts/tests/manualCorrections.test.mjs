/**
 * Mike's 2026-09-15 bug list, pinned.
 *
 *   "It read units wrong on a project I just tested in the live app Lone Tree
 *    Ranch Test v1. It found 168 balconies but 108 units. Way off there."
 *   "# of units cant be off. it affects so much and also affected the # of
 *    corridor unit entry socnces"
 *   "We need to be able to manually update any field about the project we see
 *    off. None of that can be updated now."
 *   "Exterior amenity math ... I click a different $/sf and nothing changes."
 *
 * Three separate faults sat behind those sentences:
 *
 *  1. The unit matrix could cover only part of a project (rows merged away, a
 *     second building's matrix collapsed into the first), and every figure
 *     hanging off it came back short by the same fraction.
 *  2. A misread figure was uncorrectable, every ladder reads
 *     `stated ?? counted ?? typed`, so a typed number was ignored whenever the
 *     drawings had said anything at all.
 *  3. Exterior amenity SF of zero made the $/SF question price at $0 whatever
 *     rate was picked, so the control looked broken.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeQuantities, correctionKeyFor } from '../../src/lib/intake/quantities.js';
import { mergeProposals } from '../../src/lib/mergeProposals.js';

const byKey = (qs) => Object.fromEntries(qs.map(q => [q.key, q]));

/** A matrix that sums to 200 units, with a stated total that agrees. */
function drawings() {
  return {
    sources: ['a.pdf'],
    unitTypes: [
      { code: 'S1', qty: 20,  unitSf: 550,  bedrooms: 0, bathrooms: 1, balconies: 0, confidence: 0.95 },
      { code: 'A1', qty: 100, unitSf: 750,  bedrooms: 1, bathrooms: 1, balconies: 1, confidence: 0.95 },
      { code: 'B2', qty: 80,  unitSf: 1100, bedrooms: 2, bathrooms: 2, balconies: 1, confidence: 0.95 },
    ],
    projectTotals: {
      grossInteriorSf: 260000, grossSfLabel: 'BUILDING GROSS SF', grossSfNeedsReview: false,
      garageSf: 40000, corridorSf: 18000, statedTotalUnits: 200, buildingType: 'podium',
    },
    siteData: {
      lotSf: 400000, totalUnits: 200, surfaceParking: 120, garages: 30, carports: 24,
      stories: 4, egressStairwells: 2, exitDoors: 6, buildingFootprintSf: 60000, confidence: 0.9,
    },
    conflicts: [], overallConfidence: 0.9,
  };
}

const q = (answers = {}) => byKey(computeQuantities(drawings(), answers));

// ── The correction rung ─────────────────────────────────────────────────────

test('the key is built from the row key, so every row is correctable', () => {
  assert.equal(correctionKeyFor('totalUnits'), 'correctTotalUnits');
  assert.equal(correctionKeyFor('bohSf'), 'correctBohSf');
});

test('a correction outranks a figure written on the drawings', () => {
  // 200 units are stated on the document AND summed by the matrix. Before this
  // there was no way to say otherwise.
  const r = q({ correctTotalUnits: '324' });
  assert.equal(r.totalUnits.value, 324);
  assert.equal(r.totalUnits.source, 'questionnaire');
  assert.equal(r.totalUnits.corrected, true);
  assert.equal(r.totalUnits.wasValue, 200);
  assert.match(r.totalUnits.how, /Corrected by you/);
});

test('correcting the unit count carries the per-unit columns with it', () => {
  // This is the whole point of the escalation: a unit count that moves and
  // leaves bedrooms behind is still wrong, just wrong in a new place.
  const base = q();
  const r    = q({ correctTotalUnits: '400' });
  const f    = 400 / 200;
  assert.equal(r.bedrooms.value,  Math.round(base.bedrooms.value  * f));
  assert.equal(r.bathrooms.value, Math.round(base.bathrooms.value * f));
  assert.equal(r.vanities.value,  Math.round(base.vanities.value  * f));
  assert.equal(r.balconies.value, Math.round(base.balconies.value * f));
  assert.equal(r.unitsSf.value,   Math.round(base.unitsSf.value   * f));
});

test('a corrected row drops its flag but keeps what we read', () => {
  const d = drawings();
  d.projectTotals.statedTotalUnits = 264;   // disagrees with the matrix → flagged
  const flagged = byKey(computeQuantities(d, {}));
  assert.ok(flagged.totalUnits.flag, 'precondition: the disagreement is flagged');

  const fixed = byKey(computeQuantities(d, { correctTotalUnits: '264' }));
  assert.equal(fixed.totalUnits.flag, null, 'the human answered the question the flag asked');
  assert.equal(fixed.totalUnits.value, 264);
});

test('a correction of 0 is a real answer, not a blank', () => {
  // "There is no exterior amenity area" has to be sayable.
  const r = q({ correctExteriorAmenitySf: '0' });
  assert.equal(r.exteriorAmenitySf.value, 0);
  assert.equal(r.exteriorAmenitySf.source, 'questionnaire');
});

test('commas and stray spaces are read, nonsense and negatives are ignored', () => {
  assert.equal(q({ correctTotalUnits: ' 1,250 ' }).totalUnits.value, 1250);
  assert.equal(q({ correctTotalUnits: 'lots' }).totalUnits.value, 200);
  assert.equal(q({ correctTotalUnits: '-5' }).totalUnits.value, 200);
  assert.equal(q({ correctTotalUnits: '' }).totalUnits.value, 200);
});

test('corrections reach square footages and counts alike', () => {
  const r = q({ correctBohSf: '24000', correctSurfaceParking: '86', correctGrossSf: '310000' });
  assert.equal(r.bohSf.value, 24000);
  assert.equal(r.surfaceParking.value, 86);
  assert.equal(r.grossSf.value, 310000);
  for (const row of [r.bohSf, r.surfaceParking, r.grossSf]) {
    assert.equal(row.source, 'questionnaire');
    assert.equal(row.corrected, true);
  }
});

// ── Exterior amenity: the dead $/SF control ─────────────────────────────────

test('no exterior amenity area says so, instead of pricing at $0 in silence', () => {
  const d = drawings();                     // siteData has no amenitySf
  const row = byKey(computeQuantities(d, {})).exteriorAmenitySf;
  assert.ok(!(row.value > 0), 'precondition: nothing was read');
  assert.match(row.flag, /cannot change the budget/);
  assert.match(row.flag, /\$0/);
});

test('once an amenity area exists the flag goes away', () => {
  const d = drawings();
  d.siteData.amenitySf = 12000;
  const row = byKey(computeQuantities(d, {})).exteriorAmenitySf;
  assert.equal(row.value, 12000);
  assert.ok(!row.flag || !/cannot change the budget/.test(row.flag));
});

// ── The undercount at its source: the merge ─────────────────────────────────

test('a unit row whose type code did not come through is no longer deleted', () => {
  // A blank code used to drop the row outright, taking its units with it, one
  // of the ways a matrix ends up covering less than the whole project.
  const merged = mergeProposals([
    { fileName: 'bldg-a.pdf', proposal: { unitTypes: [
      { code: 'A1', qty: 40, unitSf: 750, confidence: 0.9 },
      { code: '',   qty: 25, unitSf: 900, confidence: 0.9 },
      { code: null, qty: 18, unitSf: 1100, confidence: 0.9 },
    ] } },
  ]);
  const total = (merged.unitTypes || []).reduce((s, r) => s + Number(r.qty || 0), 0);
  assert.equal(total, 83, 'every unit read survives the merge');
});

test('blank-code rows from different files never merge into each other', () => {
  const merged = mergeProposals([
    { fileName: 'bldg-a.pdf', proposal: { unitTypes: [{ code: '', qty: 25, unitSf: 900, confidence: 0.9 }] } },
    { fileName: 'bldg-b.pdf', proposal: { unitTypes: [{ code: '', qty: 30, unitSf: 950, confidence: 0.9 }] } },
  ]);
  const total = (merged.unitTypes || []).reduce((s, r) => s + Number(r.qty || 0), 0);
  assert.equal(total, 55, 'two buildings, two rows, not one overwriting the other');
});

// ── A correction has to reach the figures computed FROM it ──────────────────
//
// Found 2026-09-15 by driving /api/intake/estimate directly rather than
// trusting the tests above: a correction landed on the ROW while every local
// variable captured before add() still held the misread number. Correcting the
// building total to 610,000 left back of house being taken off 260,000 and
// reported as uncomputable. The row said one thing; the money used another.
//
// add() now returns the figure it settled on, and callers that feed a later
// calculation use that return value.

test('back of house is taken off a CORRECTED building total, not the misread one', () => {
  const base = q();
  assert.equal(base.grossSf.value, 260000);
  assert.equal(base.bohSf.value, 13000, 'precondition: 5% of the gross we read');

  const r = q({ correctTotalUnits: '472', correctGrossSf: '610000' });
  assert.equal(r.grossSf.value, 610000);
  // 610,000 − 410,640 of units − 18,000 of corridors = 181,360, over the 5% cap.
  assert.equal(r.bohSf.value, Math.round(610000 * 0.05));
  assert.match(r.bohSf.how, /610,000/);
  assert.doesNotMatch(r.bohSf.how, /260,000/, 'the old total must not survive in the arithmetic');
});

test('correcting units alone says so plainly instead of inventing a remainder', () => {
  // Units up, building total left alone: the units now exceed the whole
  // building. There is no honest BOH number here, and the flag has to name the
  // contradiction rather than quietly pricing it at nothing.
  const r = q({ correctTotalUnits: '472' });
  assert.equal(r.bohSf.value, null);
  assert.match(r.bohSf.flag, /sum to MORE than the stated gross/);
});

test('a corrected unit SF is what the remainder is measured against', () => {
  // Chosen so the remainder lands UNDER the 5% cap, if the cap were doing the
  // work, this would pass whatever number the arithmetic used.
  const r = q({ correctUnitsSf: '230000' });
  assert.equal(r.unitsSf.value, 230000);
  assert.equal(r.bohSf.value, 260000 - 230000 - 18000);
});

test('a corrected exterior amenity area clears the dead-control flag', () => {
  const dead = /cannot change the budget/;
  assert.match(q().exteriorAmenitySf.flag, dead, 'precondition: nothing was read');

  const filled = q({ correctExteriorAmenitySf: '14000' });
  assert.equal(filled.exteriorAmenitySf.value, 14000);
  assert.ok(!dead.test(filled.exteriorAmenitySf.flag || ''),
    'the $/SF control works now, so the warning must go');

  // A deliberate zero means "there is none" (Mike 10-14), so no warning.
  assert.ok(!dead.test(q({ correctExteriorAmenitySf: '0' }).exteriorAmenitySf.flag || ''));
});

test('add() hands back the settled figure so callers cannot use a stale local', () => {
  // The structural guarantee behind the four tests above.
  const r = q({ correctCorridorSf: '31000' });
  assert.equal(r.corridorSf.value, 31000);
  assert.equal(r.bohSf.value, 260000 - 174000 - 31000 > Math.round(260000 * 0.05)
    ? Math.round(260000 * 0.05)
    : 260000 - 174000 - 31000);
  assert.match(r.bohSf.how, /31,000/);
});
