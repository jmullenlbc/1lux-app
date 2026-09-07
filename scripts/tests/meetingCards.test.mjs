/**
 * Weekly Meeting card catalog — the layout rules.
 *
 * The screen is shared (Maram runs the meeting), so a bad layout is not one
 * person's problem. These cover the ways a saved layout can arrive wrong:
 * stale keys from a card that was renamed, a card that needs a field the app
 * does not have yet, duplicates from a double-click, and an empty list.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEETING_CARDS, QUIET_AFTER_DAYS,
  defaultLayout, normalizeLayout, availableCardKeys, getCard,
} from '../../src/lib/meeting/cards.js';

test('every card has a key, title and subtitle, and keys are unique', () => {
  const keys = new Set();
  for (const c of MEETING_CARDS) {
    assert.ok(c.key, 'card is missing a key');
    assert.ok(c.title, `${c.key} is missing a title`);
    assert.ok(c.subtitle, `${c.key} is missing a subtitle`);
    assert.equal(typeof c.showsOwner, 'boolean', `${c.key} must say whether it shows an owner`);
    assert.ok(!keys.has(c.key), `duplicate card key ${c.key}`);
    keys.add(c.key);
  }
});

test('the default set is non-empty and only contains buildable cards', () => {
  const def = defaultLayout();
  assert.ok(def.length > 0);
  for (const key of def) {
    assert.ok(!getCard(key).needs, `${key} is in the default set but is not built yet`);
  }
});

test('a card that needs a missing field can never be switched on', () => {
  const notYet = MEETING_CARDS.filter(c => c.needs).map(c => c.key);
  assert.ok(notYet.length > 0, 'expected some cards to be waiting on a field');
  for (const key of notYet) {
    assert.ok(!availableCardKeys().includes(key));
    assert.ok(!normalizeLayout([key, 'nextActions']).includes(key));
  }
});

test('unknown keys are dropped rather than rendering a blank card', () => {
  const out = normalizeLayout(['nextActions', 'somethingRenamedLastYear', 'flagged']);
  assert.deepEqual(out, ['nextActions', 'flagged']);
});

test('duplicates collapse, and the chosen order is kept exactly', () => {
  const out = normalizeLayout(['flagged', 'nextActions', 'flagged', 'awaitingSignature']);
  assert.deepEqual(out, ['flagged', 'nextActions', 'awaitingSignature']);
});

test('an empty or junk layout falls back to the default set, never a blank screen', () => {
  assert.deepEqual(normalizeLayout([]), defaultLayout());
  assert.deepEqual(normalizeLayout(null), defaultLayout());
  assert.deepEqual(normalizeLayout('nextActions'), defaultLayout());
  assert.deepEqual(normalizeLayout(['nope', 'alsoNope']), defaultLayout());
});

test('the quiet threshold is the measured one, not a round guess', () => {
  // 60 days came out of four years of Mike's calendar: 90% of gaps a relationship
  // survived were 70 days or less, and a 30-day line would flag ~19% of his
  // completely normal two-week rhythm. If someone edits this, the number should
  // move because the data moved.
  assert.equal(QUIET_AFTER_DAYS, 60);
});
