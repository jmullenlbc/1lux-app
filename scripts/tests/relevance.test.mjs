/**
 * Pins the first-cut "most relevant" rule for the news tab. When the rule
 * changes, change these on purpose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relevanceScore, rankByRelevance } from '../../src/lib/market-intel/relevance.js';

const NOW  = Date.parse('2026-10-08T12:00:00Z');
const base = { publishedAt: '2026-10-08T00:00:00Z', unitCount: null, signalType: 'NEWS', matchStatus: 'UNREVIEWED', projectMatchStatus: 'UNREVIEWED', assignedToId: null, supersededById: null };

test('a fresh article about nobody scores zero', () => {
  assert.equal(relevanceScore(base, NOW), 0);
});

test('our client beats a suggestion beats a stranger', () => {
  const linked    = relevanceScore({ ...base, matchStatus: 'AUTO_LINKED' }, NOW);
  const confirmed = relevanceScore({ ...base, matchStatus: 'CONFIRMED' }, NOW);
  const suggested = relevanceScore({ ...base, matchStatus: 'SUGGESTED' }, NOW);
  assert.equal(linked, confirmed);
  assert.ok(linked > suggested && suggested > 0);
});

test('one of our jobs counts, and a rejected match counts for nothing', () => {
  assert.ok(relevanceScore({ ...base, projectMatchStatus: 'CONFIRMED' }, NOW) > 0);
  assert.equal(relevanceScore({ ...base, projectMatchStatus: 'REJECTED' }, NOW), 0);
});

test('units add up to a cap', () => {
  assert.equal(relevanceScore({ ...base, unitCount: 95 }, NOW), 9);
  assert.equal(relevanceScore({ ...base, unitCount: 5000 }, NOW), 30);
});

test('age costs a point a week, capped at half a year', () => {
  assert.equal(relevanceScore({ ...base, publishedAt: '2026-09-10T00:00:00Z' }, NOW), -4);
  assert.equal(relevanceScore({ ...base, publishedAt: '2024-01-01T00:00:00Z' }, NOW), -26);
  assert.equal(relevanceScore({ ...base, publishedAt: null }, NOW), 0);
});

test('an article a permit has replaced sinks below everything', () => {
  const big = relevanceScore({ ...base, matchStatus: 'CONFIRMED', projectMatchStatus: 'CONFIRMED', unitCount: 400, signalType: 'GROUNDBREAKING', assignedToId: 'u1' }, NOW);
  assert.ok(relevanceScore({ ...base, supersededById: 'p1' }, NOW) < -50);
  assert.ok(big > 100);
});

test('ranking puts the highest score first and breaks ties newest first', () => {
  const rows = [
    { id: 'old-plain',  ...base, publishedAt: '2026-10-01T00:00:00Z' },
    { id: 'new-plain',  ...base },
    { id: 'client',     ...base, matchStatus: 'AUTO_LINKED', publishedAt: '2026-08-01T00:00:00Z' },
  ];
  assert.deepEqual(rankByRelevance(rows, NOW), ['client', 'new-plain', 'old-plain']);
});
