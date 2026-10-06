// Sales Activity "By month / By quarter" bucketing.
// Run: node --test scripts/tests/activityByPeriod.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketByPeriod, bucketCountsByPeriod } from '../../src/lib/activity/byPeriod.js';

const now = new Date(2026, 9, 5); // Oct 5 2026
const notes = [
  { meetingDate: '2026-10-01T12:00:00', createdBy: { id: 'mike' } },
  { meetingDate: '2026-10-03T12:00:00', createdById: 'maram' },
  { meetingDate: '2026-09-20T12:00:00', createdBy: { id: 'mike' } },
  { meetingDate: '2026-07-10T12:00:00', createdBy: { id: 'maram' } },
  { meetingDate: '2025-09-10T12:00:00', createdBy: { id: 'mike' } },   // 13 months back, outside
  { createdAt: '2026-10-02T12:00:00', createdBy: { id: 'mike' } },      // no meetingDate, falls back to createdAt
  { meetingDate: null, createdAt: null, createdBy: { id: 'x' } }, // no date at all, ignored
];

test('month: 12 rows, oldest first, every month present', () => {
  const out = bucketByPeriod(notes, { period: 'month', months: 12, now });
  assert.equal(out.length, 12);
  assert.equal(out[0].key, '2025-11');
  assert.equal(out[11].key, '2026-10');
  assert.equal(out[11].label, 'Oct 2026');
  assert.equal(out[11].team, 3);
  assert.deepEqual(out[11].perUser, { mike: 2, maram: 1 });
  assert.equal(out[10].team, 1);
  assert.equal(out.find(b => b.key === '2026-07').perUser.maram, 1);
  assert.equal(out.find(b => b.key === '2026-01').team, 0);
});

test('quarter: 4 rows ending with the current quarter', () => {
  const out = bucketByPeriod(notes, { period: 'quarter', months: 12, now });
  assert.equal(out.length, 4);
  assert.deepEqual(out.map(b => b.key), ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
  assert.equal(out[3].label, 'Q4 2026');
  assert.equal(out[3].team, 3);
  assert.equal(out[2].team, 2); // Sep 20 + Jul 10
});

test('new people: pre-counted months split by adder, no adder counts in team only', () => {
  const rows = [
    { month: '2026-10', userId: 'mike',  count: 3 },
    { month: '2026-10', userId: 'maram', count: 1 },
    { month: '2026-10', userId: null,    count: 2 }, // added before 0119
    { month: '2026-08', userId: 'mike',  count: 4 },
    { month: '2025-01', userId: 'mike',  count: 9 }, // outside the window
    { month: 'junk',    userId: 'mike',  count: 9 },
  ];
  const byMonth = bucketCountsByPeriod(rows, { period: 'month', months: 12, now });
  const oct = byMonth.find(b => b.key === '2026-10');
  assert.equal(oct.team, 6);
  assert.deepEqual(oct.perUser, { mike: 3, maram: 1 });
  assert.equal(byMonth.find(b => b.key === '2026-08').perUser.mike, 4);

  const byQuarter = bucketCountsByPeriod(rows, { period: 'quarter', months: 12, now });
  assert.equal(byQuarter.find(b => b.key === '2026-Q4').team, 6);
  assert.equal(byQuarter.find(b => b.key === '2026-Q3').perUser.mike, 4);
  assert.equal(byQuarter.reduce((s, b) => s + b.team, 0), 10);
});

test('empty input still yields the full set of periods', () => {
  assert.equal(bucketByPeriod([], { period: 'month', months: 6, now }).length, 6);
  assert.equal(bucketByPeriod(undefined, { period: 'quarter', months: 12, now }).length, 4);
});
