// Mike 10-16: the pool answer trims the exterior amenity $/SF ladder on the
// public no-drawings path. Pool = yes hides the $1 "No pool" level; pool = no
// hides the $5 level. A pick the new answer hides moves to the nearest level.
// Run: node --test scripts/tests/poolAmenityLadder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { INTAKE_QUESTIONS, EXTERIOR_AMENITY_KEY, exteriorAmenityOptions, exteriorAmenityFallback } from '../../src/lib/intake/questionnaire.js';

const q = INTAKE_QUESTIONS.find(x => x.key === EXTERIOR_AMENITY_KEY);

test('pool yes drops $1, pool no drops $5, no answer keeps all four', () => {
  assert.deepEqual(exteriorAmenityOptions(q.options, 'yes'), ['2', '3', '5']);
  assert.deepEqual(exteriorAmenityOptions(q.options, 'no'), ['1', '2', '3']);
  assert.deepEqual(exteriorAmenityOptions(q.options, ''), ['1', '2', '3', '5']);
  assert.deepEqual(exteriorAmenityOptions(q.options, undefined), ['1', '2', '3', '5']);
});

test('a hidden pick moves: $1 with a pool becomes $2, $5 without a pool becomes $1; visible picks stay', () => {
  assert.equal(exteriorAmenityFallback('yes', '1'), '2');
  assert.equal(exteriorAmenityFallback('yes', '3'), '3');
  assert.equal(exteriorAmenityFallback('no', '5'), '1');
  assert.equal(exteriorAmenityFallback('no', '2'), '2');
  assert.equal(exteriorAmenityFallback('yes', ''), '2');
  assert.equal(exteriorAmenityFallback('no', ''), '1');
});
