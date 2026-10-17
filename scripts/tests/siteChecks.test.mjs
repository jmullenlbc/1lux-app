/**
 * Deterministic auto-checks for `extract.siteParking`.
 *
 * The site plan feeds three of the six inputs on `projectInputChecks.js`'s
 * critical list, lot SF, surface parking stalls, exterior amenity SF, the
 * fields that silently price at $0 when blank. That is why this extraction is
 * worth grading, and why every check below is geometry or arithmetic rather
 * than a second model's opinion.
 *
 * Kept out of autoChecks.test.mjs so each extraction's evidence stands on its
 * own; both files exercise the same `runAutoChecks` contract.
 *
 * Run: node --test scripts/tests/siteChecks.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAutoChecks } from '../../src/lib/agent/autoChecks.js';

const TASK = 'extract.siteParking';

/**
 * Beckett Firestone as it reads correctly at 2200px, the drawing the vision
 * work was calibrated on. 16.50 Ac, 324 D.U., 680 provided.
 */
function goodSite(over = {}) {
  return {
    lotAcres: 16.5,             // → 718,740 SF
    lotSf: null,
    totalUnits: 324,
    bedMix: { studio: null, oneBed: 162, twoBed: 118, threeBed: 44 },  // 324
    parkingProvided: 680,
    parkingRequired: 675,
    surfaceParking: 520,
    garages: 120,
    carports: 40,               // 520+120+40 = 680
    buildingCount: 12,
    clubhouseSf: 4200,
    amenitySf: 12000,
    confidence: 0.8,
    ...over,
  };
}

function statusOf(res, key) {
  return res.checks.find(c => c.key === key)?.status ?? null;
}
const detailOf = (res, key) => res.checks.find(c => c.key === key)?.detail ?? '';

// ── the clean read ───────────────────────────────────────────────────────────

test('a correctly read site data block passes everything it can run', async () => {
  const res = await runAutoChecks(TASK, goodSite(), { projectUnits: 324 });
  assert.equal(res.ran, true);
  assert.equal(res.pass, true);
  for (const c of res.checks) {
    assert.notEqual(c.status, 'FAIL', `${c.key} should not fail: ${c.detail}`);
  }
});

// ── the unit-confusion failures ──────────────────────────────────────────────

test('acreage sitting in the square-feet field is caught', async () => {
  // "16.50 AC" read into lotSf. Priced as a 16-square-foot site.
  const res = await runAutoChecks(TASK, goodSite({ lotAcres: null, lotSf: 16.5 }));
  assert.equal(statusOf(res, 'lot-area'), 'FAIL');
  assert.match(detailOf(res, 'lot-area'), /acreage figure in the square-feet field/);
});

test('square feet sitting in the acres field is caught', async () => {
  const res = await runAutoChecks(TASK, goodSite({ lotAcres: 718740, lotSf: null }));
  assert.equal(statusOf(res, 'lot-area'), 'FAIL');
  assert.match(detailOf(res, 'lot-area'), /square miles/);
});

test('a stated acreage and a stated SF that disagree are caught', async () => {
  // 16.5 acres is 718,740 SF. 500,000 is not.
  const res = await runAutoChecks(TASK, goodSite({ lotAcres: 16.5, lotSf: 500000 }));
  assert.equal(statusOf(res, 'lot-area'), 'FAIL');
  assert.match(detailOf(res, 'lot-area'), /misread/);
});

test('acreage and SF that agree within reading tolerance pass', async () => {
  const res = await runAutoChecks(TASK, goodSite({ lotAcres: 16.5, lotSf: 718000 }));
  assert.equal(statusOf(res, 'lot-area'), 'PASS');
});

test('no lot area stated is a skip, never a pass', async () => {
  const res = await runAutoChecks(TASK, goodSite({ lotAcres: null, lotSf: null }));
  assert.equal(statusOf(res, 'lot-area'), 'SKIP');
});

// ── parking ──────────────────────────────────────────────────────────────────

test('stall types adding up past the stated total is caught', async () => {
  const res = await runAutoChecks(TASK, goodSite({ surfaceParking: 700 }));
  assert.equal(statusOf(res, 'parking-breakdown'), 'FAIL');
  assert.match(detailOf(res, 'parking-breakdown'), /cannot exceed/);
});

test('a complete breakdown that misses the total is caught', async () => {
  const res = await runAutoChecks(TASK, goodSite({ carports: 10 }));   // 520+120+10 = 650, not 680
  assert.equal(statusOf(res, 'parking-breakdown'), 'FAIL');
  assert.match(detailOf(res, 'parking-breakdown'), /unaccounted/);
});

test('a partial breakdown only has to fit inside the total', async () => {
  // Most drawings break out surface and garage but not carports.
  const res = await runAutoChecks(TASK, goodSite({ carports: null }));
  assert.equal(statusOf(res, 'parking-breakdown'), 'PASS');
});

test('more surface stalls than the site could physically hold is caught', async () => {
  // A 718,740 SF site cannot pave 5,000 stalls, that is 1.5M SF of asphalt.
  const res = await runAutoChecks(TASK, goodSite({ surfaceParking: 5000, parkingProvided: 5200, garages: 120, carports: 40 }));
  assert.equal(statusOf(res, 'parking-fits'), 'FAIL');
  assert.match(detailOf(res, 'parking-fits'), /cannot physically fit/);
});

