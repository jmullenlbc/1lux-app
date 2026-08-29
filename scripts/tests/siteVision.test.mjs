/**
 * Cross-check tests for vision site-data extraction.
 *
 * These encode a REAL measured failure. Reading the hand-lettered Beckett
 * Firestone SITE DATA block at 1600px, the model returned totalUnits 264 while
 * its own bed mix summed to 319 — a plausible, wrong number that would have
 * flowed straight into a budget. Raising the render to 2200px fixed the read;
 * these checks are the net for when it happens anyway.
 *
 * Run: node --test scripts/tests/siteVision.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSiteData, mergeSiteData } from '../../src/lib/siteVision.js';

const base = {
  lotAcres: null, totalUnits: null, bedMix: {},
  parkingProvided: null, parkingRequired: null, confidence: 0.9,
};
const warn = (d, field) => (validateSiteData(d).warnings || []).some(w => w.field === field);

test('clean data passes with confidence intact', () => {
  const r = validateSiteData({
    ...base, totalUnits: 324,
    bedMix: { studio: null, oneBed: 162, twoBed: 118, threeBed: 44 },
    parkingProvided: 680, parkingRequired: 675,
  });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.confidence, 0.9, 'no warnings means no downgrade');
});

test('THE REAL FAILURE: bed mix disagreeing with total units is caught', () => {
  // Verbatim from the 1600px misread.
  const r = validateSiteData({
    ...base, totalUnits: 264,
    bedMix: { studio: null, oneBed: 162, twoBed: 113, threeBed: 44 }, // sums to 319
  });
  assert.ok(warn(r, 'totalUnits'), 'must flag the arithmetic disagreement');
  assert.match(r.warnings.find(w => w.field === 'totalUnits').message, /319/);
  assert.ok(r.confidence <= 0.45, 'confidence must be downgraded');
});

test('a warning never rewrites the number — a human decides', () => {
  const r = validateSiteData({
    ...base, totalUnits: 264,
    bedMix: { oneBed: 162, twoBed: 113, threeBed: 44 },
  });
  assert.equal(r.totalUnits, 264, 'reported value is preserved as read');
  assert.equal(r.bedMix.twoBed, 113);
});

test('partial bed mix still cross-checks against the total', () => {
  const r = validateSiteData({ ...base, totalUnits: 300, bedMix: { oneBed: 100, twoBed: 100 } });
  assert.ok(warn(r, 'totalUnits'));
});

test('a bed mix of all nulls cannot trigger a false alarm', () => {
  const r = validateSiteData({
    ...base, totalUnits: 324,
    bedMix: { studio: null, oneBed: null, twoBed: null, threeBed: null },
  });
  assert.ok(!warn(r, 'totalUnits'), 'no mix data means nothing to contradict');
});

test('provided parking below required is flagged', () => {
  assert.ok(warn({ ...base, parkingProvided: 600, parkingRequired: 675 }, 'parkingProvided'));
});

test('provided at or above required is fine', () => {
  assert.ok(!warn({ ...base, parkingProvided: 680, parkingRequired: 675 }, 'parkingProvided'));
  assert.ok(!warn({ ...base, parkingProvided: 675, parkingRequired: 675 }, 'parkingProvided'));
});

test('implausible stalls-per-unit ratios are flagged in both directions', () => {
  assert.ok(warn({ ...base, parkingProvided: 68, totalUnits: 324 }, 'parkingProvided'), 'a dropped digit');
  assert.ok(warn({ ...base, parkingProvided: 6800, totalUnits: 324 }, 'parkingProvided'), 'an extra digit');
});

test('a normal parking ratio is not flagged', () => {
  for (const [prov, units] of [[680, 324], [324, 324], [500, 324]]) {
    assert.ok(!warn({ ...base, parkingProvided: prov, totalUnits: units }, 'parkingProvided'),
      `${prov}/${units} should be accepted`);
  }
});

test('acreage always carries a confirm warning', () => {
  // Misread at every resolution tested (16.56 / 16.86 / 16.56 vs a true 16.50),
  // so it is never presented as trustworthy on its own.
  assert.ok(warn({ ...base, lotAcres: 16.86 }, 'lotAcres'));
  assert.ok(!warn({ ...base, lotAcres: null }, 'lotAcres'), 'absent acreage needs no warning');
});

test('zero units cannot cause a divide-by-zero', () => {
  assert.doesNotThrow(() => validateSiteData({ ...base, totalUnits: 0, parkingProvided: 10 }));
});

test('missing bedMix entirely is safe', () => {
  assert.doesNotThrow(() => validateSiteData({ totalUnits: 324 }));
});

// ─── stitching one drawing's answer onto another's ──────────────────────────
//
// Reading two drawings in one request measured 29.4 seconds against a front
// door that hangs up at 30. So they are read one per request and merged as
// they arrive -- and a merge is a new way to be wrong: a blank on the second
// drawing must never wipe out a real number off the first.

test('the first drawing to answer a field is the one that stands', () => {
  const merged = mergeSiteData(
    { totalUnits: 250, lotAcres: null, bedMix: {}, confidence: 0.9 },
    { totalUnits: 12,  lotAcres: 14.2, bedMix: {}, confidence: 0.9 },
  );
  assert.strictEqual(merged.totalUnits, 250, 'a later sheet overwrote a real unit count');
  assert.strictEqual(merged.lotAcres, 14.2, 'a field only the later sheet had was dropped');
});

test('a blank on the second drawing never erases a number off the first', () => {
  const merged = mergeSiteData(
    { totalUnits: 250, parkingProvided: 400, bedMix: { oneBed: 132 }, confidence: 0.9 },
    { totalUnits: null, parkingProvided: null, bedMix: { oneBed: null }, confidence: 0.9 },
  );
  assert.strictEqual(merged.totalUnits, 250);
  assert.strictEqual(merged.parkingProvided, 400);
  assert.strictEqual(merged.bedMix.oneBed, 132);
});

test('the bed mix fills in field by field across drawings', () => {
  // The unit matrix carries the mix; the site plan carries the total. Neither
  // sheet has both, and the cross-checks need both together.
  const merged = mergeSiteData(
    { totalUnits: 250, bedMix: { oneBed: 132, twoBed: null }, confidence: 0.9 },
    { totalUnits: null, bedMix: { oneBed: null, twoBed: 118 }, confidence: 0.9 },
  );
  assert.strictEqual(merged.bedMix.oneBed, 132);
  assert.strictEqual(merged.bedMix.twoBed, 118);
});

test('confidence is the LOWEST of what went in, not the latest', () => {
  const a = mergeSiteData({ totalUnits: 250, bedMix: {}, confidence: 0.9 }, { bedMix: {}, confidence: 0.4 });
  assert.strictEqual(a.confidence, 0.4, 'a shaky drawing was averaged away');
  const b = mergeSiteData({ totalUnits: 250, bedMix: {}, confidence: 0.4 }, { bedMix: {}, confidence: 0.9 });
  assert.strictEqual(b.confidence, 0.4, 'a shaky first drawing was forgotten');
});

test('finding the site data block on ANY drawing counts as finding it', () => {
  const merged = mergeSiteData(
    { bedMix: {}, foundSiteDataBlock: false, confidence: 0.9 },
    { bedMix: {}, foundSiteDataBlock: true,  confidence: 0.9 },
  );
  assert.strictEqual(merged.foundSiteDataBlock, true);
});

test('the notes off each drawing are kept, labelled with the sheet they came off', () => {
  const merged = mergeSiteData(
    { bedMix: {}, notes: 'Unit total taken from the matrix.', confidence: 0.9 },
    { bedMix: {}, notes: 'No building count is printed.', confidence: 0.9 },
    7,
  );
  assert.match(merged.notes, /Unit total taken from the matrix\./);
  assert.match(merged.notes, /page 7/);
  assert.match(merged.notes, /No building count is printed\./);
});

test('the first drawing merges onto nothing without being changed', () => {
  const first = { totalUnits: 250, bedMix: { oneBed: 132 }, confidence: 0.9 };
  const merged = mergeSiteData(null, first, 3);
  assert.strictEqual(merged.totalUnits, 250);
  assert.strictEqual(merged.bedMix.oneBed, 132);
});

test('a drawing that read as nothing leaves the answer alone', () => {
  const acc = { totalUnits: 250, bedMix: { oneBed: 132 }, confidence: 0.9 };
  assert.strictEqual(mergeSiteData(acc, null), acc);
});

test('merging does not mutate the answer already in hand', () => {
  const acc = { totalUnits: 250, lotAcres: null, bedMix: { oneBed: 132, twoBed: null }, confidence: 0.9 };
  mergeSiteData(acc, { lotAcres: 14.2, bedMix: { twoBed: 118 }, confidence: 0.5 });
  assert.strictEqual(acc.lotAcres, null);
  assert.strictEqual(acc.bedMix.twoBed, null);
  assert.strictEqual(acc.confidence, 0.9);
});

test('the cross-checks run on the merged answer, not on each drawing alone', () => {
  // This is the point of merging before validating: a bed mix off the unit
  // matrix and a unit total off the site plan can only disagree once they are
  // in the same object. Apart, each sheet looks fine and the mismatch is lost.
  const merged = mergeSiteData(
    { totalUnits: 264, bedMix: {}, parkingProvided: null, parkingRequired: null, confidence: 0.9 },
    { totalUnits: null, bedMix: { oneBed: 162, twoBed: 113, threeBed: 44 }, confidence: 0.9 },
  );
  assert.ok((validateSiteData(merged).warnings || []).some(w => w.field === 'totalUnits'),
    'a unit total that disagrees with the mix on another sheet went unflagged');
});
