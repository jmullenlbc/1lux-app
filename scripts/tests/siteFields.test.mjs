/**
 * The translation between what a site plan says and what Project Info stores.
 *
 * Pure arithmetic and mapping — no model, no database, no canvas. The cases
 * that matter are the ones where a field must NOT be proposed: a number the
 * drawing did not state must stay absent rather than arrive as a zero, because
 * a blank Project Info field is visible in the missing-inputs warning and a zero
 * is indistinguishable from a real zero that silently prices at $0.
 *
 * Run: node --test scripts/tests/siteFields.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACRE_SF, SURFACE_STALL_SF, lotSquareFeet, stallBreakdown,
  proposeSiteFields, writableSiteKeys,
} from '../../src/lib/siteFields.js';

const byKey = (rows) => Object.fromEntries(rows.map(r => [r.key, r]));

// ── lot area ─────────────────────────────────────────────────────────────────

test('acres convert to square feet at the legal definition', () => {
  const lot = lotSquareFeet({ lotAcres: 16.5, lotSf: null });
  assert.equal(lot.sf, Math.round(16.5 * ACRE_SF));
  assert.equal(lot.sf, 718740);
  assert.equal(lot.from, 'lotAcres');
});

test('a stated SF figure beats acreage when the drawing gives both', () => {
  // Hand-lettered acreage is the most misread figure on these drawings
  // (16.56 / 16.86 against a true 16.50 across three render resolutions), so a
  // figure that was read as digits wins.
  const lot = lotSquareFeet({ lotAcres: 16.86, lotSf: 718740 });
  assert.equal(lot.sf, 718740);
  assert.equal(lot.from, 'lotSf');
  assert.equal(lot.acres, 16.86, 'the acreage is still carried for the checks to compare');
});

test('no lot area at all is null, never zero', () => {
  assert.equal(lotSquareFeet({}), null);
  assert.equal(lotSquareFeet({ lotAcres: 0, lotSf: 0 }), null);
  assert.equal(lotSquareFeet({ lotAcres: null, lotSf: null }), null);
});

// ── stall breakdown ──────────────────────────────────────────────────────────

test('the stall breakdown reports which kinds were actually read', () => {
  const b = stallBreakdown({ surfaceParking: 400, garages: 120, carports: null });
  assert.equal(b.total, 520);
  assert.deepEqual(b.kinds, ['surface', 'garages']);
  assert.equal(b.complete, false, 'two of three kinds is not a complete breakdown');
});

test('all three kinds read marks the breakdown complete', () => {
  const b = stallBreakdown({ surfaceParking: 400, garages: 120, carports: 160 });
  assert.equal(b.total, 680);
  assert.equal(b.complete, true);
});

test('a zero stall count is a reading, not a missing value', () => {
  const b = stallBreakdown({ surfaceParking: 0, garages: null, carports: null });
  assert.equal(b.total, 0);
  assert.deepEqual(b.kinds, ['surface']);
});

test('no stall types read at all is null', () => {
  assert.equal(stallBreakdown({ parkingProvided: 680 }), null);
});

// ── the proposal ─────────────────────────────────────────────────────────────

test('a full site data block proposes every field it stated', () => {
  const rows = byKey(proposeSiteFields({
    lotAcres: 16.5, lotSf: null, surfaceParking: 520, garages: 120, carports: 40,
    amenitySf: 12000, clubhouseSf: 4200, confidence: 0.8,
  }));
  assert.equal(rows.lotSf.value, 718740);
  assert.equal(rows.numSurfaceParking.value, 520);
  assert.equal(rows.numGarages.value, 120);
  assert.equal(rows.numCarports.value, 40);
  assert.equal(rows.exteriorAmenitySf.value, 12000);
  assert.equal(rows.interiorAmenitySf.value, 4200);
});

test('a converted lot area shows its arithmetic to the reviewer', () => {
  const rows = byKey(proposeSiteFields({ lotAcres: 16.5 }));
  assert.match(rows.lotSf.note, /16\.5 acres/);
  assert.match(rows.lotSf.note, /confirm/i);
});

test('a stated SF lot needs no explanation', () => {
  const rows = byKey(proposeSiteFields({ lotSf: 718740 }));
  assert.equal(rows.lotSf.note, null);
});

test('fields the drawing did not state are absent, not zero', () => {
  const rows = byKey(proposeSiteFields({
    lotAcres: 16.5, surfaceParking: null, garages: null, carports: null,
    amenitySf: null, clubhouseSf: null,
  }));
  assert.deepEqual(Object.keys(rows), ['lotSf']);
  assert.ok(!('numSurfaceParking' in rows), 'a null read must not become a written zero');
});

test('the unit count is never proposed — the unit matrix owns it', () => {
  // A site plan's "324 D.U." is real evidence, but as a CHECK against a matrix a
  // human already accepted, never as a second writer to the same field.
  const rows = byKey(proposeSiteFields({ totalUnits: 324, lotAcres: 16.5 }));
  assert.ok(!('numUnits' in rows));
  assert.ok(!writableSiteKeys().includes('numUnits'));
});

test('the building count is proposed and writable — it sizes wallpacks', () => {
  // Switched on 2026-08-16 (Mike's yes). calculations.js uses numBuildings
  // ahead of the walk-up fallback for building wallpack quantities.
  const rows = byKey(proposeSiteFields({ buildingCount: 7 }));
  assert.equal(rows.numBuildings.value, 7);
  assert.match(rows.numBuildings.note, /wallpack/i);
  assert.match(rows.numBuildings.note, /clubhouse/i, 'the reviewer is warned the drawing total may include a clubhouse');
  assert.ok(writableSiteKeys().includes('numBuildings'));
});

test('an unstated building count stays absent, never zero', () => {
  const rows = byKey(proposeSiteFields({ buildingCount: null, lotSf: 718740 }));
  assert.ok(!('numBuildings' in rows));
});

test('replacing a number somebody already entered is flagged as an overwrite', () => {
  const rows = byKey(proposeSiteFields({ surfaceParking: 520 }, { numSurfaceParking: 480 }));
  assert.equal(rows.numSurfaceParking.current, 480);
  assert.equal(rows.numSurfaceParking.overwrites, true);
});

test('proposing the same number that is already there is not an overwrite', () => {
  const rows = byKey(proposeSiteFields({ surfaceParking: 520 }, { numSurfaceParking: 520 }));
  assert.equal(rows.numSurfaceParking.overwrites, false);
});

test('filling a blank field is not an overwrite', () => {
  const rows = byKey(proposeSiteFields({ surfaceParking: 520 }, { numSurfaceParking: null }));
  assert.equal(rows.numSurfaceParking.overwrites, false);
});

test('the fields on the critical-inputs list are marked as such', () => {
  // lotSf, numSurfaceParking and exteriorAmenitySf are three of the six inputs
  // that silently price at $0 when blank. See src/lib/projectInputChecks.js.
  const rows = byKey(proposeSiteFields({ lotAcres: 16.5, surfaceParking: 520, amenitySf: 12000, garages: 120 }));
  assert.equal(rows.lotSf.critical, true);
  assert.equal(rows.numSurfaceParking.critical, true);
  assert.equal(rows.exteriorAmenitySf.critical, true);
  assert.equal(rows.numGarages.critical, false, 'garages are not on the critical list');
});

test('an empty reading proposes nothing at all', () => {
  assert.deepEqual(proposeSiteFields({}), []);
  assert.deepEqual(proposeSiteFields({ confidence: 0.9, notes: 'nothing legible' }), []);
});

test('a negative number is refused rather than written', () => {
  assert.deepEqual(proposeSiteFields({ surfaceParking: -12 }), []);
});

test('the stall land-area constant stays at the conservative end', () => {
  // Only ever used to prove a stall count CANNOT fit. Raising it would start
  // firing on efficiently laid-out sites.
  assert.ok(SURFACE_STALL_SF <= 320, 'must stay low enough to only catch impossibilities');
});

// ── total building gross SF ──────────────────────────────────────────────────

test('a stated building gross SF is proposed into grossSf', () => {
  const rows = byKey(proposeSiteFields({ grossSf: 299441, confidence: 0.7 }));
  assert.equal(rows.grossSf.value, 299441);
  assert.match(rows.grossSf.note, /GROSS/, 'the reviewer is told gross was preferred over net');
  assert.ok(writableSiteKeys().includes('grossSf'), 'the commit route may write it');
});

test('no stated gross SF proposes nothing — never a zero', () => {
  const rows = byKey(proposeSiteFields({ grossSf: null, totalUnits: 300 }));
  assert.equal(rows.grossSf, undefined);
});
