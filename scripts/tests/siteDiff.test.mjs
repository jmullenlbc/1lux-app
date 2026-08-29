/**
 * What the human changed about the AI's site reading.
 *
 * The case this file exists for is `dropped`: a reviewer who unticks a field is
 * rejecting that reading, and a rejection leaves no trace in the written record.
 * Without it, an extraction whose lot size was thrown away would be recorded as
 * "accepted" and would earn the task type trust it did not deserve.
 *
 * Run: node --test scripts/tests/siteDiff.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSiteCorrection } from '../../src/lib/agent/siteDiff.js';

/** A drawing that stated four things. */
const VISION = {
  lotAcres: 16.5,          // → lotSf 718,740
  surfaceParking: 520,
  garages: 120,
  amenitySf: 12000,
  confidence: 0.8,
};

const APPLIED_AS_READ = {
  lotSf: 718740,
  numSurfaceParking: 520,
  numGarages: 120,
  exteriorAmenitySf: 12000,
};

test('applying every field as read is accepted, not corrected', () => {
  const d = describeSiteCorrection(VISION, APPLIED_AS_READ);
  assert.equal(d.changed, false);
  assert.equal(d.counts.accepted, 4);
  assert.match(d.summary, /unchanged/i);
});

test('an edited number is reported with both values', () => {
  const d = describeSiteCorrection(VISION, { ...APPLIED_AS_READ, numSurfaceParking: 480 });
  assert.equal(d.changed, true);
  assert.equal(d.counts.edited, 1);
  assert.match(d.summary, /520.*480/);
  assert.match(d.summary, /Surface Parking/i);
});

test('THE CASE THIS FILE EXISTS FOR: unticking a field is a rejection', () => {
  // The reviewer did not trust the converted acreage and left it out. Nothing in
  // the written record shows that — only this diff does.
  const { lotSf, ...rest } = APPLIED_AS_READ;
  const d = describeSiteCorrection(VISION, rest);
  assert.equal(d.changed, true, 'a dropped field must not read as an accepted extraction');
  assert.equal(d.counts.dropped, 1);
  assert.equal(d.counts.accepted, 3);
  assert.match(d.summary, /Rejected/);
  assert.match(d.summary, /Lot Size/i);
});

test('a number typed in by hand is recorded as an addition', () => {
  const d = describeSiteCorrection(VISION, { ...APPLIED_AS_READ, numCarports: 40 });
  assert.equal(d.changed, true);
  assert.equal(d.counts.added, 1);
  assert.match(d.summary, /Added by hand/);
  assert.match(d.summary, /Carports/i);
});

test('all three kinds of disagreement are reported together', () => {
  const d = describeSiteCorrection(VISION, {
    numSurfaceParking: 480,   // edited
    numGarages: 120,          // accepted
    numCarports: 40,          // added
    // lotSf and exteriorAmenitySf dropped
  });
  assert.deepEqual(d.counts, { edited: 1, dropped: 2, added: 1, accepted: 1 });
});

test('the same number in a different type is not a change', () => {
  const d = describeSiteCorrection(VISION, { ...APPLIED_AS_READ, numGarages: '120' });
  assert.equal(d.changed, false);
});

test('a field outside the site extractor says nothing about how it read', () => {
  // Somebody else's write landing in the payload must not be scored as this
  // extraction inventing a number. (grossSf used to be the example here; it
  // joined the extractor's own field list on 2026-08-29, so it no longer is.)
  const d = describeSiteCorrection(VISION, { ...APPLIED_AS_READ, numUnits: 324, numBedrooms: 400 });
  assert.equal(d.changed, false);
  assert.equal(d.counts.added, 0);
});

test('applying nothing at all rejects everything the model read', () => {
  const d = describeSiteCorrection(VISION, {});
  assert.equal(d.changed, true);
  assert.equal(d.counts.dropped, 4);
  assert.equal(d.counts.accepted, 0);
});

test('a reading that proposed nothing cannot be corrected', () => {
  const d = describeSiteCorrection({ confidence: 0.4, notes: 'nothing legible' }, {});
  assert.equal(d.changed, false);
  assert.equal(d.counts.accepted, 0);
});

test('a missing or malformed run output does not throw', () => {
  assert.equal(describeSiteCorrection(null, APPLIED_AS_READ).counts.added, 4);
  assert.equal(describeSiteCorrection(VISION, null).counts.dropped, 4);
  assert.equal(describeSiteCorrection(undefined, undefined).changed, false);
});
