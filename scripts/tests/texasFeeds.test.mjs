// Texas feeds (Mike 10-29): Houston plats, Irving zoning cases, TDHCA housing
// tax credit lists. Pure, no DB, no fetch: small rows copied from the live feeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMIT_PROFILES as P, profileForSource, permitToSignal, permitWhere,
  houstonPlatKey, houstonPlatProjects, houstonPlatKeep,
  irvingCaseKey, irvingKeep, irvingFiledAt,
  tdhcaMetro, tdhcaLatestLinks, tdhcaSheetRows, tdhcaKeep, tdhcaDeveloper, tdhcaLatest,
} from '../../src/lib/market-intel/permitRules.js';
import { SOURCES as SOURCE_CATALOG } from '../../src/lib/market-intel/sourceCatalog.js';

const KEYS = ['HOUSTON_PLATS', 'IRVING_ZONING', 'TDHCA_DALLAS', 'TDHCA_HOUSTON', 'TDHCA_AUSTIN', 'TDHCA_SAN_ANTONIO'];
const MARKET = { HOUSTON_PLATS: 'HOUSTON', IRVING_ZONING: 'DALLAS', TDHCA_DALLAS: 'DALLAS', TDHCA_HOUSTON: 'HOUSTON', TDHCA_AUSTIN: 'AUSTIN', TDHCA_SAN_ANTONIO: 'SAN_ANTONIO' };

test('each Texas feed has its own feed address, a CONCEPT kind and a catalog row', () => {
  const urls = Object.values(P).map(p => p.layerUrl);
  for (const k of KEYS) {
    assert.equal(P[k].kind, 'CONCEPT', k);
    assert.equal(urls.filter(u => u === P[k].layerUrl).length, 1, `${k} shares a feed address`);
    assert.equal(profileForSource({ feedUrl: P[k].layerUrl, market: 'X' }).key, k);
    const row = SOURCE_CATALOG.find(s => s.feedUrl === P[k].layerUrl);
    assert.ok(row, `${k} has no catalog row`);
    assert.equal(row.market, MARKET[k]);
    assert.equal(row.sourceType, 'ARCGIS_PERMITS');
    assert.ok(!/[–—]/.test(row.notes), `${k} notes carry a dash`);
  }
});

// ── Houston plats ──
const plat = (o) => ({ AppNo: '25-1001', AppCode: 'C3P', AppStatus: 'Approved', SubdivisionName: 'Greens at Retton Apartments', LotCount: 0, ReserveCount: 1, ReserveSize: 8.4, AppSubmitDate: Date.UTC(2026, 3, 2), ...o });

test('Houston plats ask the server for housing names on an acre or more', () => {
  const w = permitWhere(P.HOUSTON_PLATS, new Date('2026-01-15T00:00:00Z'));
  assert.match(w, /AppSubmitDate >= DATE '2026-01-15'/);
  assert.match(w, /ReserveSize >= 1/);
  assert.match(w, /UPPER\(SubdivisionName\) LIKE '%APARTMENT%'/);
  assert.match(w, /LIKE '%SENIOR%'/);
});

test('Houston plats keep apartment reserves, drop house lots, small and non housing plats', () => {
  assert.equal(houstonPlatKeep(plat()), '');
  assert.equal(houstonPlatKeep(plat({ SubdivisionName: 'Fifth Ward Senior Housing Addition' })), '');
  assert.equal(houstonPlatKeep(plat({ SubdivisionName: 'Cypress Creek BTR', LotCount: 120 })), '');
  assert.equal(houstonPlatKeep(plat({ SubdivisionName: 'Bellaire Villas', LotCount: 18 })), 'house lots');
  assert.equal(houstonPlatKeep(plat({ ReserveSize: 0.4 })), 'too small');
  assert.equal(houstonPlatKeep(plat({ SubdivisionName: 'Senior Living Self Storage' })), 'not housing');
  assert.equal(houstonPlatKeep(plat({ SubdivisionName: 'Westpark Industrial Reserve' })), 'not housing');
  assert.equal(houstonPlatKeep(plat({ AppStatus: 'Withdrawn' })), 'dead');
});

