// City permit feeds (migration 0123, Mike 10-7). Pure, no DB, no fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMIT_PROFILES, permitWhere, permitQueryUrl, permitRows, permitToSignal, unitsFrom, cleanCompany, titleCaseAddress, money } from '../../src/lib/market-intel/permitRules.js';

const DENVER = PERMIT_PROFILES.DENVER;
const ROW = {
  OBJECTID: 1, DATE_ISSUED: Date.UTC(2026, 8, 23), PERMIT_NUM: '2026-COMMCON-0000365', ADDRESS: '4459 N RIFLE ST',
  LOCATION: '//', CLASS: 'New Building', UNITS: '265', VALUATION: 51862516, CONTRACTOR_NAME: 'PAULSCORP LLC', NEIGHBORHOOD: 'Gateway - Green Valley Ranch',
};

test('Denver unit text becomes a whole positive number or nothing', () => {
  assert.equal(unitsFrom('265'), 265);
  assert.equal(unitsFrom('6.'), 6);
  assert.equal(unitsFrom('-2'), null);
  assert.equal(unitsFrom(''), null);
  assert.equal(unitsFrom(null), null);
});

test('shouting contractor names read like names', () => {
  assert.equal(cleanCompany('GARRETT CONSTRUCTION COMPANY LLC (THE)'), 'Garrett Construction Company LLC');
  assert.equal(cleanCompany('VASTYAN COLORADO LLC DBA  VASTYAN CONSTRUCTION'), 'Vastyan Colorado LLC');
  assert.equal(cleanCompany('Milender White Construction Co'), 'Milender White Construction Co');
  assert.equal(cleanCompany(''), '');
});

test('addresses title-case but keep the compass letter', () => {
  assert.equal(titleCaseAddress('4459 N RIFLE ST'), '4459 N Rifle St');
  assert.equal(titleCaseAddress('2777 N ZUNI ST'), '2777 N Zuni St');
});

test('a new multifamily building becomes a permit signal with a GC tag', () => {
  const s = permitToSignal(DENVER, ROW);
  assert.equal(s.kind, 'PERMIT');
  assert.equal(s.signalType, 'PERMIT');
  assert.equal(s.title, 'New building, 265 units: 4459 N Rifle St');
  assert.equal(s.unitCount, 265);
  assert.equal(s.valuation, 51862516);
  assert.equal(s.contractorName, 'Paulscorp LLC');
  assert.equal(s.permitNumber, '2026-COMMCON-0000365');
  assert.deepEqual(s.extracted.companies, [{ name: 'Paulscorp LLC', role: 'GC' }]);
  assert.equal(s.extracted.metro, 'Denver, CO');
  assert.equal(s.extracted.state, 'CO');
  assert.match(s.summary, /\$52M/);
  assert.match(s.summary, /Permit 2026-COMMCON-0000365/);
});

test('tenant finishes, sheds and contractor swaps are dropped', () => {
  assert.equal(permitToSignal(DENVER, { ...ROW, CLASS: 'Alteration/Tenant Finish' }), null);
  assert.equal(permitToSignal(DENVER, { ...ROW, CLASS: 'Change of Contractor', UNITS: '1', VALUATION: 0 }), null);
  assert.equal(permitToSignal(DENVER, { ...ROW, UNITS: '', VALUATION: 250000 }), null);
  // Under $10M is too small a job, unit count or not (Mike 10-8).
  assert.equal(permitToSignal(DENVER, { ...ROW, VALUATION: 4_000_000 }), null);
  assert.equal(permitToSignal(DENVER, { ...ROW, UNITS: '', VALUATION: 4_000_000 }), null);
  // No unit count but real money still counts: a hotel or a big addition.
  assert.ok(permitToSignal(DENVER, { ...ROW, UNITS: '', VALUATION: 12_000_000 }));
  assert.equal(permitToSignal(DENVER, { ...ROW, PERMIT_NUM: '' }), null);
});

