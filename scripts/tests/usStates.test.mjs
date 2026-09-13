/**
 * Project location on the public conceptual-budget form (Mike, 2026-09-12:
 * "we need a city and state and zip code"). The form and /api/intake/submit
 * share checkLocation, so this pins the rule for both.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLocation, US_STATES } from '../../src/lib/usStates.js';

test('the state list is the 50 states plus DC, no repeats', () => {
  assert.equal(US_STATES.length, 51);
  assert.equal(new Set(US_STATES.map(([c]) => c)).size, 51);
});

test('a good location is tidied: city trimmed, state upper-cased', () => {
  const r = checkLocation({ city: '  San   Antonio ', state: 'tx', zip: '78205' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  assert.equal(r.city, 'San Antonio');
  assert.equal(r.state, 'TX');
  assert.equal(r.zip, '78205');
});

test('ZIP+4 is accepted with or without the dash and stored with it', () => {
  assert.equal(checkLocation({ city: 'Austin', state: 'TX', zip: '787011234' }).zip, '78701-1234');
  assert.equal(checkLocation({ city: 'Austin', state: 'TX', zip: '78701-1234' }).zip, '78701-1234');
});

test('every blank or bad part is named', () => {
  assert.deepEqual(checkLocation({}).missing, ['City', 'State', 'Zip code']);
  const r = checkLocation({ city: '123', state: 'Texas', zip: '7870' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['City', 'State', 'Zip code']);
  assert.equal(r.state, null);
  assert.equal(r.zip, null);
});

test('a very long city is cut to 100 characters', () => {
  assert.equal(checkLocation({ city: 'a'.repeat(300), state: 'CO', zip: '80202' }).city.length, 100);
});
