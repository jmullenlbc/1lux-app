// Maram's weekly meeting agenda cards (Oct 5 call).
// Run: node --test scripts/tests/meetingAgendaCards.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MEETING_CARDS, getCard, defaultLayout, cardLevel, availableCardKeys } from '../../src/lib/meeting/cards.js';

const AGENDA = [
  'newOpportunities', 'newLeads', 'introductions', 'ownership',
  'nextActions', 'clientFollowUps', 'deadlines', 'blockers',
];
const NEW = ['newOpportunities', 'introductions', 'ownership', 'clientFollowUps', 'deadlines', 'blockers'];

test('every agenda card exists in the catalog and is buildable', () => {
  const available = new Set(availableCardKeys());
  for (const key of AGENDA) {
    const card = getCard(key);
    assert.ok(card, `${key} is in the catalog`);
    assert.ok(!card.needs, `${key} does not say "needs"`);
    assert.ok(available.has(key), `${key} can be switched on`);
    assert.equal(typeof card.showsOwner, 'boolean');
  }
});

test('the new cards are on by default', () => {
  for (const key of NEW) assert.equal(getCard(key).defaultOn, true, key);
});

test('the default layout starts with the agenda, in order', () => {
  const layout = defaultLayout();
  assert.deepEqual(layout.slice(0, AGENDA.length), AGENDA);
  assert.ok(layout.length > AGENDA.length, 'the older cards follow');
});

test('introductions is a people-level card; the rest are project-level', () => {
  assert.equal(cardLevel('introductions'), 'people');
  for (const key of ['newOpportunities', 'ownership', 'clientFollowUps', 'deadlines', 'blockers']) {
    assert.equal(cardLevel(key), 'project', key);
  }
});

test('no duplicate keys crept in while reordering', () => {
  const keys = MEETING_CARDS.map(c => c.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('subtitles use plain punctuation, no dashes', () => {
  for (const key of NEW) {
    const { title, subtitle } = getCard(key);
    assert.ok(!/[–—]|--/.test(`${title} ${subtitle}`), `${key} has no em or en dash`);
  }
});
