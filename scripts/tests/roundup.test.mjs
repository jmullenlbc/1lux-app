/**
 * Tests for one person's Monday roundup.
 *
 * Two failure modes are worth more than all the others put together, and most
 * of what follows pins one of them:
 *
 *   1. Telling you about work that is not yours. A roundup that mixes in
 *      somebody else's deals is not a summary, it is an accusation, and the
 *      only defence against it is that every filter is an ownership filter.
 *   2. Arriving when there is nothing to say. "Nothing this week" every week
 *      trains people to dismiss the bell unread, including the week it
 *      mattered. No sections must mean no alert.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoundup, weekKey, SIGNAL_WINDOW_DAYS, LOOKAHEAD_DAYS } from '../../src/lib/roundup.js';

const MONDAY = new Date('2026-08-24T13:00:00.000Z');  // a real Monday
const DAY = 86400_000;
const ago  = d => new Date(MONDAY.getTime() - d * DAY);
const from = d => new Date(MONDAY.getTime() + d * DAY);

const ME = 'u-me';
const THEM = 'u-them';

/** A live project I own with a proposal out. */
function project(over = {}) {
  return {
    id: 'p1', name: 'Trailhead Apartments', clientId: 'c1',
    salesOwnerId: ME, preconManagerId: null,
    procurementStatus: 'OPEN', designStatus: 'OPEN',
    proposalSentDate: ago(10),
    ...over,
  };
}

const sectionOf = (r, key) => r.sections.find(s => s.key === key);

// ── Nothing to say ──────────────────────────────────────────────────────────

test('a quiet week rings no bell at all', () => {
  const r = buildRoundup({ userId: ME, now: MONDAY });
  assert.equal(r.alert, null, 'an empty roundup must not arrive');
  assert.deepEqual(r.sections, []);
});

test('a roundup with no owner is refused rather than guessed at', () => {
  assert.equal(buildRoundup({ projects: [project()], now: MONDAY }).alert, null);
  assert.equal(buildRoundup({}).alert, null);
  assert.equal(buildRoundup().alert, null);
});

// ── Only my work ────────────────────────────────────────────────────────────

test("somebody else's deal never appears in my week", () => {
  const r = buildRoundup({
    userId: ME,
    projects: [project({ id: 'theirs', salesOwnerId: THEM })],
    now: MONDAY,
  });
  assert.equal(r.alert, null);
});

test('a job I run precon on is mine even when I do not own the sale', () => {
  const r = buildRoundup({
    userId: ME,
    projects: [project({ salesOwnerId: THEM, preconManagerId: ME })],
    now: MONDAY,
  });
  assert.equal(sectionOf(r, 'awaitingSignature').count, 1);
});

test('wearing both hats on one job does not list it twice', () => {
  const r = buildRoundup({
    userId: ME,
    projects: [project({ salesOwnerId: ME, preconManagerId: ME })],
    now: MONDAY,
  });
  assert.equal(sectionOf(r, 'awaitingSignature').count, 1);
});

test("a next action assigned to someone else on my job is theirs, not mine", () => {
  // I own the deal; they own the task. The task is not my Monday problem.
  const r = buildRoundup({
    userId: ME,
    projects: [project({ proposalSentDate: null, nextActionOwnerId: THEM, nextActionDueDate: ago(3) })],
    now: MONDAY,
  });
  assert.equal(r.alert, null);
});

// ── Waiting on a signature ──────────────────────────────────────────────────

test('the longest silence is listed first', () => {
  const r = buildRoundup({
    userId: ME,
    projects: [
      project({ id: 'fresh', name: 'Fresh', proposalSentDate: ago(2) }),
      project({ id: 'stale', name: 'Stale', proposalSentDate: ago(40) }),
    ],
    now: MONDAY,
  });
  const s = sectionOf(r, 'awaitingSignature');
  assert.equal(s.items[0].id, 'stale');
  assert.equal(s.items[0].detail, '40 days');
});

