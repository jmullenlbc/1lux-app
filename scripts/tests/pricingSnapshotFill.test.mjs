/**
 * Frozen pricing snapshots vs lines added later (2026-09-04).
 *
 * Every project carries the pricing sheet as it stood when the project was
 * created. Wallpacks, pathway lighting, the landscape cap and the solar
 * multipliers were all added AFTER the April 2026 projects were made, so their
 * snapshots have no entry for them, and the engine read "no entry" as $0.
 * Fulshear's live page showed $0 wallpacks and $0 pathway while a fresh run of
 * the same answers priced them at $24,150 and $22,320.
 *
 * Rule: snapshot values win for every key they carry; keys the snapshot never
 * had fall through to the master sheet.
 *
 * Run: node --test scripts/tests/pricingSnapshotFill.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget, fillPricingDefaults } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

const FULSHEAR = {
  grossSf: 491_450, unitsSf: 491_450, numUnits: 372, corridorSf: 132_370, interiorAmenitySf: 3_800,
  exteriorAmenitySf: 3_000, bohSf: 11_400, numSurfaceParking: 537, lotSf: 600_000, buildingFootprintSf: 185_500,
  buildingTypeKey: 'garden',
};
const SECTIONS = { exterior: { amenityLevel: 'medium', siteDesignLevel: 'conventional' }, amenities: { interiorLevel: 'medium' } };

// An April-2026 snapshot: the sheet with every later addition stripped out.
function aprilSnapshot() {
  const s = JSON.parse(JSON.stringify(PRICING));
  delete s.exterior.wallpacks; delete s.exterior.pathway; delete s.exterior.landscape;
  delete s.exterior.solarMultiplier; delete s.boh.maxPctOfGross; delete s.estimation;
  return s;
}

test('a snapshot missing the newer lines prices them like the master sheet', () => {
  const fresh = calculateBudget(FULSHEAR, SECTIONS);
  const snap  = calculateBudget(FULSHEAR, SECTIONS, aprilSnapshot());
  assert.ok(fresh.sections.exterior.wallpacks.product > 0, 'fresh run prices wallpacks');
  assert.ok(fresh.sections.exterior.pathway.product > 0, 'fresh run prices pathway');
  assert.equal(snap.sections.exterior.wallpacks.product, fresh.sections.exterior.wallpacks.product);
  assert.equal(snap.sections.exterior.pathway.product,   fresh.sections.exterior.pathway.product);
  assert.equal(snap.sections.exterior.landscape.product, fresh.sections.exterior.landscape.product);
  assert.equal(snap.totalWithControls, fresh.totalWithControls);
});

test('snapshot values still win over the master sheet for keys the snapshot carries', () => {
  const s = aprilSnapshot();
  s.base.perSf = 0.36;                 // the older units rate, frozen on the project
  s.interiorAmenities.medium = 7;
  const snap = calculateBudget(FULSHEAR, SECTIONS, s);
  assert.equal(snap.sections.units.base.product, Math.round(491_450 * 0.36 * 100) / 100);
  assert.equal(snap.sections.interior.product, 3_800 * 7);
  assert.notEqual(snap.sections.units.base.product, calculateBudget(FULSHEAR, SECTIONS).sections.units.base.product);
});

test('a snapshot with the newer lines is untouched: no key is overwritten by the sheet', () => {
  const s = JSON.parse(JSON.stringify(PRICING));
  s.exterior.pathway.dollarsPerUnit.garden = 90;
  s.exterior.wallpacks.perFixture = 400;
  const snap = calculateBudget(FULSHEAR, SECTIONS, s);
  assert.equal(snap.sections.exterior.pathway.rate, 90);
  assert.equal(snap.sections.exterior.wallpacks.each, 400);
});

test('fillPricingDefaults: nested fill, arrays and scalars replaced whole, inputs not mutated', () => {
  const def = { a: 1, nest: { x: 1, y: 2, deep: { p: 1 } }, list: [1, 2] };
  const ov  = { nest: { y: 5, deep: {} }, list: [9] };
  const out = fillPricingDefaults(def, ov);
  assert.deepEqual(out, { a: 1, nest: { x: 1, y: 5, deep: { p: 1 } }, list: [9] });
  assert.deepEqual(def, { a: 1, nest: { x: 1, y: 2, deep: { p: 1 } }, list: [1, 2] });
  assert.deepEqual(ov,  { nest: { y: 5, deep: {} }, list: [9] });
  assert.equal(fillPricingDefaults(def, null), def);
  assert.equal(fillPricingDefaults(def, 'junk'), def);
});