test('Houston plats: every plat for one project is one row, keyed on the project', () => {
  assert.equal(houstonPlatKey('Lofts at Wayfarer Partial Replat No 1'), 'lofts-at-wayfarer');
  assert.equal(houstonPlatKey('Lofts at Wayfarer'), 'lofts-at-wayfarer');
  const rows = houstonPlatProjects([
    plat({ AppNo: '25-0100', SubdivisionName: 'Lofts at Wayfarer', AppSubmitDate: Date.UTC(2025, 10, 1) }),
    plat({ AppNo: '26-0200', AppCode: 'C2R', SubdivisionName: 'Lofts at Wayfarer Partial Replat No 1', AppSubmitDate: Date.UTC(2026, 2, 1) }),
    plat(),
  ]);
  assert.equal(rows.length, 2);
  const wayfarer = rows.find(r => r.AppNo === '26-0200');
  assert.equal(wayfarer.platCount, 2);
  const s = permitToSignal(P.HOUSTON_PLATS, wayfarer);
  assert.equal(s.kind, 'CONCEPT');
  assert.equal(s.permitNumber, 'HOU-PLAT-lofts-at-wayfarer');
  assert.match(s.title, /^Plat filed, units not stated: Lofts at Wayfarer Partial Replat No 1, Houston/);
  assert.match(s.summary, /2 plats filed/);
  assert.match(s.summary, /replat 26-0200/);
  assert.equal(permitToSignal(P.HOUSTON_PLATS, plat({ LotCount: 40, SubdivisionName: 'Riverside Villas' })), null);
});

// ── Irving zoning cases ──
const irv = (o) => ({ CaseNumber: '2025-257-ZC', District: 'Las Colinas', Request: 'Rezoning from C-W to R-MF-2 for a 474 unit multifamily development', Status: 'Pending', ApplicationDate: Date.UTC(2025, 6, 9), ApplicationYear: 2025, P_ZDate: null, Applicant: 'Kimley-Horn and Associates', Owner: 'LC Land Partners LLC', SiteAddress: '600 E LAS COLINAS BLVD', FLU_TO: '', ...o });

test('Irving case numbers become one key per case', () => {
  assert.equal(irvingCaseKey('2025-166-ZC A'), '2025-166-ZC');
  assert.equal(irvingCaseKey('old 2026-7-mfcp'), '2026-7-MFCP');
  assert.equal(irvingCaseKey('no case'), '');
});

test('Irving keeps multifamily rezonings and drops the rest', () => {
  assert.equal(irvingKeep(irv()), '');
  assert.equal(irvingKeep(irv({ CaseNumber: '2025-66-MFCP', Request: 'Multifamily concept plan' })), '');
  assert.equal(irvingKeep(irv({ CaseNumber: '2025-90-CP', Request: 'Future land use to Mixed Use' })), 'case type');
  assert.equal(irvingKeep(irv({ Status: 'Withdrawn' })), 'dead');
  assert.equal(irvingKeep(irv({ Request: 'Rezoning from R-MF-1 to allow conversion to a quadplex' })), 'small');

  const s = permitToSignal(P.IRVING_ZONING, irv());
  assert.equal(s.permitNumber, '2025-257-ZC');
  assert.equal(s.unitCount, 474);
  assert.match(s.title, /^Rezoning filed, 474 units: 600 E Las Colinas Blvd, Irving/i);
  assert.ok(s.extracted.companies.some(c => /LC Land Partners/.test(c.name)));
  assert.equal(s.extracted.metro, 'Dallas, TX');

  // R-AB is a restaurant with alcohol, not apartments.
  assert.equal(permitToSignal(P.IRVING_ZONING, irv({ CaseNumber: '2025-12-ZC', Request: 'Rezoning from C-C to S-P-1 (R-AB) restaurant with alcohol sales' })), null);
  // A multifamily concept plan is apartments by its case type, even with no request text.
  assert.ok(permitToSignal(P.IRVING_ZONING, irv({ CaseNumber: '2025-66-MFCP', Request: null })));
  // Retirement community with no count is kept, units not stated.
  const r = permitToSignal(P.IRVING_ZONING, irv({ CaseNumber: '2026-325-ZC', Request: 'Rezoning to S-P-1 for a retirement community' }));
  assert.ok(r);
  assert.equal(r.unitCount, null);
});

