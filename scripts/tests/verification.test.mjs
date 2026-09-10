// Things Needing a Look — the five checks and the two ceilings.
//
// These pin the promises made to Mike, not the implementation:
//   • it only looks at open jobs and jobs closed in the last 90 days;
//   • at most five items on screen;
//   • at most five NEW ones surfaced in a week;
//   • "That's fine" buries an item for good;
//   • "DLR Group, Inc." and "DLR Group" are the same company, and a card that
//     said otherwise would be worthless.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCompany, companiesAgree, inScope, runChecks, selectItems, startOfWeek,
  checkTeamMismatch, checkCloseDate, checkNoLead, checkDuplicateEmail, checkPersonNoCompany,
  SCOPE_DAYS, WEEKLY_NEW_LIMIT, VISIBLE_LIMIT,
} from '../../src/lib/verification/checks.js';

const NOW = new Date('2026-09-10T12:00:00');           // a Thursday
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);

function project(over = {}) {
  return {
    id: 'p1', name: 'Trailhead', clientId: 'c1', serviceType: 'PROCUREMENT',
    procurementStatus: 'OPEN', designStatus: 'OPEN',
    updatedAt: NOW, architect: null, generalContractor: null, contactLinks: [],
    ...over,
  };
}

// ── Company names ────────────────────────────────────────────────────────────

test('normalizeCompany strips legal suffixes and trade words', () => {
  assert.equal(normalizeCompany('DLR Group, Inc.'), 'dlr');
  assert.equal(normalizeCompany('DLR Group'), 'dlr');
  assert.equal(normalizeCompany('Shears Adkins Rockmore Architects'), 'shears adkins rockmore');
  assert.equal(normalizeCompany(null), '');
});

test('a name made only of noise words keeps its own shape', () => {
  // "The Design Group" must not collapse to "" and then match everything else
  // that also collapsed to "".
  assert.equal(normalizeCompany('The Design Group'), 'thedesigngroup');
  assert.equal(companiesAgree('The Design Group', 'The Building Company'), false);
});

test('companiesAgree is generous about the same company written two ways', () => {
  assert.equal(companiesAgree('DLR Group, Inc.', 'DLR Group'), true);
  assert.equal(companiesAgree('Shears Adkins', 'Shears Adkins Rockmore'), true);
  assert.equal(companiesAgree('Milender White', 'Milender White Construction'), true);
  assert.equal(companiesAgree('Saunders & Co', 'Saunders and Company'), true);
});

test('companiesAgree still catches a real disagreement', () => {
  assert.equal(companiesAgree('DLR Group', 'Gensler'), false);
  assert.equal(companiesAgree('Milender White', 'Swinerton Builders'), false);
});

test('a blank on either side is a gap, not a disagreement', () => {
  assert.equal(companiesAgree('', 'Gensler'), true);
  assert.equal(companiesAgree('Gensler', null), true);
});

// ── Scope ────────────────────────────────────────────────────────────────────

test('an open job is always in scope', () => {
  assert.equal(inScope(project(), new Map(), NOW), true);
});

test('a job closed inside 90 days is in scope, outside it is not', () => {
  const recent = project({ id: 'r', procurementStatus: 'WON' });
  const stale  = project({ id: 's', procurementStatus: 'WON' });
  const events = new Map([
    ['r', [{ pipeline: 'PROCUREMENT', toStatus: 'WON', changedAt: daysAgo(30) }]],
    ['s', [{ pipeline: 'PROCUREMENT', toStatus: 'WON', changedAt: daysAgo(SCOPE_DAYS + 5) }]],
  ]);
  assert.equal(inScope(recent, events, NOW), true);
  assert.equal(inScope(stale,  events, NOW), false);
});

