/**
 * Surface parking minimum (Mike 2026-10-15): a BLANK stall count on single
 * family, townhomes, garden and wrap = units × a per-type ratio from the
 * master sheet. Typed 0 stays 0. Structured-parking types stay 0 when blank.
 *
 * Run: node --test scripts/tests/surfaceParkingDefault.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';
import { surfaceStalls } from '../../src/lib/surfaceParkingDefault.js';

const SECTIONS = { exterior: { siteDesignLevel: 'conventional' } };
const perFixture = PRICING.exterior.surfaceParking.perFixture;
const perUnit    = PRICING.exterior.surfaceParking.defaultStallsPerUnit;

test('garden, blank stalls: units × ratio, rounded, then 1 pole per 9 stalls', () => {
  const r = surfaceStalls({ buildingTypeKey: 'garden', numUnits: 324, numSurfaceParking: null }, PRICING);
  assert.equal(r.estimated, true);
  assert.equal(r.stalls, Math.round(324 * perUnit.garden));
  const b = calculateBudget({ grossSf: 301_146, unitsSf: 301_146, numUnits: 324, buildingTypeKey: 'garden' }, SECTIONS);
  const poles = Math.ceil(r.stalls / PRICING.exterior.surfaceParking.stallsPerFixture);
  assert.equal(b.sections.exterior.parking.fixtures, poles);
  assert.equal(b.sections.exterior.parking.product, poles * perFixture);
  assert.equal(b.sections.exterior.parking.stallsEstimated, true);
});

test('typed 0 means zero, not estimated', () => {
  const b = calculateBudget({ grossSf: 301_146, unitsSf: 301_146, numUnits: 324, buildingTypeKey: 'garden', numSurfaceParking: 0 }, SECTIONS);
  assert.equal(b.sections.exterior.parking.product, 0);
  assert.equal(b.sections.exterior.parking.stallsEstimated, false);
});

test('a typed count wins over the estimate', () => {
  const b = calculateBudget({ grossSf: 301_146, unitsSf: 301_146, numUnits: 324, buildingTypeKey: 'garden', numSurfaceParking: '90' }, SECTIONS);
  assert.equal(b.sections.exterior.parking.fixtures, 10);
  assert.equal(b.sections.exterior.parking.stallsEstimated, false);
});

test('structured-parking types stay 0 when blank', () => {
  for (const t of ['highRise', 'midRise', 'podium', 'stackedFlats', 'gurban']) {
    const b = calculateBudget({ grossSf: 300_000, unitsSf: 300_000, numUnits: 300, buildingTypeKey: t }, SECTIONS);
    assert.equal(b.sections.exterior.parking.product, 0, t);
  }
});

test('the ratio comes off the master sheet when one is stored', () => {
  const r = surfaceStalls({ buildingTypeKey: 'wrap', numUnits: 200 },
    { exterior: { surfaceParking: { defaultStallsPerUnit: { wrap: 1 } } } });
  assert.equal(r.stalls, 200);
});
