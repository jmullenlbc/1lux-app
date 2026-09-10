/**
 * The project team — six companies on a job, plus the one main point of contact.
 *
 * Mike, 2026-09-09: "we have six project team fields and they connect to
 * clients", and every one of them is "always optional".
 *
 * Maram, same call, on the people side: "there always has to be like the one
 * main point person and that's the only person that's going to be considered for
 * those fields" — so a person's own won/lost record follows the projects they
 * are the MAIN contact on, not every project they were copied on.
 *
 * Run: node --test scripts/tests/projectTeam.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_TEAM_ROLES, PROJECT_TEAM_ID_FIELDS, teamRoleLabel,
  pickTeamUpdate, projectTeam, teamFilledCount, teamMemberWhere, rolesHeldBy,
} from '../../src/lib/projectTeam.js';
import { contactDealCounts } from '../../src/lib/crmClient.js';

test('the six roles Mike named, in his order, and no seventh', () => {
  assert.deepEqual(PROJECT_TEAM_ROLES.map(r => r.label), [
    'Developer',
    'General Contractor',
    'Electrical Contractor',
    'Interior Designer',
    'Electrical Engineer',
    'Architect',
  ]);
});

test('every role names a real column and a real relation', () => {
  for (const role of PROJECT_TEAM_ROLES) {
    assert.equal(role.id, `${role.key}Id`, 'the column is the key plus Id');
    assert.equal(role.relation, role.key, 'the loaded company hangs off the key');
  }
  assert.equal(PROJECT_TEAM_ID_FIELDS.length, 6);
});

test('a role has a plain-English name, and an unknown key survives unchanged', () => {
  assert.equal(teamRoleLabel('electricalEngineer'), 'Electrical Engineer');
  assert.equal(teamRoleLabel('somethingElse'), 'somethingElse');
  assert.equal(teamRoleLabel(null), null);
});

// ── Saving ───────────────────────────────────────────────────────────────────

test('only the six team fields survive a save', () => {
  const data = pickTeamUpdate({ architectId: 'c1', name: 'renamed', contractValue: 999999 });
  assert.deepEqual(data, { architectId: 'c1' });
});

test('clearing a seat writes an empty seat, not an empty string', () => {
  // An id of "" would be a foreign key to nothing and fail on write.
  for (const cleared of ['', '   ', null, undefined]) {
    assert.deepEqual(pickTeamUpdate({ developerId: cleared }), { developerId: null });
  }
});

test('a seat nobody touched is left alone rather than blanked', () => {
  // The form posts what was edited. Absent must never mean "clear it".
  assert.deepEqual(pickTeamUpdate({ developerId: 'c1' }), { developerId: 'c1' });
  assert.deepEqual(pickTeamUpdate({}), {});
});

test('a role can be sent by its short name or its column name', () => {
  assert.deepEqual(pickTeamUpdate({ generalContractor: 'c2' }), { generalContractorId: 'c2' });
  assert.deepEqual(pickTeamUpdate({ generalContractorId: 'c2' }), { generalContractorId: 'c2' });
});

// ── Reading ──────────────────────────────────────────────────────────────────

const PROJECT = {
  developerId: 'c1', developer: { id: 'c1', name: 'Alpine Development' },
  architectId: 'c2', architect: { id: 'c2', name: 'Studio Nine' },
  generalContractorId: null, generalContractor: null,
  electricalContractorId: null, interiorDesignerId: null, electricalEngineerId: null,
};

test('a read-only summary lists only the seats that are filled', () => {
  const team = projectTeam(PROJECT);
  assert.deepEqual(team.map(t => t.label), ['Developer', 'Architect']);
  assert.equal(team[0].company.name, 'Alpine Development');
  assert.equal(teamFilledCount(PROJECT), 2);
});

test('an edit form gets all six rows, blanks included', () => {
  const team = projectTeam(PROJECT, { includeEmpty: true });
  assert.equal(team.length, 6);
  assert.equal(team.find(t => t.key === 'generalContractor').companyId, null);
});

test('a project with nobody on the team is legal and simply empty', () => {
  // "always optional" — Mike, 2026-09-09. Never a validation error.
  assert.deepEqual(projectTeam({}), []);
  assert.equal(teamFilledCount({}), 0);
  assert.equal(teamFilledCount(null), 0);
});

test('a project row with ids but no loaded companies still reports its team', () => {
  const team = projectTeam({ architectId: 'c2' });
  assert.equal(team.length, 1);
  assert.equal(team[0].companyId, 'c2');
  assert.equal(team[0].company, null);
});

// ── Finding a company's team seats ───────────────────────────────────────────

test('the Related Projects lookup checks all six seats', () => {
  const where = teamMemberWhere('c1');
  assert.equal(where.OR.length, 6);
  assert.deepEqual(where.OR[0], { developerId: 'c1' });
  // Every column is covered — a missing one silently hides projects.
  assert.deepEqual(where.OR.map(o => Object.keys(o)[0]).sort(), [...PROJECT_TEAM_ID_FIELDS].sort());
});

test('one company can hold more than one seat on the same job', () => {
  // A developer acting as their own general contractor is normal, which is why
  // the pickers do not filter by client type.
  const both = { developerId: 'c1', generalContractorId: 'c1' };
  assert.deepEqual(rolesHeldBy(both, 'c1').map(r => r.label), ['Developer', 'General Contractor']);
  assert.deepEqual(rolesHeldBy(both, 'c9'), []);
  assert.deepEqual(rolesHeldBy(null, 'c1'), []);
});

// ── The one main point of contact ────────────────────────────────────────────

const WON  = { id: 'p1', serviceType: 'procurement', procurementStatus: 'WON' };
const LOST = { id: 'p2', serviceType: 'procurement', procurementStatus: 'LOST' };

test("a person's record counts only the jobs they were the main contact on", () => {
  const person = {
    projectLinks: [
      { isLead: true,  project: WON },
      { isLead: false, project: LOST },   // copied in, not responsible
    ],
  };
  const counts = contactDealCounts(person);
  assert.equal(counts.won, 1);
  assert.equal(counts.lost, 0);
  assert.equal(counts.total, 1);
});

test('somebody who is on projects but leads none has an empty record, not a wrong one', () => {
  const person = { projectLinks: [{ isLead: false, project: WON }, { isLead: false, project: LOST }] };
  assert.equal(contactDealCounts(person).total, 0);
});

test('a person on no projects at all counts to zero', () => {
  assert.equal(contactDealCounts({}).total, 0);
  assert.equal(contactDealCounts(null).total, 0);
});