test('a closed job with no history at all falls back to when it was touched', () => {
  // Otherwise the missing close date we are hunting for would rule the job out
  // of scope by being missing.
  const p = project({ procurementStatus: 'LOST', updatedAt: daysAgo(10) });
  assert.equal(inScope(p, new Map(), NOW), true);
  const old = project({ procurementStatus: 'LOST', updatedAt: daysAgo(SCOPE_DAYS + 1) });
  assert.equal(inScope(old, new Map(), NOW), false);
});

// ── Check 1: the two architects ──────────────────────────────────────────────

const seat = (name) => ({ id: 'x', name });

test('check 1 flags a Pipeline tab that disagrees with the project team', () => {
  const items = checkTeamMismatch({
    projects: [project({ architect: seat('Gensler') })],
    pipelineRows: [{ clientId: 'c1', name: 'Trailhead', architect: 'DLR Group', gc: null }],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'TEAM_MISMATCH');
  assert.equal(items[0].key, 'team_mismatch:p1:architect');
});

test('check 1 stays quiet when the two are the same company spelled differently', () => {
  const items = checkTeamMismatch({
    projects: [project({ architect: seat('DLR Group') })],
    pipelineRows: [{ clientId: 'c1', name: 'trailhead ', architect: 'DLR Group, Inc.', gc: null }],
  });
  assert.equal(items.length, 0);
});

test('check 1 needs both sides filled in, and skips dismissed pipeline rows', () => {
  const blank = checkTeamMismatch({
    projects: [project({ architect: null })],
    pipelineRows: [{ clientId: 'c1', name: 'Trailhead', architect: 'DLR Group', gc: null }],
  });
  assert.equal(blank.length, 0);

  const dropped = checkTeamMismatch({
    projects: [project({ architect: seat('Gensler') })],
    pipelineRows: [{ clientId: 'c1', name: 'Trailhead', architect: 'DLR Group', gc: null, dismissed: true }],
  });
  assert.equal(dropped.length, 0);
});

// ── Check 3: close dates ─────────────────────────────────────────────────────

test('check 3 flags a won board with no close date', () => {
  const p = project({ procurementStatus: 'WON' });
  const items = checkCloseDate({ scopedProjects: [p], eventsByProject: new Map() });
  assert.equal(items.length, 1);
  assert.equal(items[0].key, 'close_date_missing:p1:PROCUREMENT');
});

test('check 3 flags a close date the system guessed', () => {
  const p = project({ procurementStatus: 'LOST' });
  const events = new Map([['p1', [
    { pipeline: 'PROCUREMENT', toStatus: 'LOST', changedAt: daysAgo(20), approximated: true },
  ]]]);
  const items = checkCloseDate({ scopedProjects: [p], eventsByProject: events });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'CLOSE_DATE_GUESSED');
});

test('check 3 says nothing about a real close date, or about an open board', () => {
  const p = project({ procurementStatus: 'WON' });
  const events = new Map([['p1', [
    { pipeline: 'PROCUREMENT', toStatus: 'WON', changedAt: daysAgo(20), approximated: false },
  ]]]);
  assert.equal(checkCloseDate({ scopedProjects: [p], eventsByProject: events }).length, 0);
  assert.equal(checkCloseDate({ scopedProjects: [project()], eventsByProject: new Map() }).length, 0);
});

test('check 3 only looks at boards the job actually has', () => {
  // serviceType PROCUREMENT means there is no Design board — designStatus still
  // holds its "WON" default and must not be read.
  const p = project({ serviceType: 'PROCUREMENT', procurementStatus: 'OPEN', designStatus: 'WON' });
  assert.equal(checkCloseDate({ scopedProjects: [p], eventsByProject: new Map() }).length, 0);
});

// ── Check 5: no main contact ─────────────────────────────────────────────────

test('check 5 flags a job with people but no main one', () => {
  const p = project({ contactLinks: [{ contactId: 'a', isLead: false }, { contactId: 'b', isLead: false }] });
  const items = checkNoLead({ scopedProjects: [p] });
  assert.equal(items.length, 1);
  assert.equal(items[0].key, 'no_lead:p1');
});

