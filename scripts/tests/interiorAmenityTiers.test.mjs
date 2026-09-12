/**
 * Interior amenity $/SF: every dollar from $4 to $16, in three finish tiers
 * (Mike 2026-09-11). The internal wizard and the public conceptual budget
 * both read the same list, so it is pinned once here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERIOR_AMENITY_TIERS, INTERIOR_AMENITY_RATES, interiorAmenityTier, ratesInTier,
} from '../../src/lib/interiorAmenityTiers.js';
import { INTAKE_QUESTIONS, validateAnswers, answersToEngine } from '../../src/lib/intake/questionnaire.js';

test('every whole dollar from $4 to $16 is offered, once', () => {
  assert.deepEqual(INTERIOR_AMENITY_RATES, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
});

test('three tiers, low to high, touching with no gaps and no overlap', () => {
  assert.deepEqual(INTERIOR_AMENITY_TIERS.map(t => t.key), ['low', 'medium', 'high']);
  for (let i = 1; i < INTERIOR_AMENITY_TIERS.length; i++) {
    assert.equal(INTERIOR_AMENITY_TIERS[i].min, INTERIOR_AMENITY_TIERS[i - 1].max + 1);
  }
  const all = INTERIOR_AMENITY_TIERS.flatMap(ratesInTier);
  assert.deepEqual(all, INTERIOR_AMENITY_RATES);
});

test('each rate lands in exactly one tier', () => {
  assert.equal(interiorAmenityTier(4).key, 'low');
  assert.equal(interiorAmenityTier(8).key, 'low', 'Mike: $4–$8 low');
  assert.equal(interiorAmenityTier(9).key, 'medium');
  assert.equal(interiorAmenityTier('12').key, 'medium');
  assert.equal(interiorAmenityTier(13).key, 'high');
  assert.equal(interiorAmenityTier(16).key, 'high');
  assert.equal(interiorAmenityTier(3), null);
  assert.equal(interiorAmenityTier(17), null);
  assert.equal(interiorAmenityTier('abc'), null);
});

test('the public question offers the same $4–$16 list, default $10', () => {
  const q = INTAKE_QUESTIONS.find(x => x.key === 'interiorAmenityFinish');
  assert.deepEqual(q.options, INTERIOR_AMENITY_RATES.map(String));
  assert.equal(q.default, '10');
});

test('a new rate passes straight into the engine', () => {
  assert.equal(answersToEngine({ interiorAmenityFinish: '4' }).sections.amenities.interiorLevel, '4');
  assert.equal(answersToEngine({ interiorAmenityFinish: '16' }).sections.amenities.interiorLevel, '16');
});

test('an old stored $3 answer still reads as $3; junk falls back to the default', () => {
  const pick = input => validateAnswers(input).find(r => r.questionKey === 'interiorAmenityFinish')?.answer;
  assert.equal(pick({ interiorAmenityFinish: '3' }), '3');
  assert.equal(answersToEngine({ interiorAmenityFinish: '3' }).sections.amenities.interiorLevel, '3');
  assert.equal(pick({ interiorAmenityFinish: '17' }), '10');
  assert.equal(pick({ interiorAmenityFinish: '<script>' }), '10');
});
