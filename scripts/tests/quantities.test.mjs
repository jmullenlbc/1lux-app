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

test('ceiling fans: the verbatim spreadsheet options count per bedroom tier', () => {
  // Fixture mix: 20 studios, 100 one-bed, 80 two-bed (no three-bed units).
  const d = cleanDrawings();
  const fans = (ans) => byKey(computeQuantities(d, { ceilingFans: ans })).ceilingFans;
  assert.equal(fans('Master bed + Living room').value, 180 + 200);
  assert.equal(fans('Master bed + Secondary bed').value, 180 + 80);
  assert.equal(fans('Master bed/Secondary bed/Living room').value, 180 + 80 + 200);
  // No 3-bed units in the mix, so the tertiary tier contributes zero.
  assert.equal(fans('Master bed/Secondary bed/Tertiary bed').value, 180 + 80);
  assert.equal(fans('Master bed/Secondary bed/Tertiary bed + Living room').value, 180 + 80 + 200);
  // The how-sentence names each tier it counted.
  assert.match(fans('Master bed + Secondary bed').how, /master/i);
  assert.match(fans('Master bed + Secondary bed').how, /secondary/i);
});

test('stair landings = stairs × (2 × stories − 1), plus the 10% contingency (Mike 2026-09-05)', () => {
  const q = byKey(computeQuantities(cleanDrawings(), {}));
  assert.equal(q.stairLandings.value, Math.round(2 * (2 * 4 - 1) * 1.1));   // 14 → 15
  assert.equal(q.stairLandings.source, 'derived');
  assert.match(q.stairLandings.how, /2 × 4 stories/);
  assert.match(q.stairLandings.how, /\+ 10%/);
  assert.match(q.stairLandings.how, /mid-level landing/, 'the middle landing between floors is called out');
});

test('stories unstated: estimated from gross ÷ footprint, and the landings follow — flagged ESTIMATED', () => {
  const d = cleanDrawings();
  d.siteData.stories = null;                                  // 260,000 ÷ 60,000 ≈ 4
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.stories.value, 4);
  assert.equal(q.stories.source, 'derived');
  assert.match(q.stories.flag, /ESTIMATED/);
  assert.equal(q.stairLandings.value, Math.round(2 * (2 * 4 - 1) * 1.1));
  assert.match(q.stairLandings.flag, /ESTIMATED from building-code/);
});

test('exit stairs unstated: the building-code minimum fills in (≥2 per building, more on a long floor plate)', () => {
  const d = cleanDrawings();
  d.siteData.egressStairwells = null;
  d.siteData.buildingCount = 1;                               // 60,000 SF plate → 4 stairs @ 15K
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.egressStairwells.value, 4);
  assert.equal(q.egressStairwells.source, 'derived');
  assert.match(q.egressStairwells.flag, /ESTIMATED from code minimums/);
  assert.equal(q.stairLandings.value, Math.round(4 * (2 * 4 - 1) * 1.1));   // 28 → 31
  assert.match(q.stairLandings.how, /building code minimum/);

  // Three walk-up buildings, no footprint at all → 2 per building.
  const e = cleanDrawings();
  e.siteData.egressStairwells = null;
  e.siteData.buildingFootprintSf = null;
  e.siteData.buildingCount = 3;
  const qe = byKey(computeQuantities(e, {}));
  assert.equal(qe.egressStairwells.value, 6);
  assert.equal(qe.stairLandings.value, Math.round(6 * 7 * 1.1));            // 42 → 46
});

test('the questionnaire building type steers the plate factor: garden walk-ups get breezeway stairs, townhouses get none', () => {
  // Garden: the 60,000 SF plate holds one open breezeway stair per 5,000 SF.
  const d = cleanDrawings();
  d.siteData.egressStairwells = null;
  d.siteData.buildingCount = 1;
  const q = byKey(computeQuantities(d, { projectType: 'Garden (3 Levels)' }));
  assert.equal(q.egressStairwells.value, 12);                 // 60,000 ÷ 5,000
  assert.match(q.stairLandings.how, /breezeway/);
  // Townhouses: private in-unit stairs — zero shared landings, not null.
  const t = cleanDrawings();
  t.siteData.egressStairwells = null;
  const qt = byKey(computeQuantities(t, { projectType: 'Town Houses (2-3 Levels)' }));
  assert.equal(qt.stairLandings.value, 0);
  assert.match(qt.stairLandings.how, /private, inside each unit/);
});

