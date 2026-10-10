// Denver land sales (Mike 10-9, land offer plan): closed sales of buildable
// land to a company, from the assessor parcel file. Rules only, no AI.
// Run: node --test scripts/tests/landSales.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMIT_PROFILES, permitToSignal, permitQueryUrl, keepLandSale, zoneStories, LAND_MIN_SF } from '../../src/lib/market-intel/permitRules.js';
import { SOURCES } from '../../src/lib/market-intel/sourceCatalog.js';
import { KIND_RANK } from '../../src/lib/market-intel/supersedeRules.js';

const p = PERMIT_PROFILES.DENVER_LAND;
const row = (extra = {}) => ({
  SCHEDNUM: '0234500010000', SITUS_ADDRESS_LINE1: '1700 N BROADWAY', ZONE_10: 'C-MX-8', D_CLASS_CN: 'VACANT LAND',
  OWNER_NAME: 'BROADWAY PARTNERS LLC', LAND_AREA: 20000, TOT_UNITS: 0, COM_GROSS_AREA: 0, RECEPTION_NUM: '2026123456',
  SALE_DATE: Date.UTC(2026, 8, 15), SALE_PRICE: 4_500_000, ...extra,
});

test('zone stories read from the district name', () => {
  assert.equal(zoneStories('C-MX-8'), 8);
  assert.equal(zoneStories('G-RH-3'), 3);
  assert.equal(zoneStories('D-C'), 20);
  assert.equal(zoneStories('CMP-EI'), 20);
  assert.equal(zoneStories('S-SU-D'), 0);
  assert.equal(zoneStories(null), 0);
});

test('which land sales are kept', () => {
  const co = 'ACME DEVELOPMENT LLC';
  // Vacant land to a company: any size.
  assert.ok(keepLandSale({ permitClass: 'VACANT LAND', neighborhood: 'C-MX-3', landArea: 4000, ownerName: co }));
  // Improved commercial on a 3 story zone: a redevelopment only if tall enough, so dropped.
  assert.equal(keepLandSale({ permitClass: 'COMMERCIAL-RETAIL', neighborhood: 'C-MX-3', landArea: 40000, ownerName: co }), false);
  // Improved commercial on an 8 story zone, a quarter acre or more: kept.
  assert.ok(keepLandSale({ permitClass: 'COMMERCIAL-RETAIL', neighborhood: 'C-MX-8', landArea: LAND_MIN_SF, ownerName: co }));
  assert.equal(keepLandSale({ permitClass: 'COMMERCIAL-RETAIL', neighborhood: 'C-MX-8', landArea: 5000, ownerName: co }), false);
  // Downtown: a tower lot is small but tall.
  assert.ok(keepLandSale({ permitClass: 'COMMERCIAL-OFFICE', neighborhood: 'D-C', landArea: 12000, ownerName: co }));
  // Row house zone needs a quarter acre.
  assert.equal(keepLandSale({ permitClass: 'VACANT LAND', neighborhood: 'G-RH-3', landArea: 6000, ownerName: co }), false);
  assert.ok(keepLandSale({ permitClass: 'VACANT LAND', neighborhood: 'G-RH-3', landArea: 12000, ownerName: co }));
  // A person buying, not a company: dropped.
  assert.equal(keepLandSale({ permitClass: 'VACANT LAND', neighborhood: 'C-MX-8', landArea: 20000, ownerName: 'SMITH,JOHN A' }), false);
});

test('a kept sale becomes a LAND signal with the buyer tagged', () => {
  const s = permitToSignal(p, row());
  assert.ok(s);
  assert.equal(s.kind, 'LAND');
  assert.equal(s.permitNumber, '2026123456');
  assert.equal(s.valuation, 4_500_000);
  assert.equal(s.neighborhood, 'C-MX-8');
  assert.match(s.title, /^Land sale: /);
  assert.match(s.summary, /\$4\.5M|4,500,000/);
  assert.deepEqual(s.extracted.companies[0].role, 'BUYER');
  assert.match(s.extracted.companies[0].name, /Broadway Partners/i);
  assert.equal(s.unitCount, null);
  // Not kept: a person, or a small lot on a low zone.
  assert.equal(permitToSignal(p, row({ OWNER_NAME: 'DOE,JANE' })), null);
  assert.equal(permitToSignal(p, row({ D_CLASS_CN: 'COMMERCIAL-RETAIL', ZONE_10: 'C-MX-3' })), null);
});

test('the source and query are keyless and carry no $10M floor', () => {
  assert.ok(SOURCES.some(s => s.feedUrl === p.layerUrl));
  const url = permitQueryUrl(p, new Date('2026-01-01'), {});
  assert.match(url, /^https:\/\/services1\.arcgis\.com/);
  assert.doesNotMatch(url, /key|token/i);
  const plain = decodeURIComponent(url).replace(/\+/g, ' ');
  assert.match(plain, /SALE_PRICE >= 1000/);
  assert.doesNotMatch(plain, /10000000/);
  assert.match(plain, /SALE_DATE >= DATE '2026-01-01'/);
});

test('a land sale ranks with an article, below a concept plan', () => {
  assert.equal(KIND_RANK.LAND, KIND_RANK.ARTICLE);
  assert.ok(KIND_RANK.CONCEPT > KIND_RANK.LAND);
});