test('the where clause asks for recent kept classes worth $10M or more', () => {
  const w = permitWhere(DENVER, new Date(Date.UTC(2026, 0, 15)));
  assert.match(w, /DATE_ISSUED >= DATE '2026-01-15'/);
  assert.match(w, /CLASS IN \('New Building','Addition'/);
  assert.match(w, /VALUATION >= 10000000/);
  const url = permitQueryUrl(DENVER, new Date(Date.UTC(2026, 0, 15)), { limit: 50 });
  assert.match(url, /^https:\/\/services1\.arcgis\.com\//);
  assert.match(url, /resultRecordCount=50/);
  assert.match(url, /f=json/);
});

const AUSTIN = PERMIT_PROFILES.AUSTIN;
const AROW = {
  permit_number: '2026-030863 BP', permit_class: 'C- 105 Five or More Family Bldgs', work_class: 'New', issue_date: '2026-09-06T00:00:00.000',
  housing_units: '5', total_job_valuation: '10067000', original_address1: '6620 ED BLUESTEIN BLVD SB BLDG 1', contractor_company_name: 'DMJ Construction Services LLC',
  applicant_org: 'DMJ Construction Services LLC', description: 'New construction of multifamily', link: { url: 'https://abc.austintexas.gov/web/permit/public-search-other?t_detail=1&t_selected_folderrsn=13669715' }, council_district: '1',
};

test('Austin rows map to a permit signal with the city link', () => {
  const s = permitToSignal(AUSTIN, AROW);
  assert.equal(s.kind, 'PERMIT');
  assert.equal(s.permitNumber, '2026-030863 BP');
  assert.equal(s.permitClass, 'New');
  assert.equal(s.unitCount, 5);
  assert.equal(s.address, '6620 Ed Bluestein Blvd Sb Bldg 1');
  assert.equal(s.contractorName, 'DMJ Construction Services LLC');
  assert.match(s.url, /^https:\/\/abc\.austintexas\.gov\//);
  assert.match(s.summary, /Five or More Family Bldgs/);
  assert.equal(s.extracted.metro, 'Austin, TX');
  assert.equal(s.extracted.state, 'TX');
  assert.equal(permitToSignal(AUSTIN, { ...AROW, work_class: 'Remodel' }), null);
  assert.equal(permitToSignal(AUSTIN, { ...AROW, total_job_valuation: '9900000' }), null);
  // Austin's housing_units is a building count on non-residential rows: a sign permit says 1.
  assert.equal(permitToSignal(AUSTIN, { ...AROW, permit_class: 'C- 328 Commercial Other Nonresident Bldg', housing_units: '1', total_job_valuation: '25000000' }).unitCount, null);
  assert.equal(permitToSignal(AUSTIN, { ...AROW, permit_class: 'C- 329 Com Structures Other Than Bldg', total_job_valuation: '25000000' }), null);
  assert.equal(permitToSignal(AUSTIN, { ...AROW, permit_class: 'C- 213 Hotels, Motels, & Tourist Cabins', housing_units: '120' }).unitCount, 120);
});

test('Austin asks Socrata for commercial building permits in its own dialect', () => {
  const w = permitWhere(AUSTIN, new Date(Date.UTC(2026, 0, 15)));
  assert.match(w, /permittype='BP' AND permit_class_mapped='Commercial'/);
  assert.match(w, /issue_date >= '2026-01-15'/);
  assert.match(w, /work_class IN \('New','Addition','Shell'/);
  assert.match(w, /AND total_job_valuation >= 10000000$/);
  assert.doesNotMatch(w, /housing_units/);
  const url = permitQueryUrl(AUSTIN, new Date(Date.UTC(2026, 0, 15)), { limit: 50 });
  assert.match(url, /^https:\/\/data\.austintexas\.gov\/resource\/3syk-w9eu\.json\?/);
  assert.match(url, /%24limit=50/);
  assert.match(url, /%24order=issue_date\+DESC/);
});

test('permitRows reads both feed shapes', () => {
  assert.deepEqual(permitRows(DENVER, { features: [{ attributes: { PERMIT_NUM: 'a' } }] }), [{ PERMIT_NUM: 'a' }]);
  assert.deepEqual(permitRows(AUSTIN, [{ permit_number: 'b' }]), [{ permit_number: 'b' }]);
  assert.throws(() => permitRows(DENVER, { error: { message: 'bad layer' } }), /bad layer/);
  assert.throws(() => permitRows(AUSTIN, { error: true, message: 'bad query' }), /bad query/);
});

test('money reads short', () => {
  assert.equal(money(51862516), '$52M');
  assert.equal(money(3500000), '$3.5M');
  assert.equal(money(299500), '$300K');
  assert.equal(money(0), '');
});
