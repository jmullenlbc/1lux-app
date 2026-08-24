/**
 * Tests for tagging a news article with one of OUR jobs.
 *
 * The asymmetry that shapes every test here: a MISSED link costs a question
 * going unanswered, and a WRONG link costs a stranger's groundbreaking sitting
 * on our project's record looking authoritative. Nobody re-reads a record they
 * believe is correct, so a wrong link is close to permanent. Most of what
 * follows pins the refusals, not the matches.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchProject, isDistinctiveEnough, TOO_GENERIC } from '../../src/lib/market-intel/project-matcher.js';

const PROJECTS = [
  { id: 'p1', name: 'Trailhead Apartments', clientId: 'c1' },
  { id: 'p2', name: 'The Approach',         clientId: 'c2' },
  { id: 'p3', name: 'Creekside',            clientId: 'c1' },
  { id: 'p4', name: 'The Residences',       clientId: 'c3' },
];

// ── It finds the job when the job is genuinely named ────────────────────────

test('an article naming a job links to it', () => {
  const m = matchProject('Trailhead Apartments breaks ground in Lakewood', PROJECTS);
  assert.equal(m.projectId, 'p1');
});

test('the client agreeing is what turns a guess into a link', () => {
  // Two independent things pointing at the same job. On the name alone this is
  // a claim for a human to confirm; with the client it is evidence.
  const alone = matchProject('Trailhead Apartments breaks ground', PROJECTS);
  const withClient = matchProject('Trailhead Apartments breaks ground', PROJECTS, { matchedClientId: 'c1' });
  assert.equal(alone.status, 'SUGGESTED');
  assert.equal(withClient.status, 'AUTO_LINKED');
  assert.ok(withClient.score > alone.score);
});

test('the name is found however the sentence is punctuated', () => {
  // The article and our database are normalized the same way, so legal suffixes
  // and punctuation cannot hide a name that is plainly there.
  for (const text of [
    'Trailhead Apartments, LLC secured financing',
    'financing closed for TRAILHEAD APARTMENTS.',
    'A groundbreaking at "Trailhead Apartments" was held Tuesday',
  ]) {
    assert.equal(matchProject(text, PROJECTS)?.projectId, 'p1', text);
  }
});

// ── It refuses when the evidence is only a common word ──────────────────────

test('a short project name cannot claim an article on its own', () => {
  // "Creekside" appears in industry news constantly and is almost never ours.
  assert.equal(matchProject('Creekside development opens in Ohio', PROJECTS), null);
});

test('…but the same short name links once the client agrees', () => {
  // This is the whole point of the lower bar: the coincidence has to be much
  // larger to still be a coincidence.
  const m = matchProject('Creekside development opens', PROJECTS, { matchedClientId: 'c1' });
  assert.equal(m.projectId, 'p3');
  assert.equal(m.status, 'AUTO_LINKED');
});

test('a name every developer uses never matches by itself', () => {
  assert.equal(matchProject('The Residences at Lakewood opened Monday', PROJECTS), null);
  for (const generic of ['phase 2', 'the reserve', 'senior living', 'main street']) {
    assert.equal(isDistinctiveEnough(generic), false, generic);
    assert.ok(TOO_GENERIC.has(generic));
  }
});

test('a name is matched as whole words, not as a substring', () => {
  // The regression: "Lowell" inside "Lowellville" is not our job in Lowell.
  const projects = [{ id: 'p9', name: 'Lowell Crossing', clientId: 'c1' }];
  assert.equal(matchProject('Lowell Crossingfield announces', projects), null);
  assert.equal(matchProject('preleasing at Lowell Crossing begins', projects)?.projectId, 'p9');
});

test('an article naming nobody we know links to nobody', () => {
  assert.equal(matchProject('Greystar closes on a Dallas portfolio', PROJECTS), null);
});

test('junk in does not throw', () => {
  // This runs inside a poll over arbitrary scraped web pages. It must degrade.
  for (const bad of [null, undefined, '', '   ']) {
    assert.equal(matchProject(bad, PROJECTS), null);
  }
  assert.equal(matchProject('Trailhead Apartments', null), null);
  assert.equal(matchProject('Trailhead Apartments', []), null);
  assert.equal(matchProject('Trailhead Apartments', [{ id: 'x', name: null }]), null);
});

// ── Picking between two of ours ─────────────────────────────────────────────

test('the client we already matched wins over a longer name we did not', () => {
  const projects = [
    { id: 'a', name: 'Riverbend Apartments Phase Two', clientId: 'cX' },
    { id: 'b', name: 'Trailhead Apartments',           clientId: 'c1' },
  ];
  const text = 'Riverbend Apartments Phase Two and Trailhead Apartments both broke ground';
  assert.equal(matchProject(text, projects, { matchedClientId: 'c1' }).projectId, 'b');
});

test('with no client to go on, the more specific name wins', () => {
  // "Trailhead Apartments" contains "Trailhead". Returning the shorter one
  // would be picking the vaguer of two readings of the same evidence.
  const projects = [
    { id: 'short', name: 'Trailhead',            clientId: 'cA' },
    { id: 'long',  name: 'Trailhead Apartments', clientId: 'cB' },
  ];
  assert.equal(matchProject('Trailhead Apartments breaks ground', projects).projectId, 'long');
});

test('the same article gives the same answer twice', () => {
  // Ordering that depends on the project list's order would make a link appear
  // and disappear between polls for no visible reason.
  const shuffled = [...PROJECTS].reverse();
  const text = 'Trailhead Apartments breaks ground';
  assert.deepEqual(matchProject(text, PROJECTS), matchProject(text, shuffled));
});

// ── The distinctiveness rule itself ─────────────────────────────────────────

test('one short word is never distinctive, however exactly it matches', () => {
  assert.equal(isDistinctiveEnough('lowell'), false);
  assert.equal(isDistinctiveEnough('trailhead'), false, 'nine letters of ordinary English is not a claim');
  assert.equal(isDistinctiveEnough('winterhaven'), true);
});

test('two words clear a lower bar than one', () => {
  assert.equal(isDistinctiveEnough('the approach'), true);
  assert.equal(isDistinctiveEnough('oak row'), false, 'short even for two words');
});

test('the client agreeing lowers the bar but does not remove it', () => {
  assert.equal(isDistinctiveEnough('lowell', true), true);
  assert.equal(isDistinctiveEnough('oak', true), false, 'three letters is noise in any context');
  assert.equal(isDistinctiveEnough('phase 2', true), false, 'generic stays generic');
});
