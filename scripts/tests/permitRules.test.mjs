// City permit feeds (migration 0123, Mike 10-7). Pure, no DB, no fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMIT_PROFILES, permitWhere, permitQueryUrl, permitToSignal, unitsFrom, cleanCompany, titleCaseAddress, money } from '../../src/lib/market-intel/permitRules.js';

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
  // No unit count but real money still counts: a hotel or a big addition.
  assert.ok(permitToSignal(DENVER, { ...ROW, UNITS: '', VALUATION: 4_000_000 }));
  assert.equal(permitToSignal(DENVER, { ...ROW, PERMIT_NUM: '' }), null);
});

test('the where clause asks for recent kept classes with units or value', () => {
  const w = permitWhere(DENVER, new Date(Date.UTC(2026, 0, 15)));
  assert.match(w, /DATE_ISSUED >= DATE '2026-01-15'/);
  assert.match(w, /CLASS IN \('New Building','Addition'/);
  assert.match(w, /VALUATION >= 1000000/);
  const url = permitQueryUrl(DENVER, new Date(Date.UTC(2026, 0, 15)), { limit: 50 });
  assert.match(url, /^https:\/\/services1\.arcgis\.com\//);
  assert.match(url, /resultRecordCount=50/);
  assert.match(url, /f=json/);
});

test('money reads short', () => {
  assert.equal(money(51862516), '$52M');
  assert.equal(money(3500000), '$3.5M');
  assert.equal(money(299500), '$300K');
  assert.equal(money(0), '');
});
