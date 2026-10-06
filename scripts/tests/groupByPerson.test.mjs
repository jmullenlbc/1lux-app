/**
 * My Desk task grouping (Mike and Maram, 10-5): "Tasks for the same person
 * due within a rolling week merge into one, with an alert."
 *
 * Run: node --test scripts/tests/groupByPerson.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupStepsByPerson } from '../../src/lib/desk/groupByPerson.js';

const NOW = new Date('2026-10-05T15:00:00Z');
const DAY = 86400000;
const at = d => new Date(NOW.getTime() + d * DAY);
const step = (id, contactId, days, extra = {}) => ({ id, contactId, who: contactId ? `Person ${contactId}` : '', dueDate: days == null ? null : at(days), ...extra });

test('two steps for the same person 3 days apart merge into one bundle with an alert', () => {
  const out = groupStepsByPerson([step('a', 'c1', 1), step('b', 'c1', 4)], { now: NOW });
  assert.equal(out.length, 1);
  assert.equal(out[0].contactId, 'c1');
  assert.equal(out[0].who, 'Person c1');
  assert.equal(out[0].items.length, 2);
  assert.equal(out[0].alert, true);
});

test('steps 10 days apart do not merge', () => {
  const out = groupStepsByPerson([step('a', 'c1', 1), step('b', 'c1', 11)], { now: NOW });
  assert.equal(out.length, 2);
  assert.ok(out.every(b => b.items.length === 1 && b.alert === false));
});

test('a step with no date joins the person bundle', () => {
  const out = groupStepsByPerson([step('a', 'c1', 2), step('b', 'c1', null)], { now: NOW });
  assert.equal(out.length, 1);
  assert.equal(out[0].items.length, 2);
  assert.equal(out[0].alert, true);
});

test('different people never merge, and steps with no contact stand alone', () => {
  const out = groupStepsByPerson([step('a', 'c1', 1), step('b', 'c2', 1), step('c', null, 1), step('d', null, 1)], { now: NOW });
  assert.equal(out.length, 4);
  assert.ok(out.every(b => b.items.length === 1 && b.alert === false));
});

test('a lone step is a bundle of one without an alert', () => {
  const out = groupStepsByPerson([step('a', 'c1', 3)], { now: NOW });
  assert.deepEqual(out.map(b => [b.items.length, b.alert]), [[1, false]]);
});

test('every row is kept, in any input order, and the window rolls from the earliest step', () => {
  const items = [step('late', 'c1', 9), step('mid', 'c1', 5), step('early', 'c1', 0), step('x', 'c2', 0), step('none', null, null)];
  const out = groupStepsByPerson(items, { now: NOW });
  const ids = out.flatMap(b => b.items.map(i => i.id)).sort();
  assert.deepEqual(ids, ['early', 'late', 'mid', 'none', 'x']);
  const c1 = out.filter(b => b.contactId === 'c1');
  assert.equal(c1.length, 2);
  assert.deepEqual(c1[0].items.map(i => i.id), ['early', 'mid']);
  assert.deepEqual(c1[1].items.map(i => i.id), ['late']);
  assert.equal(c1[0].alert, true);
  assert.equal(c1[1].alert, false);
});

test('a live snooze end and a reminder date count as the due date', () => {
  const out = groupStepsByPerson([
    { id: 'a', contactId: 'c1', dueDate: at(30), snoozedUntil: at(2) },
    { id: 'b', contactId: 'c1', dueDate: at(30), remindAt: at(5) },
  ], { now: NOW });
  assert.equal(out.length, 1);
  assert.equal(out[0].items.length, 2);
});