test('check 5 ignores a job with a main contact, and one with nobody on it', () => {
  const withLead = project({ contactLinks: [{ contactId: 'a', isLead: true }] });
  assert.equal(checkNoLead({ scopedProjects: [withLead] }).length, 0);
  assert.equal(checkNoLead({ scopedProjects: [project()] }).length, 0);
});

// ── Checks 2 and 4: people ───────────────────────────────────────────────────

test('check 4 flags two people on one email address', () => {
  const items = checkDuplicateEmail({ contacts: [
    { id: '1', name: 'Ryan Smith', email: 'ryan@acme.com' },
    { id: '2', name: 'R. Smith',   email: 'RYAN@acme.com ' },
    { id: '3', name: 'Jo Brown',   email: 'jo@acme.com' },
    { id: '4', name: 'No Email',   email: null },
  ] });
  assert.equal(items.length, 1);
  assert.equal(items[0].key, 'duplicate_email:ryan@acme.com');
});

test('check 2 flags a person with no company, but only a live or recent one', () => {
  const ctx = {
    now: NOW,
    scopedProjectIds: new Set(['p1']),
    contacts: [
      { id: 'a', name: 'On A Job',  clientId: null, createdAt: daysAgo(400), projectLinks: [{ projectId: 'p1' }] },
      { id: 'b', name: 'Brand New', clientId: null, createdAt: daysAgo(3),   projectLinks: [] },
      { id: 'c', name: 'Old Card',  clientId: null, createdAt: daysAgo(400), projectLinks: [] },
      { id: 'd', name: 'Has One',   clientId: 'c1', createdAt: daysAgo(3),   projectLinks: [] },
    ],
  };
  const keys = checkPersonNoCompany(ctx).map(i => i.key);
  assert.deepEqual(keys, ['person_no_company:a', 'person_no_company:b']);
});

// ── The two ceilings ─────────────────────────────────────────────────────────

const many = (n) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, kind: 'NO_LEAD', title: `t${i}` }));

test('a fresh week surfaces at most five new items', () => {
  const out = selectItems(many(20), { now: NOW });
  assert.equal(out.items.length, WEEKLY_NEW_LIMIT);
  assert.equal(out.fresh.length, WEEKLY_NEW_LIMIT);
  assert.equal(out.remainingThisWeek, 0);
  assert.equal(out.totalOpen, 20);
});

test('once this week is spent, nothing new joins until next week', () => {
  const thisMonday = startOfWeek(NOW);
  const shown = new Map(many(5).map(i => [i.key, thisMonday]));
  // All five are gone (fixed or dismissed); twenty other problems are waiting.
  const out = selectItems(many(20).slice(5), { shown, dismissed: new Set(), now: NOW });
  assert.equal(out.fresh.length, 0);
  assert.equal(out.items.length, 0);
  assert.equal(out.remainingThisWeek, 0);
});

test('items surfaced last week still show, and do not eat this week`s five', () => {
  const lastWeek = new Date(startOfWeek(NOW).getTime() - 3 * DAY);
  const shown = new Map([['k0', lastWeek], ['k1', lastWeek]]);
  const out = selectItems(many(20), { shown, now: NOW });
  assert.equal(out.items.length, VISIBLE_LIMIT);           // 2 old + 3 new
  assert.equal(out.fresh.length, 3);
  assert.deepEqual(out.items.slice(0, 2).map(i => i.key), ['k0', 'k1']);
  assert.equal(out.remainingThisWeek, WEEKLY_NEW_LIMIT - 3);
});

test('never more than five on screen, however many are waiting', () => {
  const lastWeek = new Date(startOfWeek(NOW).getTime() - 3 * DAY);
  const shown = new Map(many(12).map(i => [i.key, lastWeek]));
  const out = selectItems(many(20), { shown, now: NOW });
  assert.equal(out.items.length, VISIBLE_LIMIT);
  assert.equal(out.fresh.length, 0);
});

