// Mike 2026-10-02: the internal wizard's site read records the drive and
// walkway lengths (0114) and the engine prices homes from them, never asking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposeSiteFields, writableSiteKeys } from '../../src/lib/siteFields.js';
import { calculateBudget } from '../../src/lib/calculations.js';

test('the site read proposes both lengths and the commit accepts them', () => {
  const rows = proposeSiteFields({ driveLengthFtMeasured: 2430, walkwayLengthFtMeasured: 1010, scaleBasis: 'graphicBar' }, {});
  const keys = rows.map(r => r.key);
  assert.ok(keys.includes('driveLengthFt'));
  assert.ok(keys.includes('walkwayLengthFt'));
  assert.ok(writableSiteKeys().includes('driveLengthFt'));
  assert.ok(writableSiteKeys().includes('walkwayLengthFt'));
  for (const r of rows.filter(r => /LengthFt$/.test(r.key))) assert.doesNotMatch(String(r.note || ''), /[\u2013\u2014]/);
});

const homes = (pd, ext = {}) => calculateBudget(
  { numUnits: 100, buildingTypeKey: 'townHouses', ...pd },
  { exterior: { pathwayBollards: 'yes', ...ext } },
);

test('a read walkway length prices homes at 1 pole per 40 ft', () => {
  const a = homes({ walkwayLengthFt: 1010 });
  const b = homes({}, { walkwayLengthFt: 1010 });
  const c = homes({});
  assert.equal(a.totalWithControls, b.totalWithControls, 'read length = typed length');
  assert.notEqual(a.totalWithControls, c.totalWithControls, 'differs from the 1 per 8 homes fallback');
});

test('a read drive length counts for homes only, and a typed one wins', () => {
  assert.notEqual(homes({ driveLengthFt: 2430 }).totalWithControls, homes({}).totalWithControls);
  assert.equal(homes({ driveLengthFt: 2430 }, { driveLaneFt: 810 }).totalWithControls, homes({}, { driveLaneFt: 810 }).totalWithControls);
  const apt = pd => calculateBudget({ numUnits: 100, buildingTypeKey: 'midRise', ...pd }, { exterior: {} });
  assert.equal(apt({ driveLengthFt: 2430 }).totalWithControls, apt({}).totalWithControls);
});
