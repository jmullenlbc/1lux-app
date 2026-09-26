/**
 * My Desk (Mike 9-26): "Make the snooze time manually overwritten with any
 * number" and "pick a date as the manual override option."
 *
 * Run: node --test scripts/tests/desk.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { snoozeUntil, deskGroup, groupDesk, deskAttention, SNOOZE_PRESETS, MAX_SNOOZE_DAYS } from '../../src/lib/desk/desk.js';

const NOW = new Date('2026-09-26T15:00:00Z');
const DAY = 86400000;
const at = d => new Date(NOW.getTime() + d * DAY);

test('snooze takes the presets, any typed number, or a picked date', () => {
  assert.deepEqual(SNOOZE_PRESETS.map(p => p.days), [1, 3, 7]);
  assert.equal(snoozeUntil({ days: 3 }, NOW).getTime(), at(3).getTime());
  assert.equal(snoozeUntil({ days: '11' }, NOW).getTime(), at(11).getTime());
  assert.equal(snoozeUntil({ days: MAX_SNOOZE_DAYS }, NOW).getTime(), at(365).getTime());
  assert.equal(snoozeUntil({ days: 0 }, NOW), null);
  assert.equal(snoozeUntil({ days: 366 }, NOW), null);
  assert.equal(snoozeUntil({ days: 'soon' }, NOW), null);
  assert.equal(snoozeUntil({}, NOW), null);
  // A picked date wins over days, lands at noon UTC, and must be after now.
  assert.equal(snoozeUntil({ days: 3, date: '2026-10-15' }, NOW).toISOString(), '2026-10-15T12:00:00.000Z');
  assert.equal(snoozeUntil({ date: '2026-09-20' }, NOW), null);
  assert.equal(snoozeUntil({ date: 'next tuesday' }, NOW), null);
});

test('each step lands in one group; pause beats snooze beats dates', () => {
  assert.equal(deskGroup({ pausedAt: NOW, snoozedUntil: at(2), remindAt: at(-5) }, { now: NOW }), 'PAUSED');
  assert.equal(deskGroup({ snoozedUntil: at(2), remindAt: at(-5) }, { now: NOW }), 'SNOOZED');
  assert.equal(deskGroup({ snoozedUntil: at(-1), remindAt: at(-1) }, { now: NOW }), 'OVERDUE');
  assert.equal(deskGroup({ remindAt: at(-2) }, { now: NOW }), 'OVERDUE');
  assert.equal(deskGroup({ dueDate: NOW }, { now: NOW }), 'TODAY');
  assert.equal(deskGroup({ remindAt: at(4) }, { now: NOW }), 'WEEK');
  assert.equal(deskGroup({ remindAt: at(4) }, { waiting: true, now: NOW }), 'WAITING');
  assert.equal(deskGroup({ remindAt: at(-4) }, { waiting: true, now: NOW }), 'OVERDUE');
  assert.equal(deskGroup({ remindAt: at(20) }, { now: NOW }), 'LATER');
  assert.equal(deskGroup({}, { now: NOW }), 'LATER');
});

test('groups come in page order, soonest first, empty ones dropped; the count is late + today + drafts', () => {
  const items = [
    { id: 'b', remindAt: at(-1) },
    { id: 'a', remindAt: at(-3) },
    { id: 'w', remindAt: at(5), wait: true },
    { id: 'p', pausedAt: NOW },
    { id: 't', dueDate: NOW },
  ];
  const groups = groupDesk(items, { isWaiting: a => !!a.wait, now: NOW });
  assert.deepEqual(groups.map(g => g.key), ['OVERDUE', 'TODAY', 'WAITING', 'PAUSED']);
  assert.deepEqual(groups[0].items.map(a => a.id), ['a', 'b']);
  assert.equal(deskAttention({ groups, drafts: 2 }), 5);
  assert.equal(deskAttention({}), 0);
});