test('a signed deal stops waiting on a signature', () => {
  const r = buildRoundup({
    userId: ME,
    projects: [project({ procurementStatus: 'WON' })],
    now: MONDAY,
  });
  assert.equal(r.alert, null);
});

// ── Next actions ────────────────────────────────────────────────────────────

test('overdue sorts above upcoming, and says how late it is', () => {
  const r = buildRoundup({
    userId: ME,
    projects: [
      project({ id: 'soon', name: 'Soon', proposalSentDate: null, nextActionOwnerId: ME, nextActionDueDate: from(3) }),
      project({ id: 'late', name: 'Late', proposalSentDate: null, nextActionOwnerId: ME, nextActionDueDate: ago(5) }),
    ],
    now: MONDAY,
  });
  const s = sectionOf(r, 'nextActions');
  assert.equal(s.items[0].id, 'late');
  assert.equal(s.items[0].detail, '5 days overdue');
  assert.equal(s.items[1].detail, 'due in 3 days');
});

test('an action due next month is not this Monday news', () => {
  const r = buildRoundup({
    userId: ME,
    projects: [project({ proposalSentDate: null, nextActionOwnerId: ME, nextActionDueDate: from(LOOKAHEAD_DAYS + 5) })],
    now: MONDAY,
  });
  assert.equal(r.alert, null);
});

test('the headline leads with what has already gone wrong', () => {
  const r = buildRoundup({
    userId: ME,
    projects: [
      project({ id: 'a', proposalSentDate: ago(9) }),
      project({ id: 'b', proposalSentDate: null, nextActionOwnerId: ME, nextActionDueDate: ago(2) }),
    ],
    now: MONDAY,
  });
  assert.match(r.alert.message, /1 waiting on signature/);
  assert.match(r.alert.message, /1 action overdue/, 'overdue must be named as overdue, not as "due"');
});

// ── Reminders ───────────────────────────────────────────────────────────────

const reminder = (over = {}, noteOver = {}) => ({
  id: 'a1', remindAt: from(2), remindedAt: null,
  contactName: 'Lowell Peterson', detail: 'intro to their GC',
  ...over,
  note: { id: 'n1', createdById: ME, isPublished: true, ...noteOver },
});

test('a follow-up I set for this week shows up', () => {
  const r = buildRoundup({ userId: ME, noteActions: [reminder()], now: MONDAY });
  assert.equal(sectionOf(r, 'reminders').items[0].name, 'Lowell Peterson');
});

test('a reminder that already rang the bell does not ring again in the roundup', () => {
  // The daily sweep stamps remindedAt. Without this filter the same nudge
  // arrives twice under two different names, which is exactly the nagging the
  // stamp exists to prevent.
  const r = buildRoundup({ userId: ME, noteActions: [reminder({ remindedAt: ago(1) })], now: MONDAY });
  assert.equal(r.alert, null);
});

test("a follow-up on a draft note, or on someone else's note, is not mine", () => {
  assert.equal(buildRoundup({ userId: ME, noteActions: [reminder({}, { isPublished: false })], now: MONDAY }).alert, null);
  assert.equal(buildRoundup({ userId: ME, noteActions: [reminder({}, { createdById: THEM })], now: MONDAY }).alert, null);
});

// ── News ────────────────────────────────────────────────────────────────────

const signal = (over = {}) => ({
  id: 's1', title: 'Trailhead Apartments breaks ground', publishedAt: ago(2),
  linkedClientId: 'c1', matchStatus: 'AUTO_LINKED',
  linkedProjectId: null, projectMatchStatus: 'UNREVIEWED',
  ...over,
});

test('news about a client I have a job with reaches me', () => {
  const r = buildRoundup({ userId: ME, projects: [project()], signals: [signal()], now: MONDAY });
  assert.equal(sectionOf(r, 'news').count, 1);
});

test('a guess about which job it is does not put an article in my week', () => {
  // SUGGESTED is a claim awaiting a human. Nothing unreviewed gets to assert
  // itself in a summary somebody reads as fact.
  const r = buildRoundup({
    userId: ME, projects: [project()],
    signals: [signal({ linkedClientId: null, matchStatus: 'REJECTED', linkedProjectId: 'p1', projectMatchStatus: 'SUGGESTED' })],
    now: MONDAY,
  });
  assert.equal(sectionOf(r, 'news'), undefined);
});