test('landings stay null (never guessed from nothing) when neither stories nor gross+footprint exist', () => {
  const d = cleanDrawings();
  d.siteData.stories = null;
  d.siteData.buildingFootprintSf = null;
  d.siteData.lotCoveragePct = null;
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.stairLandings.value, null);
  assert.match(q.stairLandings.how, /stairs × \(2 × stories − 1\)/);
});

test('BOH is the remainder of the stated gross, capped at 5% of gross (Mike 2026-09-04)', () => {
  const q = byKey(computeQuantities(cleanDrawings(), {}));
  // Raw remainder: 260,000 − 174,000 units − 18,000 corridors − 5,000 interior
  // amenity = 63,000 — but BOH is never more than 5% of gross: 13,000.
  assert.equal(q.bohSf.value, 13000);
  assert.equal(q.bohSf.source, 'derived');
  assert.match(q.bohSf.how, /260,000/);
  assert.match(q.bohSf.how, /capped at 5% of gross/);
  assert.match(q.bohSf.flag, /exceeded the 5%-of-gross BOH cap/);
});

test('a BOH remainder under the 5% cap passes through untouched', () => {
  const d = cleanDrawings();
  d.projectTotals.grossInteriorSf = 205000; // remainder 205,000 − 197,000 = 8,000 < 10,250 cap
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.bohSf.value, 8000);
  assert.equal(q.bohSf.source, 'derived');
  assert.doesNotMatch(q.bohSf.how, /capped/);
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

// A matrix can never legitimately cover FEWER units than the document says the
// project has — rows were missed. Mike, 2026-09-15, on Lone Tree Ranch Test v1:
// "It read units wrong ... It found 168 balconies but 108 units. Way off there
// ... Bedrooms say 294, but we counted 472." Every per-unit column was short by
// the same fraction as the unit count, so the printed total has to win AND the
// columns have to follow it up.
test('a printed total ABOVE the matrix sum wins, and scales the per-unit columns', () => {
  const d = cleanDrawings();
  d.projectTotals.statedTotalUnits = 264;      // rows sum to 200
  const q = byKey(computeQuantities(d, {}));

  assert.equal(q.totalUnits.value, 264);
  assert.equal(q.totalUnits.source, 'drawing');
  assert.match(q.totalUnits.flag, /200/);      // says what the rows summed to
  assert.match(q.totalUnits.flag, /264/);      // …and what the document states

  // 260 bedrooms across the 200 units the matrix covered → 264 units.
  assert.equal(q.bedrooms.value, Math.round(260 * (264 / 200)));
  assert.equal(q.bathrooms.value, Math.round(280 * (264 / 200)));
  assert.equal(q.vanities.value, q.bathrooms.value);
  assert.equal(q.balconies.value, Math.round(180 * (264 / 200)));
  assert.equal(q.unitsSf.value, Math.round(174000 * (264 / 200)));
  // The scale-up is never silent.
  assert.match(q.bedrooms.flag, /scaled up/);
});

// The reverse is legitimate: on a multi-building set the printed total is often
// one building's. The matrix keeps its win there — but still says so.
test('a printed total BELOW the matrix sum keeps the matrix, flagged', () => {
  const d = cleanDrawings();
  d.projectTotals.statedTotalUnits = 150;      // rows sum to 200
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.totalUnits.value, 200);
  assert.match(q.totalUnits.flag, /150/);
  assert.equal(q.bedrooms.value, 260);         // not scaled
});

