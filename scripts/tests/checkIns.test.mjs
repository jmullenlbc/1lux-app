/**
 * Check-in emails (Mike 9-26): every check-in comes with a pre-written email,
 * written "a day ahead", one per person per check-in.
 *
 * Run: node --test scripts/tests/checkIns.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cadenceDaysFor, checkInDueDay, wantsCheckInDraft, checkInOrder, DRAFT_DAYS_AHEAD } from '../../src/lib/checkIns/checkIns.js';
import { QUIET_AFTER_DAYS } from '../../src/lib/meeting/cards.js';

const day = s => { const d = new Date(`${s}T12:00:00`); return d; };
const NOW = day('2026-09-26');

test('cadence: person, then company, then tier, then the measured default', () => {
  assert.equal(cadenceDaysFor({ cadenceDays: 10, client: { cadenceDays: 20 }, cadenceTier: 'VIP_CLIENT' }, { VIP_CLIENT: 30 }), 10);
  assert.equal(cadenceDaysFor({ client: { cadenceDays: 20 }, cadenceTier: 'VIP_CLIENT' }, { VIP_CLIENT: 30 }), 20);
  assert.equal(cadenceDaysFor({ cadenceTier: 'VIP_CLIENT' }, { VIP_CLIENT: 30 }), 30);
  assert.equal(cadenceDaysFor({}, {}), QUIET_AFTER_DAYS);
});

test('the email is written the day before the person shows as due, not sooner', () => {
  assert.equal(DRAFT_DAYS_AHEAD, 1);
  // Last coffee Aug 27, 30 day cadence: on the list from Sep 27, email on Sep 26.
  const c = { email: 'a@b.com', lastInPersonAt: day('2026-08-27') };
  assert.equal(checkInDueDay(c, 30).getDate(), 27);
  assert.equal(wantsCheckInDraft(c, { cadenceDays: 30, now: NOW }), true);
  assert.equal(wantsCheckInDraft(c, { cadenceDays: 31, now: NOW }), false);
  assert.equal(wantsCheckInDraft({ ...c, email: null }, { cadenceDays: 30, now: NOW }), false);
  assert.equal(wantsCheckInDraft({ email: 'a@b.com' }, { cadenceDays: 30, now: NOW }), false);
});

test('one email per check-in: again only after a new touch or a snooze', () => {
  const c = { email: 'a@b.com', lastTouchpointAt: day('2026-06-01') };
  assert.equal(wantsCheckInDraft(c, { cadenceDays: 30, lastDraftAt: day('2026-07-02'), now: NOW }), false);
  assert.equal(wantsCheckInDraft(c, { cadenceDays: 30, lastDraftAt: day('2026-05-20'), now: NOW }), true);
  // Snoozed to Sep 30: nothing until the day before it shows again (Oct 1), then a fresh one.
  const snoozed = { ...c, nextCheckInAt: day('2026-09-30') };
  assert.equal(wantsCheckInDraft(snoozed, { cadenceDays: 30, lastDraftAt: day('2026-07-02'), now: NOW }), false);
  assert.equal(wantsCheckInDraft(snoozed, { cadenceDays: 30, lastDraftAt: day('2026-07-02'), now: day('2026-09-30') }), true);
});

test('day-ahead emails come before the backlog, then longest waiting first', () => {
  const rows = [
    { id: 'old', due: day('2026-05-01') },
    { id: 'tomorrow', due: day('2026-09-27') },
    { id: 'older', due: day('2026-04-01') },
    { id: 'today', due: day('2026-09-26') },
  ].map(r => ({ ...r, due: (r.due.setHours(0, 0, 0, 0), r.due) }));
  assert.deepEqual(rows.sort((a, b) => checkInOrder(a, b, NOW)).map(r => r.id), ['today', 'tomorrow', 'older', 'old']);
});