test('"That`s fine" buries an item for good', () => {
  const out = selectItems(many(3), { dismissed: new Set(['k0', 'k1']), now: NOW });
  assert.deepEqual(out.items.map(i => i.key), ['k2']);
  assert.equal(out.totalOpen, 1);
});

test('a buried item stays buried even after it has been shown', () => {
  const shown = new Map([['k0', startOfWeek(NOW)]]);
  const out = selectItems(many(1), { shown, dismissed: new Set(['k0']), now: NOW });
  assert.equal(out.items.length, 0);
});

test('the week starts on Monday', () => {
  assert.equal(startOfWeek(new Date('2026-09-10T12:00:00')).getDate(), 7);   // Thu → Mon 7th
  assert.equal(startOfWeek(new Date('2026-09-07T00:30:00')).getDate(), 7);   // Mon → itself
  assert.equal(startOfWeek(new Date('2026-09-13T23:00:00')).getDate(), 7);   // Sun → Mon 7th
});

// ── End to end ───────────────────────────────────────────────────────────────

test('runChecks only reports problems on jobs in scope', () => {
  const live  = project({ id: 'live',  name: 'Live',  contactLinks: [{ contactId: 'a', isLead: false }] });
  const stale = project({ id: 'stale', name: 'Stale', procurementStatus: 'WON',
                          contactLinks: [{ contactId: 'b', isLead: false }] });
  const items = runChecks({
    now: NOW,
    projects: [live, stale],
    statusEvents: [{ projectId: 'stale', pipeline: 'PROCUREMENT', toStatus: 'WON',
                     changedAt: daysAgo(SCOPE_DAYS + 30), approximated: false }],
    pipelineRows: [], contacts: [],
  });
  assert.deepEqual(items.map(i => i.key), ['no_lead:live']);
});

test('every item carries a stable key, a plain-English title and somewhere to go', () => {
  const items = runChecks({
    now: NOW,
    projects: [project({ id: 'p1', architect: { id: 'a', name: 'Gensler' },
                         contactLinks: [{ contactId: 'a', isLead: false }] })],
    statusEvents: [],
    pipelineRows: [{ clientId: 'c1', name: 'Trailhead', architect: 'DLR Group', gc: null }],
    contacts: [
      { id: '1', name: 'Ryan Smith', email: 'ryan@acme.com', clientId: 'c1', createdAt: NOW, projectLinks: [] },
      { id: '2', name: 'R. Smith',   email: 'ryan@acme.com', clientId: 'c1', createdAt: NOW, projectLinks: [] },
    ],
  });
  assert.ok(items.length >= 3);
  const keys = new Set();
  for (const i of items) {
    assert.ok(i.key && !keys.has(i.key), `duplicate or missing key: ${i.key}`);
    keys.add(i.key);
    assert.ok(i.title && i.title.length > 5);
    assert.ok(i.detail && i.detail.length > 5);
    assert.ok(i.href && i.href.startsWith('/'));
    assert.ok(i.hrefLabel);
  }
});

test('one noisy check cannot take the whole card', () => {
  // Found on the real data: five jobs missing a close date filled all five
  // slots, so the other four checks were invisible.
  const items = [
    ...Array.from({ length: 8 }, (_, i) => ({ key: `d${i}`, kind: 'CLOSE_DATE_MISSING', title: 'd' })),
    { key: 'lead', kind: 'NO_LEAD',           title: 'l' },
    { key: 'dupe', kind: 'DUPLICATE_EMAIL',   title: 'e' },
    { key: 'noco', kind: 'PERSON_NO_COMPANY', title: 'c' },
  ];
  const kinds = selectItems(items, { now: NOW }).items.map(i => i.kind);
  assert.equal(kinds.length, VISIBLE_LIMIT);
  assert.equal(new Set(kinds).size, 4, `expected all four kinds, got ${kinds.join(', ')}`);
  assert.equal(kinds.filter(k => k === 'CLOSE_DATE_MISSING').length, 2);
});
