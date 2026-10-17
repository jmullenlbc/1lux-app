// "Looks like [Project X]" and the fill-blanks-only merge.
//
// These pin Mike's rules (2026-09-12), not the implementation:
//   • a guess needs the name to match AND one more thing to agree, unless the
//     names are identical and unusual;
//   • "The Apartments" in the same city is not a match;
//   • linking never overwrites what the job already says unless a person picks
//     the request's answer for that one field;
//   • the job's name is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanJobName, findLikelyProject } from '../../src/lib/intake/duplicateMatch.js';
import { planMerge, applyMerge } from '../../src/lib/intake/mergeRequest.js';

const JOBS = [
  { id: 'p1', name: 'Trailhead Apartments', city: 'Denver', state: 'CO', clientId: 'c1', contactEmail: 'pm@acme.com' },
  { id: 'p2', name: 'Park Place',           city: 'Austin', state: 'TX', clientId: 'c2', contactEmail: null },
  { id: 'p3', name: 'Sheridan + Colfax',    city: 'Lakewood', state: 'CO', clientId: null, contactEmail: null },
];

// ── Names ────────────────────────────────────────────────────────────────────

test('cleanJobName drops the kind-of-building words', () => {
  assert.equal(cleanJobName('Trailhead Apartments, LLC'), 'trailhead');
  assert.equal(cleanJobName('The Residences at Main'), 'main');
  assert.equal(cleanJobName('Sheridan & Colfax'), 'sheridan colfax');
  assert.equal(cleanJobName(null), '');
});

// ── The guess ────────────────────────────────────────────────────────────────

test('same name + same city is a match, with a plain-English reason', () => {
  const m = findLikelyProject({ proposedName: 'Trailhead', city: 'denver', state: 'co', submitterDomain: 'other.com' }, JOBS);
  assert.equal(m.projectId, 'p1');
  assert.match(m.reason, /same name/);
  assert.match(m.reason, /same city \(Denver, CO\)/);
});

test('same email domain counts as the second thing agreeing', () => {
  const m = findLikelyProject({ proposedName: 'Trailhead North', city: 'Boulder', state: 'CO', submitterEmail: 'jo@ACME.com' }, JOBS);
  assert.equal(m.projectId, 'p1');
  assert.match(m.reason, /similar name/);
  assert.match(m.reason, /@acme\.com/);
});

test('an identical, unusual name matches on its own', () => {
  const m = findLikelyProject({ proposedName: 'Sheridan and Colfax', city: 'Denver', state: 'CO' }, JOBS);
  assert.equal(m?.projectId, 'p3');
});

test('a similar name with nothing else agreeing is not a match', () => {
  assert.equal(findLikelyProject({ proposedName: 'Trailhead Commons', city: 'Boise', state: 'ID', submitterDomain: 'x.com' }, JOBS), null);
});

test('a plain name is never a match on the name alone', () => {
  // "Park" is inside "Park Place" but is far too common to mean anything.
  assert.equal(findLikelyProject({ proposedName: 'Park', city: 'Austin', state: 'TX' }, JOBS), null);
  assert.equal(findLikelyProject({ proposedName: 'The Apartments', city: 'Denver', state: 'CO' }, JOBS), null);
});

test('same city and company but a different name is two jobs, not one', () => {
  assert.equal(findLikelyProject({ proposedName: 'Riverbend', city: 'Denver', state: 'CO', clientId: 'c1', submitterDomain: 'acme.com' }, JOBS), null);
});

test('whole words only: "Trail" does not match "Trailhead"', () => {
  assert.equal(findLikelyProject({ proposedName: 'Trail Ridge', city: 'Denver', state: 'CO' }, JOBS), null);
});

test('empty inputs are safe', () => {
  assert.equal(findLikelyProject({ proposedName: '' }, JOBS), null);
  assert.equal(findLikelyProject({ proposedName: 'Trailhead' }, []), null);
  assert.equal(findLikelyProject(null, JOBS), null);
});

// ── The merge ────────────────────────────────────────────────────────────────

const JOB = { name: 'Trailhead', city: 'Denver', state: 'CO', zip: null, contactName: 'Pat', contactEmail: null, clientId: null, buildingType: 'garden', location: 'Denver, CO' };
const REQ = { proposedName: 'Trailhead Apts', city: 'Denver', state: 'CO', zip: '80202', submitterName: 'Jo Smith', submitterEmail: 'Jo@Acme.com', clientId: 'c1', buildingType: 'wrap' };

test('planMerge sorts every field into fill / same / conflict', () => {
  const plan = Object.fromEntries(planMerge(JOB, REQ).map(r => [r.field, r.kind]));
  assert.deepEqual(plan, {
    clientId: 'fill', contactName: 'conflict', contactEmail: 'fill',
    city: 'same', state: 'same', zip: 'fill', buildingType: 'conflict',
  });
});

test('the job name is never part of the merge', () => {
  assert.ok(!planMerge(JOB, REQ).some(r => r.field === 'name'));
});

test('with no choices, blanks fill and every conflict keeps the job’s answer', () => {
  const { data, filled, replaced, kept } = applyMerge(planMerge(JOB, REQ), {}, JOB);
  assert.deepEqual(data, { clientId: 'c1', contactEmail: 'jo@acme.com', zip: '80202' });
  assert.deepEqual(filled, ['Company', 'Contact email', 'Zip']);
  assert.deepEqual(replaced, []);
  assert.deepEqual(kept, ['Contact name', 'Building type']);
});

test('a conflict is only replaced when a person picks the request', () => {
  const { data, replaced } = applyMerge(planMerge(JOB, REQ), { contactName: 'request' }, JOB);
  assert.equal(data.contactName, 'Jo Smith');
  assert.equal(data.buildingType, undefined);
  assert.deepEqual(replaced, ['Contact name (was “Pat”)']);
});

test('the one-line location follows a filled-in city, but never a hand-typed one', () => {
  const blankJob = { ...JOB, city: null, state: null, location: null };
  assert.equal(applyMerge(planMerge(blankJob, REQ), {}, blankJob).data.location, 'Denver, CO');
  const typedJob = { ...JOB, city: null, state: null, location: 'Near the lake' };
  assert.equal(applyMerge(planMerge(typedJob, REQ), {}, typedJob).data.location, undefined);
});
