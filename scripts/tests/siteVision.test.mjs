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
import { validateSiteData } from '../../src/lib/siteVision.js';

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
