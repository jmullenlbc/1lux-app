/**
 * The quantity takeoff — every count and SF derived from drawings + answers.
 *
 * The input is rawPayload.drawings from an unauthenticated browser, so half
 * of these tests are about hostile shapes never throwing; the other half pin
 * the derivation rules (landings = stairs × (2N−1), fans by answer, BOH as
 * remainder) so a refactor can't silently bend the arithmetic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeQuantities, quantityFlags, answersToMap } from '../../src/lib/intake/quantities.js';
import { computeReviewFlags } from '../../src/lib/intake/reviewFlags.js';
import { mergeProposals } from '../../src/lib/mergeProposals.js';

const byKey = (qs) => Object.fromEntries(qs.map(q => [q.key, q]));

/** A clean, fully-populated read — the happy path everything else varies. */
function cleanDrawings() {
  return {
    sources: ['a.pdf'],
    unitTypes: [
      { code: 'S1',  qty: 20, unitSf: 550,  bedrooms: 0, bathrooms: 1, balconies: 0, confidence: 0.95 },
      { code: 'A1',  qty: 100, unitSf: 750, bedrooms: 1, bathrooms: 1, balconies: 1, confidence: 0.95 },
      { code: 'B2',  qty: 80, unitSf: 1100, bedrooms: 2, bathrooms: 2, balconies: 1, confidence: 0.95 },
    ],
    projectTotals: {
      grossInteriorSf: 260000, grossSfLabel: 'BUILDING GROSS SF', grossSfNeedsReview: false,
      garageSf: 40000, corridorSf: 18000, statedTotalUnits: 200, buildingType: 'podium',
    },
    siteData: {
      lotSf: 400000, totalUnits: 200, surfaceParking: 120, parkingProvided: 300,
      garages: 30, carports: 24, clubhouseSf: 5000, amenitySf: 12000,
      stories: 4, egressStairwells: 2, exitDoors: 6, buildingFootprintSf: 60000,
      confidence: 0.9,
    },
    conflicts: [],
    overallConfidence: 0.9,
  };
}

test('clean matrix: units, bedrooms, bathrooms, vanities, balconies, unit SF all sum correctly', () => {
  const q = byKey(computeQuantities(cleanDrawings(), { ceilingFans: 'All bedrooms' }));
  assert.equal(q.totalUnits.value, 200);
  assert.equal(q.totalUnits.source, 'drawing');
  assert.equal(q.bedrooms.value, 100 * 1 + 80 * 2);          // 260
  assert.equal(q.bathrooms.value, 20 + 100 + 160);           // 280
  assert.equal(q.vanities.value, 280);
  assert.equal(q.vanities.source, 'derived');
  assert.equal(q.balconies.value, 100 + 80);                 // 180
  assert.equal(q.unitsSf.value, 20 * 550 + 100 * 750 + 80 * 1100); // 174,000
  assert.equal(q.totalUnits.flag, null);
});

test('ceiling fans follow the questionnaire answer', () => {
  const d = cleanDrawings();
  assert.equal(byKey(computeQuantities(d, { ceilingFans: 'None' })).ceilingFans.value, 0);
  assert.equal(byKey(computeQuantities(d, { ceilingFans: 'All bedrooms' })).ceilingFans.value, 260);
  // Master bed only: one per unit with ≥1 bedroom — the 20 studios drop out.
  assert.equal(byKey(computeQuantities(d, { ceilingFans: 'Master bed only' })).ceilingFans.value, 180);
  assert.equal(byKey(computeQuantities(d, { ceilingFans: 'Bedrooms and living room' })).ceilingFans.value, 260 + 200);
  assert.equal(byKey(computeQuantities(d, { ceilingFans: 'Living room only' })).ceilingFans.value, 200);
  // No answer at all defaults to none requested.
  assert.equal(byKey(computeQuantities(d, null)).ceilingFans.value, 0);
});

test('stair landings = stairs × (2 × stories − 1)', () => {
  const q = byKey(computeQuantities(cleanDrawings(), {}));
  assert.equal(q.stairLandings.value, 2 * (2 * 4 - 1));      // 14
  assert.equal(q.stairLandings.source, 'derived');
  assert.match(q.stairLandings.how, /2 × 4 stories/);
});

test('landings are null (never guessed) when stories or stairs are unstated', () => {
  const d = cleanDrawings();
  d.siteData.stories = null;
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.stairLandings.value, null);
  assert.match(q.stairLandings.how, /stairs × \(2 × stories − 1\)/);
});

test('BOH is the remainder of the stated gross, and shows its arithmetic', () => {
  const q = byKey(computeQuantities(cleanDrawings(), {}));
  // 260,000 − 174,000 units − 18,000 corridors − 5,000 interior amenity
  assert.equal(q.bohSf.value, 63000);
  assert.equal(q.bohSf.source, 'derived');
  assert.match(q.bohSf.how, /260,000/);
});

