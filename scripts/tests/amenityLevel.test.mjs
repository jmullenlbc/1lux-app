/**
 * The exterior amenity level is spelled two different ways in this app, and
 * the mismatch was quietly costing money.
 *
 * The PUBLIC questionnaire stores the visitor's pick as a bare dollar figure
 * ('1', '2', '3', '5'). The INTERNAL wizard, the summary page, the share page
 * and the calibration sampler all expect a word key ('low', 'lowMedium',
 * 'medium', 'high'). Every one of them fell back to 'medium' when it saw a
 * number — so a client who picked the CHEAPEST finish at $1/SF had that line
 * re-priced at $3/SF the moment the job was opened internally, and the
 * summary page printed a bare "1" where a label belonged.
 *
 * These tests pin the shared translation both directions, and pin the rate as
 * coming from the live master pricing sheet rather than from the number the
 * visitor happened to type.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAmenityLevel, amenityRate, AMENITY_LEVELS, AMENITY_LEVEL_RATES } from '../../src/lib/amenityLevel.js';

test('the word keys pass straight through', () => {
  for (const key of AMENITY_LEVELS) {
    assert.equal(normalizeAmenityLevel(key), key);
  }
});

test("the public questionnaire's bare dollar figures map to the matching level", () => {
  assert.equal(normalizeAmenityLevel('1'), 'low');
  assert.equal(normalizeAmenityLevel('2'), 'lowMedium');
  assert.equal(normalizeAmenityLevel('3'), 'medium');
  assert.equal(normalizeAmenityLevel('5'), 'high');
  // Written out with the dollar sign and the units, as the question text does.
  assert.equal(normalizeAmenityLevel('$1/SF'), 'low');
  assert.equal(normalizeAmenityLevel('$5 / SF'), 'high');
});

test('a figure between two levels takes the nearest one', () => {
  assert.equal(normalizeAmenityLevel('4'), 'medium');   // 1 away from medium, 1 from high — the lower wins
  assert.equal(normalizeAmenityLevel('1.4'), 'low');
});

test('blank, missing and nonsense fall back to medium', () => {
  assert.equal(normalizeAmenityLevel(null), 'medium');
  assert.equal(normalizeAmenityLevel(undefined), 'medium');
  assert.equal(normalizeAmenityLevel(''), 'medium');
  assert.equal(normalizeAmenityLevel('   '), 'medium');
  assert.equal(normalizeAmenityLevel('whatever'), 'medium');
  assert.equal(normalizeAmenityLevel('0'), 'medium');
  assert.equal(normalizeAmenityLevel('-3'), 'medium');
  // An explicit fallback is honoured — the calibration sampler passes one.
  assert.equal(normalizeAmenityLevel(null, 'high'), 'high');
});

test('the rate comes off the master pricing sheet, not the typed number', () => {
  // Mike edits these rates on the pricing sheet; a typed "1" must follow the
  // sheet's low rate, not hard-code itself as $1.
  const sheet = { low: 1.25, lowMedium: 2.5, medium: 3.75, high: 6 };
  assert.equal(amenityRate(sheet, '1'), 1.25);
  assert.equal(amenityRate(sheet, 'low'), 1.25);
  assert.equal(amenityRate(sheet, '5'), 6);
  assert.equal(amenityRate(sheet, 'high'), 6);
});

test('a missing or broken sheet entry falls back to the published rate', () => {
  assert.equal(amenityRate({}, '1'), AMENITY_LEVEL_RATES.low);
  assert.equal(amenityRate(null, 'high'), AMENITY_LEVEL_RATES.high);
  assert.equal(amenityRate({ low: 0 }, 'low'), AMENITY_LEVEL_RATES.low);
  assert.equal(amenityRate({ low: 'free' }, 'low'), AMENITY_LEVEL_RATES.low);
});

test('REGRESSION: a $1/SF pick no longer prices as medium', () => {
  const sheet = { low: 1, lowMedium: 2, medium: 3, high: 5 };
  assert.notEqual(amenityRate(sheet, '1'), amenityRate(sheet, '3'));
  assert.equal(amenityRate(sheet, '1'), 1);
});
