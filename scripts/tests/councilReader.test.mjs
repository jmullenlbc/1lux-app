// Council agenda reader + likely land buyer (Mike 10-9: "1. yes 2. yes").
// Rezonings are read from each city's public Legistar API; an applicant who
// is not the landowner is tagged BUYER.
// Run: node --test scripts/tests/councilReader.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PERMIT_PROFILES, parseCouncilTitle, likelyLandBuyer, applicantRole, permitToSignal, permitQueryUrl } from '../../src/lib/market-intel/permitRules.js';
import { COMPANY_ROLES, DEVELOPER_ROLES } from '../../src/lib/market-intel/tagRules.js';
import { kindRank } from '../../src/lib/market-intel/supersedeRules.js';
import { SOURCES } from '../../src/lib/market-intel/sourceCatalog.js';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');

const MESA = 'ZON21-00066 "Greenfield Multifamily" Rezoning from AG to RM-4 for a 30-unit multiple residence. Johnstar LLC, owner; Tim Boyle, Atmosphere Architects, applicant.';
const matter = (title, extra = {}) => ({ MatterId: 1, MatterGuid: 'g', MatterFile: 'F-1', MatterTitle: title, MatterName: '', MatterTypeName: 'Ordinance', MatterStatusName: 'Agenda Ready', MatterBodyName: 'City Council', MatterIntroDate: '2026-09-01T00:00:00', ...extra });

test('council titles give case, owner, applicant', () => {
  const m = parseCouncilTitle(MESA);
  assert.equal(m.caseNumber, 'ZON21-00066');
  assert.equal(m.ownerName, 'Johnstar LLC');
  assert.match(m.applicantName, /Atmosphere Architects/);
  const d = parseCouncilTitle('A public hearing to receive comments regarding an application for MF-2(A) AKA 3125 N Prairie Creek Road. Applicant: Kittle Property Group / Jana Darmon Representative: Someone Z-26-000158');
  assert.equal(d.caseNumber, 'Z-26-000158');
  assert.equal(d.applicantName, 'Kittle Property Group');
});

test('an applicant who is not the owner and not a consultant is a likely land buyer', () => {
  assert.equal(likelyLandBuyer('Smith Family Trust', 'Greystar Development LLC'), true);
  assert.equal(likelyLandBuyer('Greystar Development LLC', 'Greystar Development LLC'), false);
  assert.equal(likelyLandBuyer('Smith Family Trust', 'Kimley-Horn and Associates'), false);
  assert.equal(likelyLandBuyer('Smith Family Trust', 'Barbas Cremer PLLC'), false);
  assert.equal(applicantRole('Smith Family Trust', 'Greystar Development LLC'), 'BUYER');
  assert.equal(applicantRole(null, 'Greystar Development LLC'), 'DEVELOPER');
  assert.equal(applicantRole('X LLC', 'X LLC'), null);
  assert.ok(COMPANY_ROLES.includes('BUYER') && DEVELOPER_ROLES.includes('BUYER'));
});

test('council matters become COUNCIL signals; small and non-zoning items drop', () => {
  const p = PERMIT_PROFILES.MESA_COUNCIL;
  assert.equal(p.kind, 'COUNCIL');
  const s = permitToSignal(p, matter(MESA));
  assert.equal(s.kind, 'COUNCIL');
  assert.equal(s.permitNumber, 'ZON21-00066');
  assert.equal(s.unitCount, 30);
  assert.match(s.neighborhood, /City Council: Agenda Ready/);
  assert.equal(permitToSignal(p, matter('ZON26-00001 Rezoning from AG to RS-6 for a 6-unit subdivision. Bob LLC, owner.')), null);
  assert.equal(permitToSignal(p, matter('Replat of Lot 4, Greenfield Commons', { MatterTypeName: 'Ordinance' })), null);
  assert.equal(permitToSignal(p, matter(MESA, { MatterTypeName: 'Resolution' })), null);
});

test('every council city is a source, the query is keyless, council ranks between concept and permit', () => {
  const councils = Object.entries(PERMIT_PROFILES).filter(([, p]) => p.kind === 'COUNCIL');
  assert.equal(councils.length, 7);
  for (const [, p] of councils) {
    assert.ok(SOURCES.some(s => s.feedUrl === p.layerUrl), p.layerUrl);
    const url = permitQueryUrl(p, new Date('2026-01-01'), {});
    assert.match(url, /^https:\/\/webapi\.legistar\.com\/v1\/[a-z]+\/matters\?\$top=/);
    assert.doesNotMatch(url, /key|token/i);
  }
  assert.ok(kindRank('COUNCIL') > kindRank('CONCEPT') && kindRank('COUNCIL') < kindRank('PERMIT'));
  const page = read('src/app/(app)/market-intel/permits/page.jsx');
  assert.match(page, /Likely land buyer/);
  assert.doesNotMatch(page, /not read yet/);
  assert.match(read('src/app/api/market-intel/signals/route.js'), /role: 'BUYER'/);
});