test('a negative BOH remainder becomes an alert, not a negative number', () => {
  const d = cleanDrawings();
  d.projectTotals.grossInteriorSf = 150000;  // less than the 174,000 of units alone
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.bohSf.value, null);
  assert.match(q.bohSf.flag, /MORE than the stated gross/);
});

test('partial bathroom coverage is flagged as an undercount', () => {
  const d = cleanDrawings();
  d.unitTypes[2].bathrooms = null;   // 80 of 200 units missing the column
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.bathrooms.value, 20 + 100);
  assert.match(q.bathrooms.flag, /120 of 200 units/);
  assert.match(q.vanities.flag, /120 of 200/);
});

test('matrix balconies vs "No balconies" answer raises a conflict flag', () => {
  const q = byKey(computeQuantities(cleanDrawings(), { balconyLighting: 'No balconies' }));
  assert.equal(q.balconies.value, 180);
  assert.match(q.balconies.flag, /questionnaire says there are no balconies/);
});

test('"No balconies" with no matrix column settles balconies at zero', () => {
  const d = cleanDrawings();
  for (const r of d.unitTypes) r.balconies = null;
  const q = byKey(computeQuantities(d, { balconyLighting: 'No balconies' }));
  assert.equal(q.balconies.value, 0);
  assert.equal(q.balconies.source, 'questionnaire');
});

test('stated-total-vs-row-sum disagreement is flagged on the unit count', () => {
  const d = cleanDrawings();
  d.projectTotals.statedTotalUnits = 264;
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.totalUnits.value, 200);
  assert.match(q.totalUnits.flag, /264/);
});

test('site-only path: units and bedrooms come from the site plan bed mix', () => {
  const d = {
    sources: ['site.pdf'],
    unitTypes: [],
    projectTotals: null,
    siteData: {
      totalUnits: 324, bedMix: { studio: 20, oneBed: 186, twoBed: 118, threeBed: 0 },
      lotAcres: 16.5, surfaceParking: 680, stories: 3, egressStairwells: null,
      confidence: 0.8,
    },
  };
  const q = byKey(computeQuantities(d, { ceilingFans: 'Master bed only' }));
  assert.equal(q.totalUnits.value, 324);
  assert.equal(q.bedrooms.value, 186 + 236);                 // 422
  assert.equal(q.ceilingFans.value, 186 + 118);              // units with ≥1 bed
  // Acre conversion happens in code and is flagged for the hand-lettering risk.
  assert.equal(q.lotSf.value, Math.round(16.5 * 43560));
  assert.match(q.lotSf.flag, /Hand-lettered/);
});

test('quantityFlags collects per-row flags and rolls up the not-found list', () => {
  const d = cleanDrawings();
  d.siteData.stories = null;                                  // landings unfindable
  d.projectTotals.statedTotalUnits = 300;                     // unit mismatch
  const flags = quantityFlags(computeQuantities(d, {}));
  assert.ok(flags.some(f => f.includes('# Units')));
  assert.ok(flags.some(f => f.startsWith('Not found in the drawings') && f.includes('# Stair Landings')));
});

test('hostile shapes never throw and yield nulls, not zeros', () => {
  for (const evil of [
    null,
    {},
    { unitTypes: 'hax', siteData: 'x', projectTotals: 7, conflicts: { a: 1 } },
    { unitTypes: [null, 'x', { qty: 'NaN' }], siteData: { totalUnits: {} }, projectTotals: { grossInteriorSf: -5 } },
  ]) {
    const qs = computeQuantities(evil, { ceilingFans: ['not', 'a', 'string'] });
    assert.ok(Array.isArray(qs) && qs.length > 5);
    const q = byKey(qs);
    assert.equal(q.totalUnits.value, null);
    assert.equal(q.grossSf.value, null);
  }
  assert.deepEqual(answersToMap('garbage'), {});
});

test('reviewFlags counts matrix units off the qty column (regression: it summed a nonexistent count field)', () => {
  const flags = computeReviewFlags({
    sources: ['a.pdf'],
    unitTypes: [{ code: 'A1', qty: 100 }, { code: 'B2', qty: 100 }],
    siteData: { totalUnits: 150, confidence: 0.9 },
    overallConfidence: 0.9,
  });
  // 200 vs 150 is >10% apart — the flag only fires if qty was actually summed.
  assert.ok(flags.some(f => f.includes('200') && f.includes('150')));
});

