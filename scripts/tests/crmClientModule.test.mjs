/**
 * CRM Client + People modules (Mike's spec, 2026-09-06).
 *
 * Pins the rules that are easy to break later:
 *  - deal counters are DERIVED from projects, counted once per pipeline board;
 *  - Won means WON or COMPLETED;
 *  - a full name splits the same way in JS as it does in the SQL backfill;
 *  - the shared vocabularies (Client Type, Project Type, Developer Type,
 *    Location Type) stay in one place and keep their legacy labels working.
 *
 * Run: node --test scripts/tests/crmClientModule.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dealCounts, dealLossReasons, parseList, deriveClientTypeKey,
  projectTypesFromProjects, splitName, joinName, isValidEmail, formatPhone,
  contactDealCounts, contactDealProjects, clientDealCounts, projectOutcome, EMPTY_DEAL_COUNTS,
  companyLink, countMissingCompany,
} from '../../src/lib/crmClient.js';
import {
  CLIENT_TYPES, ORG_TYPE_OPTIONS, LOCATION_TYPES, DEVELOPER_TYPES, PROJECT_TYPES,
  clientTypeKeyFromLabel, projectTypeLabel, developerTypeLabel,
} from '../../src/lib/utils.js';

// ── Deal counting ────────────────────────────────────────────────────────────

test('an empty or junk project list gives all zeros', () => {
  assert.deepEqual(dealCounts([]), EMPTY_DEAL_COUNTS);
  assert.deepEqual(dealCounts(null), EMPTY_DEAL_COUNTS);
  assert.deepEqual(dealCounts([null, undefined]), EMPTY_DEAL_COUNTS);
});

test('a procurement-only job counts once, on the procurement board', () => {
  const c = dealCounts([{ serviceType: 'bid', procurementStatus: 'OPEN' }]);
  assert.equal(c.total, 1);
  assert.equal(c.open, 1);
});

test('a design job counts twice, once per board, with its own status each', () => {
  const c = dealCounts([
    { serviceType: 'fullDesign', procurementStatus: 'OPEN', designStatus: 'WON' },
  ]);
  assert.equal(c.total, 2);
  assert.equal(c.open, 1);
  assert.equal(c.won, 1);
});

test('design assist is on the design board too; peer review is not', () => {
  assert.equal(dealCounts([{ serviceType: 'designAssist', procurementStatus: 'OPEN', designStatus: 'OPEN' }]).total, 2);
  assert.equal(dealCounts([{ serviceType: 'peerReview',   procurementStatus: 'OPEN', designStatus: 'OPEN' }]).total, 1);
});

test('a completed job still counts as won', () => {
  const c = dealCounts([{ serviceType: 'bid', procurementStatus: 'COMPLETED' }]);
  assert.equal(c.won, 1);
  assert.equal(c.open, 0);
});

test('a missing status is treated as open, never dropped', () => {
  const c = dealCounts([{ serviceType: 'bid' }]);
  assert.equal(c.open, 1);
  assert.equal(c.total, 1);
});

test('lost and abandoned are counted apart from each other', () => {
  const c = dealCounts([
    { serviceType: 'bid', procurementStatus: 'LOST' },
    { serviceType: 'bid', procurementStatus: 'ABANDONED' },
  ]);
  assert.equal(c.lost, 1);
  assert.equal(c.abandoned, 1);
  assert.equal(c.open, 0);
});

test('the four buckets always add up to the total', () => {
  const projects = [
    { serviceType: 'fullDesign', procurementStatus: 'OPEN',      designStatus: 'LOST' },
    { serviceType: 'bid',        procurementStatus: 'WON' },
    { serviceType: 'designAssist', procurementStatus: 'ABANDONED', designStatus: 'COMPLETED' },
  ];
  const c = dealCounts(projects);
  assert.equal(c.open + c.won + c.lost + c.abandoned, c.total);
  assert.equal(c.total, 5);
});

// ── Per-project counting (a client's own numbers) ────────────────────────────
// Mike, 2026-09-06: "it should be 2 wins but the wins per client should only
// count 1 per project." The boards count a design job twice; the client counts
// it once.

test('a client counts one deal per project, however many boards it rides', () => {
  const projects = [{ serviceType: 'fullDesign', procurementStatus: 'WON', designStatus: 'WON' }];
  assert.equal(dealCounts(projects).won, 2);          // the boards see two wins
  assert.equal(clientDealCounts(projects).won, 1);    // the client sees one job
  assert.equal(clientDealCounts(projects).total, 1);
});

test('a win on either board makes the whole project a win for the client', () => {
  assert.equal(projectOutcome({ serviceType: 'fullDesign', procurementStatus: 'LOST', designStatus: 'WON' }), 'won');
  assert.equal(projectOutcome({ serviceType: 'fullDesign', procurementStatus: 'WON',  designStatus: 'OPEN' }), 'won');
  assert.equal(projectOutcome({ serviceType: 'bid',        procurementStatus: 'COMPLETED' }), 'won');
});

test('a project still live on either board is open for the client', () => {
  assert.equal(projectOutcome({ serviceType: 'fullDesign', procurementStatus: 'LOST', designStatus: 'OPEN' }), 'open');
  assert.equal(projectOutcome({ serviceType: 'bid' }), 'open');
});

test('a project dead on every board reads lost before abandoned', () => {
  assert.equal(projectOutcome({ serviceType: 'fullDesign', procurementStatus: 'LOST',      designStatus: 'ABANDONED' }), 'lost');
  assert.equal(projectOutcome({ serviceType: 'fullDesign', procurementStatus: 'ABANDONED', designStatus: 'ABANDONED' }), 'abandoned');
  assert.equal(projectOutcome({ serviceType: 'bid',        procurementStatus: 'LOST' }), 'lost');
});

test('a client’s four buckets add up to its project count, not its board count', () => {
  const projects = [
    { serviceType: 'fullDesign',   procurementStatus: 'WON',       designStatus: 'WON' },
    { serviceType: 'bid',          procurementStatus: 'OPEN' },
    { serviceType: 'designAssist', procurementStatus: 'ABANDONED', designStatus: 'ABANDONED' },
  ];
  const c = clientDealCounts(projects);
  assert.equal(c.total, 3);                       // three jobs, not five board slots
  assert.equal(dealCounts(projects).total, 5);    // the boards still see five
  assert.equal(c.open + c.won + c.lost + c.abandoned, c.total);
});

test('an empty or junk project list gives a client all zeros', () => {
  assert.deepEqual(clientDealCounts([]), EMPTY_DEAL_COUNTS);
  assert.deepEqual(clientDealCounts(null), EMPTY_DEAL_COUNTS);
  assert.deepEqual(clientDealCounts([null, undefined]), EMPTY_DEAL_COUNTS);
  assert.equal(projectOutcome(null), null);
});

test('a person is counted from the projects they are attached to, one per project', () => {
  const contact = {
    projectLinks: [
      { isLead: true, project: { serviceType: 'fullDesign', procurementStatus: 'OPEN', designStatus: 'OPEN' } },
      { isLead: true, project: null },
    ],
  };
  // One job they are on, so one open deal against their name, not two.
  assert.equal(contactDealCounts(contact).open, 1);
  assert.equal(contactDealCounts(contact).total, 1);
  assert.deepEqual(contactDealCounts({}), EMPTY_DEAL_COUNTS);
});

test('the jobs behind a person’s numbers are the same jobs the numbers counted', () => {
  const contact = {
    projectLinks: [
      { isLead: true,  project: { id: 'a', name: 'Trailhead', serviceType: 'bid',        procurementStatus: 'OPEN' } },
      { isLead: true,  project: { id: 'b', name: 'Creekside', serviceType: 'fullDesign', procurementStatus: 'WON',  designStatus: 'OPEN' } },
      { isLead: true,  project: { id: 'c', name: 'Shelved',   serviceType: 'bid',        procurementStatus: 'ABANDONED' } },
      // Copied onto the job, not responsible for it, never counted, never listed.
      { isLead: false, project: { id: 'd', name: 'Not theirs', serviceType: 'bid',       procurementStatus: 'WON' } },
      { isLead: true,  project: null },
    ],
  };
  const lists  = contactDealProjects(contact);
  const counts = contactDealCounts(contact);

  // The chip's number and the list it opens have to be the same thing, always.
  for (const bucket of ['open', 'won', 'lost', 'abandoned']) {
    assert.equal(lists[bucket].length, counts[bucket], bucket);
  }
  assert.deepEqual(lists.open.map(p => p.id),      ['a']);
  assert.deepEqual(lists.won.map(p => p.id),       ['b']);
  assert.deepEqual(lists.abandoned.map(p => p.id), ['c']);
  assert.deepEqual(lists.lost, []);
  assert.deepEqual(contactDealProjects({}), { open: [], won: [], lost: [], abandoned: [] });
});

test('the loss reasons come back with the project and the board that lost it', () => {
  const rows = dealLossReasons([
    { id: 'p1', name: 'Trailhead', serviceType: 'fullDesign',
      procurementStatus: 'LOST', procurementStatusReason: 'Price',
      designStatus: 'ABANDONED',  designStatusReason: 'Owner shelved it' },
    { id: 'p2', name: 'Open one', serviceType: 'bid', procurementStatus: 'OPEN' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].projectName, 'Trailhead');
  assert.equal(rows[0].reason, 'Price');
  assert.equal(rows[1].reason, 'Owner shelved it');
});

// ── Multi-select storage ─────────────────────────────────────────────────────

test('a JSON list stored as text reads back as an array, and bad data never throws', () => {
  assert.deepEqual(parseList('["Developer","Architect"]'), ['Developer', 'Architect']);
  assert.deepEqual(parseList(['a']), ['a']);
  assert.deepEqual(parseList('not json'), []);
  assert.deepEqual(parseList(null), []);
  assert.deepEqual(parseList('{"a":1}'), []);          // an object is not a list
});

test('the legacy single Client Type is derived from the first tick', () => {
  assert.equal(deriveClientTypeKey(['Architect', 'Developer'], clientTypeKeyFromLabel), 'architect');
  assert.equal(deriveClientTypeKey([], clientTypeKeyFromLabel), null);
});

test('every Client Type label maps back to its stored key', () => {
  for (const t of CLIENT_TYPES) {
    assert.equal(clientTypeKeyFromLabel(t.label), t.value, `label "${t.label}" lost its key`);
  }
  assert.equal(ORG_TYPE_OPTIONS.length, CLIENT_TYPES.length);
});

test('the old combined Developer / Self-Performing GC label still resolves', () => {
  assert.equal(clientTypeKeyFromLabel('Developer / Self-Performing GC'), 'developerSelfPerformingGc');
});

// ── Vocabularies ─────────────────────────────────────────────────────────────

test('Project Type is Mike’s six choices, including Single Family For Sale', () => {
  assert.deepEqual(PROJECT_TYPES.map(t => t.label), [
    'Multi-Family', 'Senior Living', 'Single Family For Rent',
    'Single Family For Sale', 'Affordable Housing', 'Hospitality',
  ]);
});

test('a retired Project Type still shows its old name instead of a blank', () => {
  assert.equal(projectTypeLabel('Student'), 'Student Housing');
  assert.equal(projectTypeLabel('BTR'), 'Single Family For Rent');
  assert.equal(projectTypeLabel('anything-else'), 'anything-else');
  assert.equal(projectTypeLabel(''), '—');            // nothing chosen reads as a dash
});

test('Developer Type is Merchant and Long-Term Hold', () => {
  assert.deepEqual(DEVELOPER_TYPES.map(t => t.value), ['merchant', 'longTermHold']);
  assert.equal(developerTypeLabel('longTermHold'), 'Long-Term Hold');
});

test('Location Type is National, Local Branch, Standalone', () => {
  assert.deepEqual(LOCATION_TYPES.map(t => t.label), ['National', 'Local Branch', 'Standalone']);
});

test('what a client actually builds is read off their own projects, no duplicates', () => {
  const seen = projectTypesFromProjects([
    { projectType: 'Multi-Family' }, { projectType: 'Multi-Family' },
    { projectType: 'BTR' }, { projectType: null }, {},
  ]);
  assert.deepEqual(seen.sort(), ['BTR', 'Multi-Family']);
  assert.deepEqual(projectTypesFromProjects([]), []);
});

// ── People fields ────────────────────────────────────────────────────────────

test('a full name splits into first and last the way the SQL backfill does', () => {
  // A missing part is null, not an empty string, so it lands in the database as
  // NULL and matches what the migration's backfill wrote.
  assert.deepEqual(splitName('Mike Kershner'),          { firstName: 'Mike',      lastName: 'Kershner' });
  assert.deepEqual(splitName('Mary Anne Van Der Berg'), { firstName: 'Mary Anne Van Der', lastName: 'Berg' });
  assert.deepEqual(splitName('Cher'),                   { firstName: 'Cher',      lastName: null });
  assert.deepEqual(splitName('  spaced   out  '),       { firstName: 'spaced',    lastName: 'out' });
  assert.deepEqual(splitName(''),                       { firstName: null,        lastName: null });
  assert.deepEqual(splitName(null),                     { firstName: null,        lastName: null });
});

test('first and last join back into a full name without stray spaces', () => {
  assert.equal(joinName('Mike', 'Kershner'), 'Mike Kershner');
  assert.equal(joinName('Mike', ''), 'Mike');
  assert.equal(joinName('', 'Kershner'), 'Kershner');
  assert.equal(joinName('', ''), '');
});

test('splitting then joining a name gives the same name back', () => {
  for (const name of ['Mike Kershner', 'Cher', 'Mary Anne Van Der Berg']) {
    const { firstName, lastName } = splitName(name);
    assert.equal(joinName(firstName, lastName), name);
  }
  assert.equal(joinName(null, null), '');
});

test('email is optional, but a typed one has to look like an email', () => {
  assert.equal(isValidEmail(''), true);
  assert.equal(isValidEmail(null), true);
  assert.equal(isValidEmail('mike@ilcstudios.com'), true);
  assert.equal(isValidEmail('mike'), false);
  assert.equal(isValidEmail('mike@'), false);
  assert.equal(isValidEmail('mike@ilcstudios'), false);
  assert.equal(isValidEmail('mike @ilcstudios.com'), false);
});

test('a ten-digit phone is displayed the way people read it out loud', () => {
  assert.equal(formatPhone('3035551212'),      '(303) 555-1212');
  assert.equal(formatPhone('303-555-1212'),    '(303) 555-1212');
  assert.equal(formatPhone('13035551212'),     '+1 (303) 555-1212');
  assert.equal(formatPhone('ext 42'),          'ext 42');   // anything unusual is left alone
  assert.equal(formatPhone(''),                '');
  assert.equal(formatPhone(null),              '');
});

// ── Who a person works for ───────────────────────────────────────────────────
// Mike, 2026-09-09: "we need to flag a person with no company." Since the people
// merge a person survives their company being deleted, so this is a state the
// app can now reach on its own and has to say out loud.

test('a person attached to a client record reads as linked', () => {
  const linked = companyLink({ client: { id: 'c1', name: 'Alpine Development' } });
  assert.equal(linked.state, 'linked');
  assert.equal(linked.label, 'Alpine Development');
});

test('a client link wins over a stale typed company name', () => {
  // Somebody typed the old employer, then we attached the real record. The
  // record is the truth.
  const c = companyLink({ client: { id: 'c1', name: 'Alpine Development' }, company: 'Old Firm' });
  assert.equal(c.state, 'linked');
  assert.equal(c.label, 'Alpine Development');
});

test('a typed company with no client record is flagged as not linked', () => {
  // Nothing about this person rolls up to that company, which is worth saying.
  const c = companyLink({ company: 'CSI Engineering' });
  assert.equal(c.state, 'typed');
  assert.equal(c.label, 'CSI Engineering');
});

test('no employer at all is its own state, not an empty string', () => {
  for (const contact of [{}, { company: '' }, { company: '   ' }, { client: null }]) {
    assert.equal(companyLink(contact).state, 'none');
    assert.equal(companyLink(contact).label, null);
  }
});

test('a clientId with no loaded client row still counts as linked', () => {
  // List screens select the client; write paths often carry only the id. Neither
  // should show a red flag on somebody who plainly has an employer.
  assert.equal(companyLink({ clientId: 'c1' }).state, 'linked');
});

test('only people with no employer at all are counted for the flag', () => {
  const people = [
    { client: { id: 'c1', name: 'Alpine' } },
    { company: 'CSI Engineering' },
    {},
    { company: '  ' },
  ];
  assert.equal(countMissingCompany(people), 2);
  assert.equal(countMissingCompany([]), 0);
  assert.equal(countMissingCompany(), 0);
});