// A row whose quantity did not come through is dropped from every total — that
// used to happen in total silence, which is how an undercount survives review.
test('unit-type rows with no quantity are called out on the unit count', () => {
  const d = cleanDrawings();
  d.unitTypes.push({ code: 'C1', qty: null, unitSf: 1300, bedrooms: 3, bathrooms: 2, confidence: 0.9 });
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.totalUnits.value, 200);       // the blank row adds nothing…
  assert.match(q.totalUnits.flag, /no quantity/); // …but it is no longer silent
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
  d.siteData.stories = null;                                  // landings unfindable…
  d.siteData.buildingFootprintSf = null;                      // …and unestimable
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
  assert.equal(q.stairLandings.value, Math.round(2 * (2 * 4 - 1) * 1.1));
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
  assert.equal(q.stairLandings.value, Math.round(2 * (2 * 4 - 1) * 1.1));
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

// ─── THE GROSS-SF LADDER (typed figures + derived last resorts) ─────────────
// Drawing-stated wins, then the visitor's typed figure, then footprint ×
// stories (Mike's validated backup — 0.8% on Trailhead), then unit SF × the
// master pricing sheet's units→gross factor (Mike set 1.25, 2026-09-04).

function noGross() {
  const d = cleanDrawings();
  d.projectTotals.grossInteriorSf = null;
  d.siteData.grossSf = null;
  return d;
}

test('a typed gross-SF figure fills in when the drawings state nothing', () => {
  const q = byKey(computeQuantities(noGross(), { figureGrossSf: '364,029' }));
  assert.equal(q.grossSf.value, 364029);
  assert.equal(q.grossSf.source, 'questionnaire');
  assert.match(q.grossSf.how, /Entered on the questionnaire/);
  // A typed gross is a real figure — BOH computes off it like any other,
  // subject to the 5%-of-gross cap (raw remainder 167,029 ≫ 18,201 cap).
  assert.equal(q.bohSf.value, Math.round(364029 * 0.05));
});

test('a drawing-stated gross always beats the typed figure', () => {
  const q = byKey(computeQuantities(cleanDrawings(), { figureGrossSf: '999999' }));
  assert.equal(q.grossSf.value, 260000);
  assert.equal(q.grossSf.source, 'drawing');
});

test('a typed unit count fills in when no matrix, stated total, or site count exists', () => {
  const d = noGross();
  d.unitTypes = [];
  d.projectTotals.statedTotalUnits = null;
  d.siteData.totalUnits = null;
  d.siteData.bedMix = null;
  const q = byKey(computeQuantities(d, { figureTotalUnits: '234' }));
  assert.equal(q.totalUnits.value, 234);
  assert.equal(q.totalUnits.source, 'questionnaire');
});

test('garbage typed figures are ignored, never parsed into a number', () => {
  for (const bad of ['abc', '-500', '0', '12.5.7', '']) {
    const q = byKey(computeQuantities(noGross(), { figureGrossSf: bad }));
    assert.notEqual(q.grossSf.source, 'questionnaire', `"${bad}" must not answer the question`);
  }
});

test('no stated gross and nothing typed → footprint × stories, labelled ESTIMATED', () => {
  const q = byKey(computeQuantities(noGross(), {}));
  assert.equal(q.grossSf.value, 60000 * 4);       // stated footprint × stated stories
  assert.equal(q.grossSf.source, 'derived');
  assert.match(q.grossSf.flag, /ESTIMATED from footprint × stories/);
  // BOH stays uncomputed — a remainder off an estimated gross would be an
  // estimate of an estimate.
  assert.equal(q.bohSf.value, null);
});

test('no footprint either → unit SF × the pricing-sheet factor, labelled ROUGH ESTIMATE', () => {
  const d = noGross();
  d.siteData.buildingFootprintSf = null;
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.grossSf.value, Math.round(174000 * 1.25));   // 217,500 (factor from PRICING.estimation)
  assert.equal(q.grossSf.source, 'derived');
  assert.match(q.grossSf.flag, /ROUGH ESTIMATE/);
  assert.equal(q.bohSf.value, null);
});

test('the units→gross factor comes from the pricing sheet passed in, not a hardcoded number', () => {
  const d = noGross();
  d.siteData.buildingFootprintSf = null;
  const q = byKey(computeQuantities(d, {}, { estimation: { unitsToGross: 1.4 } }));
  assert.equal(q.grossSf.value, Math.round(174000 * 1.4));
  // A junk factor falls back to the static default rather than poisoning the math.
  const q2 = byKey(computeQuantities(d, {}, { estimation: { unitsToGross: 0 } }));
  assert.equal(q2.grossSf.value, Math.round(174000 * 1.25));
});

test('a typed figure beats both derived estimates', () => {
  const q = byKey(computeQuantities(noGross(), { figureGrossSf: '300000' }));
  assert.equal(q.grossSf.value, 300000);
  assert.equal(q.grossSf.source, 'questionnaire');
});

// ─── TYPED COUNT FIGURES (stories, stairs, exit doors, parking) ─────────────
// Same ladder as gross SF: drawing-stated → counted-off-a-view → typed by the
// visitor. A typed count is a real figure — landings derive off it, exit doors
// become the wallpack quantity — but anything the drawings answered wins.

test('typed stories + stairwells fill in and drive the landings derivation', () => {
  const d = cleanDrawings();
  d.siteData.stories = null;
  d.siteData.egressStairwells = null;
  const q = byKey(computeQuantities(d, { figureStories: '5', figureStairwells: '3' }));
  assert.equal(q.stories.value, 5);
  assert.equal(q.stories.source, 'questionnaire');
  assert.equal(q.egressStairwells.value, 3);
  assert.equal(q.egressStairwells.source, 'questionnaire');
  assert.equal(q.stairLandings.value, Math.round(3 * (2 * 5 - 1) * 1.1));   // 27 → 30
  assert.equal(q.stairLandings.source, 'derived');
  assert.match(q.stairLandings.flag, /figure the visitor typed/);
});