test('Irving filing date falls back to the year when the date is off', () => {
  assert.equal(irvingFiledAt(irv()).toISOString().slice(0, 10), '2025-07-09');
  assert.equal(irvingFiledAt(irv({ ApplicationDate: 0 })).toISOString().slice(0, 10), '2025-01-01');
  assert.equal(irvingFiledAt(irv({ ApplicationDate: Date.UTC(2019, 0, 1), P_ZDate: Date.UTC(2025, 9, 6) })).toISOString().slice(0, 10), '2025-10-06');
  assert.equal(permitWhere(P.IRVING_ZONING, new Date('2025-10-29T00:00:00Z')), 'ApplicationYear >= 2025');
});

// ── TDHCA housing tax credits ──
test('TDHCA picks the newest list off each program page', () => {
  const nine = `
    <a href="/sites/default/files/multifamily/docs/htc-9pct/260723-HTC9pct-AwardWaitingList.xlsx">old</a>
    <a href="/sites/default/files/multifamily/docs/htc-9pct/261014-AwardWaitingList-Tentative.xlsx">tentative</a>
    <a href="/sites/default/files/multifamily/docs/htc-9pct/261014-HTC9pct-AwardWaitingList.xlsx">new</a>
    <a href="/sites/default/files/multifamily/docs/htc-9pct/260301-AppLog.xlsx">log</a>`;
  assert.deepEqual(tdhcaLatestLinks(nine, '9'), ['/sites/default/files/multifamily/docs/htc-9pct/261014-HTC9pct-AwardWaitingList.xlsx']);
  const four = `
    <a href="/docs/htc-4pct/2026261001-4HTC-StatusLog.xlsx">a</a>
    <a href="/docs/htc-4pct/2026260915-4HTC-StatusLog.xlsx">b</a>
    <a href="/docs/htc-4pct/2025251215-4HTC-StatusLog.xlsx">c</a>
    <a href="/docs/htc-4pct/2024241215-4HTC-StatusLog.xlsx">d</a>`;
  assert.deepEqual(tdhcaLatestLinks(four, '4'), ['/docs/htc-4pct/2026261001-4HTC-StatusLog.xlsx', '/docs/htc-4pct/2025251215-4HTC-StatusLog.xlsx']);
});

const FOUR_SHEET = [
  ['2026 4% Housing Tax Credit Status Log', '', '', ''],
  ['Updated as of 10/1/2026'],
  [],
  ['TDHCA Number', 'Previous TDHCA #', 'Development Name', 'Development Address', 'Development City', 'Development County', 'Total Units2', 'Construction Type', 'Target Population', 'Application Status', 'Applicant Contact', 'Applicant Email'],
  ['Region 3'],
  ['26401', '', 'Elm Street Flats', '1200 Elm St &amp; Main', 'Dallas', 'Dallas', 312, 'NC', 'General', 'Active', 'Jane Doe', 'jdoe@ldgdevelopment.com'],
  ['26402', '', 'Oak Manor', '45 Oak Ln', 'Houston', 'Harris', 180, 'Acq/Rehab', 'General', 'Active', 'Bob Roe', 'bob@gmail.com'],
  ['24702/25453', '', 'Cedar Lofts', '9 Cedar Ave', 'Austin', 'Travis', 96, 'New Construction', 'Elderly', 'Withdrawn', 'Ann Poe', 'ann@poe.com'],
  ['26410', '25411', 'Pecan Place', '77 Pecan Rd', 'Converse', 'Bexar', 240, 'NC', 'General', 'Active', 'Sam Lee', 'slee@pecandev.com'],
  ['25411', '', 'Pecan Place', '77 Pecan Rd', 'Converse', 'Bexar', 240, 'NC', 'General', 'Active', 'Sam Lee', 'slee@pecandev.com'],
  ['26420', '', 'Lubbock Commons', '1 Main', 'Lubbock', 'Lubbock', 120, 'NC', 'General', 'Active', 'X', 'x@x.com'],
  ['Total', '', '', '', '', '', 1188],
];

