/**
 * Pins the "most relevant" rule for the news tab (Mike 10-8: client match,
 * project match, then new development or renovation; place does not matter;
 * non-project articles are not wanted at all). When the rule changes, change
 * these on purpose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relevanceScore, rankByRelevance, PROJECT_ONLY } from '../../src/lib/market-intel/relevance.js';

const NOW  = Date.parse('2026-10-08T12:00:00Z');
const base = { publishedAt: '2026-10-08T00:00:00Z', unitCount: null, signalType: 'NEWS', projectRelated: true, matchStatus: 'UNREVIEWED', projectMatchStatus: 'UNREVIEWED', assignedToId: null, supersededById: null };
const OLD  = '2024-01-01T00:00:00Z';

test('a fresh article about nobody scores zero', () => {
  assert.equal(relevanceScore(base, NOW), 0);
});

test('tier 1: an old article about our client beats anything that is not', () => {
  const oldClient  = relevanceScore({ ...base, matchStatus: 'AUTO_LINKED', publishedAt: OLD }, NOW);
  const bestOther  = relevanceScore({ ...base, projectMatchStatus: 'CONFIRMED', signalType: 'NEW_DEVELOPMENT', unitCount: 5000, assignedToId: 'u1' }, NOW);
  assert.ok(oldClient > bestOther);
  assert.equal(relevanceScore({ ...base, matchStatus: 'CONFIRMED' }, NOW), relevanceScore({ ...base, matchStatus: 'AUTO_LINKED' }, NOW));
});

test('tier 2: an old article about our job beats a fresh groundbreaking about nobody', () => {
  const oldJob = relevanceScore({ ...base, projectMatchStatus: 'CONFIRMED', publishedAt: OLD }, NOW);
  const fresh  = relevanceScore({ ...base, signalType: 'NEW_DEVELOPMENT', unitCount: 5000, assignedToId: 'u1' }, NOW);
  assert.ok(oldJob > fresh);
  assert.equal(relevanceScore({ ...base, projectMatchStatus: 'REJECTED' }, NOW), 0);
});

test('a confirmed job beats a guessed client, and a guessed client beats a guessed job', () => {
  const job     = relevanceScore({ ...base, projectMatchStatus: 'CONFIRMED' }, NOW);
  const client  = relevanceScore({ ...base, matchStatus: 'SUGGESTED' }, NOW);
  const jobSugg = relevanceScore({ ...base, projectMatchStatus: 'SUGGESTED' }, NOW);
  assert.ok(job > client && client > jobSugg && jobSugg > 0);
});

test('tier 3: new development and renovation lead, then financing, acquisition, award, plain news', () => {
  const at = t => relevanceScore({ ...base, signalType: t }, NOW);
  assert.equal(at('NEW_DEVELOPMENT'), at('RENOVATION'));
  assert.equal(at('GROUNDBREAKING'), at('NEW_DEVELOPMENT'));
  assert.ok(at('NEW_DEVELOPMENT') > at('FINANCING') && at('FINANCING') > at('ACQUISITION') && at('ACQUISITION') > at('DEVELOPER_AWARD') && at('DEVELOPER_AWARD') > at('NEWS'));
});

test('units and assignment are small tie-breakers', () => {
  assert.equal(relevanceScore({ ...base, unitCount: 95 }, NOW), 9);
  assert.equal(relevanceScore({ ...base, unitCount: 5000 }, NOW), 10);
  assert.equal(relevanceScore({ ...base, assignedToId: 'u1' }, NOW), 5);
});

test('age costs a point a week, capped at half a year', () => {
  assert.equal(relevanceScore({ ...base, publishedAt: '2026-09-10T00:00:00Z' }, NOW), -4);
  assert.equal(relevanceScore({ ...base, publishedAt: OLD }, NOW), -26);
  assert.equal(relevanceScore({ ...base, publishedAt: null }, NOW), 0);
});

test('a superseded article sinks below everything, and a non-project article sinks below that', () => {
  const top = relevanceScore({ ...base, matchStatus: 'CONFIRMED', projectMatchStatus: 'CONFIRMED', signalType: 'NEW_DEVELOPMENT', unitCount: 400, assignedToId: 'u1' }, NOW);
  const sup = relevanceScore({ ...base, matchStatus: 'CONFIRMED', projectMatchStatus: 'CONFIRMED', supersededById: 'p1' }, NOW);
  const non = relevanceScore({ ...base, matchStatus: 'CONFIRMED', projectMatchStatus: 'CONFIRMED', projectRelated: false }, NOW);
  assert.ok(top > 1000 && sup < 0 && non < sup);
});

test('not screened yet counts as a project article', () => {
  assert.equal(relevanceScore({ ...base, projectRelated: null }, NOW), relevanceScore(base, NOW));
});

test('ranking puts the highest score first and breaks ties newest first', () => {
  const rows = [
    { id: 'old-plain',  ...base, publishedAt: '2026-10-01T00:00:00Z' },
    { id: 'new-plain',  ...base },
    { id: 'client',     ...base, matchStatus: 'AUTO_LINKED', publishedAt: '2026-08-01T00:00:00Z' },
  ];
  assert.deepEqual(rankByRelevance(rows, NOW), ['client', 'new-plain', 'old-plain']);
});

test('the project-only filter keeps true and null, never false', () => {
  assert.deepEqual(PROJECT_ONLY, { OR: [{ projectRelated: true }, { projectRelated: null }] });
});

test('city filings (Mike 10-17): earlier stage first, a named developer or buyer adds 10', () => {
  const at = (kind, extra = {}) => relevanceScore({ ...base, signalType: 'PERMIT', kind, ...extra }, NOW);
  assert.equal(at('LAND'), 40);
  assert.equal(at('CONCEPT'), 35);
  assert.equal(at('COUNCIL'), 30);
  assert.equal(at('PERMIT'), 10);
  assert.equal(at('CONCEPT', { _count: { feedback: 0, tags: 2 } }), 45);
  // Everything below the match tiers stays under 100, so a client match still wins.
  const best  = at('LAND', { unitCount: 900, assignedToId: 'u1', _count: { feedback: 0, tags: 1 } });
  assert.ok(best < 100);
  assert.ok(at('PERMIT', { matchStatus: 'SUGGESTED', publishedAt: OLD }) > best);
  // Articles keep their own type points.
  assert.equal(relevanceScore({ ...base, kind: 'ARTICLE', signalType: 'NEW_DEVELOPMENT' }, NOW), 15);
});