test('drawing-stated stories/stairs always beat typed figures', () => {
  const q = byKey(computeQuantities(cleanDrawings(), { figureStories: '99', figureStairwells: '99' }));
  assert.equal(q.stories.value, 4);
  assert.equal(q.stories.source, 'drawing');
  assert.equal(q.egressStairwells.value, 2);
  assert.equal(q.stairLandings.value, 15);                    // 14 + 10%
});

test('a typed landings count overrides the 2N−1 derivation (Mike 2026-09-04: the wizard asks for landings directly)', () => {
  const q = byKey(computeQuantities(cleanDrawings(), { figureStairLandings: '18' }));
  assert.equal(q.stairLandings.value, 18);                   // not 2 × (2×4−1) = 14, and NO 10% added to a typed count
  assert.equal(q.stairLandings.source, 'questionnaire');
});

test('the legacy figureStairwells key still replays: shafts typed, landings derived', () => {
  const d = cleanDrawings();
  d.siteData.stories = null;
  d.siteData.egressStairwells = null;
  const q = byKey(computeQuantities(d, { figureStories: '5', figureStairwells: '3' }));
  assert.equal(q.stairLandings.value, 30);                   // 27 + 10%
  assert.equal(q.stairLandings.source, 'derived');
});

test('a typed balcony count fills in when the unit matrix lists none — the balcony answer prices off it', () => {
  const d = cleanDrawings();
  for (const u of d.unitTypes) delete u.balconies;
  assert.equal(byKey(computeQuantities(d, {})).balconies.value, null);
  const q = byKey(computeQuantities(d, { figureBalconies: '150' }));
  assert.equal(q.balconies.value, 150);
  assert.equal(q.balconies.source, 'questionnaire');
});

test('a COUNTED figure beats a typed one — the drawings were at least looked at', () => {
  const d = cleanDrawings();
  d.siteData.stories = null;
  d.siteData.storiesCounted = 3;
  const q = byKey(computeQuantities(d, { figureStories: '9' }));
  assert.equal(q.stories.value, 3);
  assert.equal(q.stories.source, 'drawing');
  assert.match(q.stories.flag, /Counted off the elevation/);
});

test('typed exit doors and surface stalls fill in when the drawings are silent', () => {
  const d = cleanDrawings();
  d.siteData.exitDoors = null;
  d.siteData.surfaceParking = null;
  const q = byKey(computeQuantities(d, { figureExitDoors: '8', figureSurfaceParking: '96' }));
  assert.equal(q.exitDoors.value, 8);
  assert.equal(q.exitDoors.source, 'questionnaire');
  assert.match(q.exitDoors.how, /Entered on the questionnaire/);
  assert.equal(q.surfaceParking.value, 96);
  assert.equal(q.surfaceParking.source, 'questionnaire');
});

test('garbage typed count figures are ignored like garbage gross figures', () => {
  const d = cleanDrawings();
  d.siteData.stories = null;
  d.siteData.exitDoors = null;
  for (const bad of ['abc', '-3', '0', '']) {
    const q = byKey(computeQuantities(d, { figureStories: bad, figureExitDoors: bad }));
    assert.notEqual(q.stories.source, 'questionnaire', `"${bad}" must not answer stories`);
    assert.notEqual(q.exitDoors.source, 'questionnaire', `"${bad}" must not answer exit doors`);
  }
});

test('a partial unit-SF column blocks the units→gross blow-up (no estimate off an undercount)', () => {
  const d = noGross();
  d.siteData.buildingFootprintSf = null;
  d.unitTypes[2].unitSf = null;                    // 80 of 200 units missing SF
  const q = byKey(computeQuantities(d, {}));
  assert.equal(q.grossSf.value, null);
  assert.equal(q.grossSf.source, null);
});

test('a summed per-building total shows its addends as the how-sentence', () => {
  const d = cleanDrawings();
  d.projectTotals.grossSfSummed = true;
  d.projectTotals.grossSfSummary =
    'No whole-project total is printed — this is the sum of the stated per-building totals: Building A 87,781 + Building B 87,781 + Building C 96,746 + Building D 91,721 = 364,029 SF. Stated gross.';
  const q = byKey(computeQuantities(d, {}));
  assert.match(q.grossSf.how, /sum of the stated per-building totals/);
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