test('TDHCA sheet: header found, footnote digits off, region and total rows skipped', () => {
  const rows = tdhcaSheetRows(FOUR_SHEET, '4');
  assert.equal(rows.length, 6);
  assert.equal(rows[0].number, '26401');
  assert.equal(rows[0].units, 312);
  assert.equal(rows[0].version.toISOString().slice(0, 10), '2026-10-01');
  assert.equal(rows[2].number, '25453');
  assert.equal(rows[3].prev, '25411');
  assert.throws(() => tdhcaSheetRows([['no header']], '4'));
});

test('TDHCA rows map to our four markets by county, then city', () => {
  assert.equal(tdhcaMetro('Collin', 'Plano'), 'Dallas, TX');
  assert.equal(tdhcaMetro('Fort Bend', ''), 'Houston, TX');
  assert.equal(tdhcaMetro('', 'San Antonio'), 'San Antonio, TX');
  assert.equal(tdhcaMetro('Williamson', 'Round Rock'), 'Austin, TX');
  assert.equal(tdhcaMetro('Lubbock', 'Lubbock'), null);
});

test('TDHCA keeps new construction in market, names the developer, replaces refiled deals', () => {
  const rows = tdhcaLatest(tdhcaSheetRows(FOUR_SHEET, '4'));
  assert.ok(!rows.some(r => r.number === '25411'), 'refiled deal kept under its old number');
  const by = Object.fromEntries(rows.map(r => [r.number, r]));
  assert.equal(tdhcaKeep(by['26401'], 'Dallas, TX'), '');
  assert.equal(tdhcaKeep(by['26401'], 'Houston, TX'), 'other market');
  assert.equal(tdhcaKeep(by['26402'], 'Houston, TX'), 'rehab');
  assert.equal(tdhcaKeep(by['25453'], 'Austin, TX'), 'dead');
  assert.equal(tdhcaKeep(by['26420'], 'Dallas, TX'), 'other market');
  assert.equal(tdhcaDeveloper('jdoe@ldgdevelopment.com'), 'ldgdevelopment.com');
  assert.equal(tdhcaDeveloper('bob@gmail.com'), '');

  const s = permitToSignal(P.TDHCA_DALLAS, by['26401']);
  assert.equal(s.kind, 'CONCEPT');
  assert.equal(s.permitNumber, 'TDHCA 26401');
  assert.equal(s.unitCount, 312);
  assert.match(s.title, /^Tax credit housing, 312 units: 1200 Elm St & Main, Dallas/);
  assert.deepEqual(s.extracted.companies.filter(c => c.role === 'DEVELOPER').map(c => c.name), ['ldgdevelopment.com']);
  assert.ok(s.extracted.developerNames.includes('ldgdevelopment.com'));
  assert.match(s.summary, /Developer ldgdevelopment\.com/);
  assert.equal(permitToSignal(P.TDHCA_HOUSTON, by['26401']), null);
  assert.equal(permitToSignal(P.TDHCA_SAN_ANTONIO, by['26410']).permitNumber, 'TDHCA 26410');
});