test('…but a confirmed job link does', () => {
  const r = buildRoundup({
    userId: ME, projects: [project()],
    signals: [signal({ linkedClientId: null, matchStatus: 'REJECTED', linkedProjectId: 'p1', projectMatchStatus: 'CONFIRMED' })],
    now: MONDAY,
  });
  assert.equal(sectionOf(r, 'news').count, 1);
});

test('last month’s news is not news', () => {
  const r = buildRoundup({
    userId: ME, projects: [project({ proposalSentDate: null })],
    signals: [signal({ publishedAt: ago(SIGNAL_WINDOW_DAYS + 1) })],
    now: MONDAY,
  });
  assert.equal(r.alert, null);
});

test('news about a client I have no job with is not my news', () => {
  const r = buildRoundup({
    userId: ME, projects: [project({ clientId: 'c1', proposalSentDate: null })],
    signals: [signal({ linkedClientId: 'c-other' })],
    now: MONDAY,
  });
  assert.equal(r.alert, null);
});

// ── Firing once a week ──────────────────────────────────────────────────────

test('the same week produces the same key, the next week a different one', () => {
  // The whole guarantee: run the job five times on Monday and the roundup
  // arrives once; run it next Monday and a new one arrives.
  const monday = buildRoundup({ userId: ME, projects: [project()], now: MONDAY });
  const tuesday = buildRoundup({ userId: ME, projects: [project()], now: from(1) });
  const nextWeek = buildRoundup({ userId: ME, projects: [project()], now: from(7) });
  assert.equal(monday.alert.dedupeKey, tuesday.alert.dedupeKey);
  assert.notEqual(monday.alert.dedupeKey, nextWeek.alert.dedupeKey);
});

test('the week key rolls over on Monday, not on Sunday', () => {
  assert.equal(weekKey(new Date('2026-08-23T23:00:00Z')), weekKey(new Date('2026-08-17T00:00:00Z')),
    'Sunday belongs to the week that started the Monday before it');
  assert.notEqual(weekKey(new Date('2026-08-24T00:00:00Z')), weekKey(new Date('2026-08-23T23:00:00Z')));
});

test('the week key survives the turn of the year', () => {
  // 2026-12-28 is a Monday in ISO week 53; 2027-01-04 is week 1 of 2027.
  assert.equal(weekKey(new Date('2026-12-28T12:00:00Z')), '2026-W53');
  assert.equal(weekKey(new Date('2027-01-04T12:00:00Z')), '2027-W01');
});

// ── Degrading ───────────────────────────────────────────────────────────────

test('a junk row does not take down the roundup', () => {
  // This runs unattended over every live row in the database.
  const r = buildRoundup({
    userId: ME,
    projects: [null, {}, project()],
    noteActions: [null, {}, { id: 'x' }],
    signals: [null, {}, { id: 'y', publishedAt: 'not a date' }],
    now: MONDAY,
  });
  assert.equal(sectionOf(r, 'awaitingSignature').count, 1);
});

test('an unparseable date is ignored, not treated as 1970', () => {
  const r = buildRoundup({
    userId: ME,
    projects: [project({ proposalSentDate: null, nextActionOwnerId: ME, nextActionDueDate: 'whenever' })],
    now: MONDAY,
  });
  assert.equal(r.alert, null, 'a bad date must not become an action 20,000 days overdue');
});

test('a long list is capped, and says how much it is hiding', () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    project({ id: `p${i}`, name: `Job ${i}`, proposalSentDate: ago(i + 1) }));
  const s = sectionOf(buildRoundup({ userId: ME, projects: many, now: MONDAY }), 'awaitingSignature');
  assert.equal(s.count, 10, 'the count is the truth');
  assert.equal(s.items.length, 6);
  assert.equal(s.more, 4, 'a silently truncated list reads as a complete one');
});
