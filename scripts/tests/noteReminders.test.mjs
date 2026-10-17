/**
 * Tests for what a due sales-note reminder decides to do.
 *
 * The bug these exist to prevent is the one that was already in the product:
 * `NoteAction.remindAt` was written in three places and read in zero, so every
 * reminder the bot ever set silently did nothing. Now that something reads it,
 * the failure mode flips, a sweep that runs daily against a date that stays in
 * the past will nudge the same person about the same thing every morning until
 * they stop trusting the bell. Most of what is pinned below is about firing
 * exactly once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planNoteReminder, MAX_LATE_DAYS } from '../../src/lib/noteReminders.js';

const NOW = new Date('2026-08-22T14:00:00.000Z');
const DAY = 86400_000;
const ago = days => new Date(NOW.getTime() - days * DAY);

/** A due, publishable action belonging to a published note written by u1. */
function action(over = {}, noteOver = {}) {
  return {
    id: 'act1',
    remindAt: ago(1),
    contactName: 'Lowell Peterson',
    detail: 'expect an intro to their GC',
    ...over,
    note: { id: 'note1', createdById: 'u1', isPublished: true, ...noteOver },
  };
}

// ── Who hears about it ──────────────────────────────────────────────────────

test('a due reminder goes to whoever wrote the note', () => {
  const plan = planNoteReminder(action(), { now: NOW });
  assert.equal(plan.do, 'send');
  assert.equal(plan.alert.userId, 'u1');
  assert.equal(plan.alert.type, 'NOTE_REMINDER');
});

test('a note reverted to draft is left alone, not stamped', () => {
  // Someone is reworking it right now. Nudging is nagging, and stamping would
  // throw the reminder away for good, so this must be a skip and not a stale.
  const plan = planNoteReminder(action({}, { isPublished: false }), { now: NOW });
  assert.equal(plan.do, 'skip');
});

test('a note with no author is skipped rather than thrown away', () => {
  // There is nobody to tell, but that is a data problem. Stamping it would hide
  // the problem permanently; skipping leaves it visible in tomorrow's sweep.
  const plan = planNoteReminder(action({}, { createdById: null }), { now: NOW });
  assert.equal(plan.do, 'skip');
});

// ── When it fires ───────────────────────────────────────────────────────────

test('a reminder set for the future does not fire early', () => {
  // The query filters on remindAt too, but a planner that trusts its caller's
  // WHERE clause is one refactor away from nudging everyone about everything.
  assert.equal(planNoteReminder(action({ remindAt: new Date(NOW.getTime() + DAY) }), { now: NOW }).do, 'skip');
});

test('a reminder due this second fires', () => {
  assert.equal(planNoteReminder(action({ remindAt: NOW }), { now: NOW }).do, 'send');
});

test('a long-overdue reminder is retired quietly instead of surfacing as news', () => {
  const plan = planNoteReminder(action({ remindAt: ago(MAX_LATE_DAYS + 1) }), { now: NOW });
  assert.equal(plan.do, 'stale', 'a three-month-old nudge must not arrive looking new');
  assert.equal(plan.alert, undefined, 'stale means tell nobody');
});

test('the stale line is a boundary, not a cliff a real reminder falls off', () => {
  assert.equal(planNoteReminder(action({ remindAt: ago(MAX_LATE_DAYS - 1) }), { now: NOW }).do, 'send');
  assert.equal(planNoteReminder(action({ remindAt: ago(MAX_LATE_DAYS + 1) }), { now: NOW }).do, 'stale');
});

test('a missing or unparseable date is skipped, never treated as due', () => {
  // `new Date(null)` is the epoch, which is due, and 56 years stale. A row with
  // no date must not silently become a reminder about 1970.
  assert.equal(planNoteReminder(action({ remindAt: null }), { now: NOW }).do, 'skip');
  assert.equal(planNoteReminder(action({ remindAt: 'next tuesday' }), { now: NOW }).do, 'skip');
});

test('a date stored as a string still fires', () => {
  // Prisma hands back Date objects; a hand-built row or a JSON round-trip does
  // not. Both are the same reminder.
  assert.equal(planNoteReminder(action({ remindAt: ago(1).toISOString() }), { now: NOW }).do, 'send');
});

// ── Firing exactly once ─────────────────────────────────────────────────────

test('the dedupe key is the action, not the day', () => {
  // If the key carried a date, tomorrow's sweep would be a fresh key and the
  // same reminder would ring again, which is the exact failure the stamp and
  // the key exist to prevent, arriving through the back door.
  const plan = planNoteReminder(action(), { now: NOW });
  const later = planNoteReminder(action(), { now: new Date(NOW.getTime() + 5 * DAY) });
  assert.equal(plan.alert.dedupeKey, 'noteAction:act1:reminder');
  assert.equal(later.alert.dedupeKey, plan.alert.dedupeKey,
    'the same reminder must produce the same key on any day');
});

test('two reminders never share a key', () => {
  const a = planNoteReminder(action({ id: 'act1' }), { now: NOW });
  const b = planNoteReminder(action({ id: 'act2' }), { now: NOW });
  assert.notEqual(a.alert.dedupeKey, b.alert.dedupeKey);
});

// ── What it says ────────────────────────────────────────────────────────────

test('the nudge names whoever it is about, falling back through what the bot knows', () => {
  const named = n => planNoteReminder(action(n), { now: NOW }).alert.title;
  assert.equal(named({}), 'Reminder: Lowell Peterson');
  assert.equal(named({ contactName: null, targetName: 'Dana' }), 'Reminder: Dana');
  assert.equal(named({ contactName: null, targetName: null, company: 'Zocalo' }), 'Reminder: Zocalo');
  assert.equal(named({ contactName: null, targetName: null, company: null }), 'Reminder: a contact',
    '"Reminder:" with nothing after it reads as a bug, not as a reminder');
});

test('the nudge falls back to the raw sentence before giving up', () => {
  const plan = planNoteReminder(action({ detail: null, rawText: 'follow up w/ Lowell re: GC intro' }), { now: NOW });
  assert.equal(plan.alert.message, 'follow up w/ Lowell re: GC intro');
});

test('a runaway note does not put a wall of text in the bell', () => {
  const plan = planNoteReminder(action({ detail: 'x'.repeat(5000) }), { now: NOW });
  assert.equal(plan.alert.message.length, 400);
});

test('clicking the reminder lands on the note it came from', () => {
  const plan = planNoteReminder(action({}, { id: 'note42' }), { now: NOW });
  assert.equal(plan.alert.link, '/sales/desk');
});

test('a junk row is refused rather than crashing the sweep', () => {
  // One bad row must not take down the other 499 in the batch.
  for (const junk of [null, undefined, {}, { id: null }]) {
    assert.equal(planNoteReminder(junk, { now: NOW }).do, 'skip');
  }
});