test('a plausible stall count fits and says how much of the site it uses', async () => {
  const res = await runAutoChecks(TASK, goodSite());
  assert.equal(statusOf(res, 'parking-fits'), 'PASS');
  assert.match(detailOf(res, 'parking-fits'), /% of the site/);
});

test('parking far outside the normal per-unit band is caught', async () => {
  const res = await runAutoChecks(TASK, goodSite({ parkingProvided: 68, surfaceParking: 60, garages: 8, carports: 0 }));
  assert.equal(statusOf(res, 'parking-ratio'), 'FAIL');
  assert.match(detailOf(res, 'parking-ratio'), /0\.21 stalls per unit/);
});

test('a fractional stall count is caught', async () => {
  const res = await runAutoChecks(TASK, goodSite({ surfaceParking: 520.5 }));
  assert.equal(statusOf(res, 'counts'), 'FAIL');
  assert.match(detailOf(res, 'counts'), /surface stalls/);
});

// ── the reconciliations ──────────────────────────────────────────────────────

test('THE MEASURED FAILURE: a bed mix disagreeing with the unit count is caught', async () => {
  // Verbatim from the 1600px misread, totalUnits read 264 while the model's own
  // bed mix summed to 319.
  const res = await runAutoChecks(TASK, goodSite({
    totalUnits: 264,
    bedMix: { studio: null, oneBed: 162, twoBed: 113, threeBed: 44 },
  }));
  assert.equal(statusOf(res, 'bed-mix'), 'FAIL');
  assert.match(detailOf(res, 'bed-mix'), /319/);
});

test('the strongest check: a site plan contradicting the confirmed unit matrix', async () => {
  // 324 units were read off the matrix and accepted by a person. They are
  // already priced. A drawing that says 300 means one of the two is wrong.
  const res = await runAutoChecks(TASK, goodSite({ totalUnits: 300, bedMix: {} }), { projectUnits: 324 });
  assert.equal(statusOf(res, 'units-vs-project'), 'FAIL');
  assert.match(detailOf(res, 'units-vs-project'), /already priced/);
});

test('a project with no confirmed unit count skips that check rather than passing it', async () => {
  const res = await runAutoChecks(TASK, goodSite(), {});
  assert.equal(statusOf(res, 'units-vs-project'), 'SKIP');
  assert.match(detailOf(res, 'units-vs-project'), /no confirmed unit count/);
});

test('a drawing with no unit count skips that check rather than passing it', async () => {
  const res = await runAutoChecks(TASK, goodSite({ totalUnits: null, bedMix: {} }), { projectUnits: 324 });
  assert.equal(statusOf(res, 'units-vs-project'), 'SKIP');
  assert.match(detailOf(res, 'units-vs-project'), /did not state a unit count/);
});

test('amenity area larger than the whole site is caught', async () => {
  const res = await runAutoChecks(TASK, goodSite({ amenitySf: 900000 }));
  assert.equal(statusOf(res, 'amenity-fits'), 'FAIL');
  assert.match(detailOf(res, 'amenity-fits'), /larger than the property/);
});

// ── the three-valued contract ────────────────────────────────────────────────

test('a drawing that yielded nothing is a failure, not a modest reading', async () => {
  const res = await runAutoChecks(TASK, {
    lotAcres: null, lotSf: null, totalUnits: null, bedMix: {},
    parkingProvided: null, surfaceParking: null, garages: null, carports: null,
    confidence: 0.2, notes: 'No site data block found.',
  });
  assert.equal(res.pass, false);
  assert.equal(statusOf(res, 'read-anything'), 'FAIL');
});

test('a reading with only a lot area skips the rest: null, not true', async () => {
  const res = await runAutoChecks(TASK, { lotAcres: 16.5, bedMix: {} });
  assert.equal(res.ran, true);
  // The one check that can run passes; every other one skips. A skip must never
  // add up to an earned pass on the checks that never ran.
  assert.equal(statusOf(res, 'lot-area'), 'PASS');
  assert.equal(statusOf(res, 'parking-breakdown'), 'SKIP');
  assert.equal(statusOf(res, 'units-vs-project'), 'SKIP');
  assert.equal(statusOf(res, 'bed-mix'), 'SKIP');
});

test('a check that throws reports FAIL, not SKIP', async () => {
  const hostile = { lotAcres: 16.5, get surfaceParking() { throw new Error('boom'); } };
  const res = await runAutoChecks(TASK, hostile);
  assert.equal(res.pass, false);
  assert.equal(res.checks[0].key, 'check-error');
});

test('a zero stall count is a real reading and does not fail the count check', async () => {
  // "SURFACE PARKING: 0" on a structured-parking site is a legitimate reading.
  const res = await runAutoChecks(TASK, goodSite({ surfaceParking: 0, garages: 640, carports: 40 }));
  assert.equal(statusOf(res, 'counts'), 'PASS');
  assert.equal(statusOf(res, 'parking-fits'), 'SKIP', 'no surface stalls means nothing to fit');
});