test('mergeProposals carries the new stated site fields and the bed mix through a multi-file merge', () => {
  const merged = mergeProposals([
    { fileName: 'site.pdf', proposal: { unitTypes: [], siteData: { totalUnits: 200, stories: 4, egressStairwells: 2, exitDoors: 6, buildingFootprintSf: 60000, bedMix: { studio: 10, oneBed: 90, twoBed: 100, threeBed: null }, confidence: 0.9 } } },
    { fileName: 'code.pdf', proposal: { unitTypes: [], siteData: { totalUnits: null, stories: 4, bedMix: { studio: 99, oneBed: 1, twoBed: 1, threeBed: 1 }, confidence: 0.8 } } },
  ]);
  assert.equal(merged.siteData.stories, 4);
  assert.equal(merged.siteData.egressStairwells, 2);
  assert.equal(merged.siteData.exitDoors, 6);
  assert.equal(merged.siteData.buildingFootprintSf, 60000);
  // First stated mix wins whole — never spliced across files.
  assert.equal(merged.siteData.bedMix.oneBed, 90);
});

test('counted figures fill in only when nothing is stated, and arrive flagged', () => {
  const d = cleanDrawings();
  d.siteData.stories = null;
  d.siteData.storiesCounted = 4;
  d.siteData.egressStairwells = null;
  d.siteData.egressStairwellsCounted = 2;
  d.siteData.exitDoors = null;
  d.siteData.exitDoorsCounted = 6;
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.stories.value, 4);
  assert.match(q.stories.flag, /Counted off the elevation/);
  assert.equal(q.egressStairwells.value, 2);
  assert.match(q.egressStairwells.flag, /Counted off the floor plan/);
  assert.equal(q.exitDoors.value, 6);
  assert.match(q.exitDoors.flag, /Counted off the plan/);
  // Landings still compute off the counted values — but flagged as built on a count.
  assert.equal(q.stairLandings.value, 2 * (2 * 4 - 1));
  assert.match(q.stairLandings.flag, /COUNTED/);
});

test('a stated figure always beats its counted twin, with no counted flag', () => {
  const d = cleanDrawings();
  d.siteData.storiesCounted = 9;         // wrong count, stated 4 must win
  d.siteData.egressStairwellsCounted = 7;
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.stories.value, 4);
  assert.equal(q.stories.flag, null);
  assert.equal(q.egressStairwells.value, 2);
  assert.equal(q.stairLandings.value, 2 * (2 * 4 - 1));
  assert.match(q.stairLandings.flag, /Assumes switchback/);
  assert.ok(!/COUNTED/.test(q.stairLandings.flag));
});

test('footprint derives from lot coverage % × lot SF when unstated (percent form)', () => {
  const d = cleanDrawings();
  d.siteData.buildingFootprintSf = null;
  d.siteData.lotCoveragePct = 28;        // written "28%"
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.buildingFootprintSf.value, Math.round(400000 * 0.28)); // 112,000
  assert.equal(q.buildingFootprintSf.source, 'derived');
  assert.match(q.buildingFootprintSf.how, /28%/);
  assert.match(q.buildingFootprintSf.flag, /Derived from the stated lot-coverage/);
});

test('footprint derivation accepts the fraction form (0.28) too', () => {
  const d = cleanDrawings();
  d.siteData.buildingFootprintSf = null;
  d.siteData.lotCoveragePct = 0.28;
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.buildingFootprintSf.value, Math.round(400000 * 0.28));
});

test('a stated footprint always beats the coverage derivation', () => {
  const d = cleanDrawings();
  d.siteData.lotCoveragePct = 28;        // would derive 112,000 — stated 60,000 wins
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.buildingFootprintSf.value, 60000);
  assert.equal(q.buildingFootprintSf.source, 'drawing');
});

test('an impossible coverage figure (>100%) is an alert, not a footprint', () => {
  const d = cleanDrawings();
  d.siteData.buildingFootprintSf = null;
  d.siteData.lotCoveragePct = 280;       // misread — no lot is 280% covered
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.buildingFootprintSf.value, null);
  assert.match(q.buildingFootprintSf.flag, /over 100%/);
});

test('coverage without a lot size cannot derive a footprint', () => {
  const d = cleanDrawings();
  d.siteData.buildingFootprintSf = null;
  d.siteData.lotSf = null;
  d.siteData.lotCoveragePct = 28;
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.buildingFootprintSf.value, null);
});

test('mergeProposals carries the counted fields and lot coverage through a merge', () => {
  const merged = mergeProposals([
    { fileName: 'elev.pdf', proposal: { unitTypes: [], siteData: { storiesCounted: 4, confidence: 0.85 } } },
    { fileName: 'plan.pdf', proposal: { unitTypes: [], siteData: { egressStairwellsCounted: 2, exitDoorsCounted: 6, lotCoveragePct: 28, confidence: 0.85 } } },
  ]);
  assert.equal(merged.siteData.storiesCounted, 4);
  assert.equal(merged.siteData.egressStairwellsCounted, 2);
  assert.equal(merged.siteData.exitDoorsCounted, 6);
  assert.equal(merged.siteData.lotCoveragePct, 28);
});
