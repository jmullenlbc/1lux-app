/**
 * Controls: two ceilings, lower wins (2026-09-04).
 *
 * The pricing sheet carries a per-building-type cap (garden $65K, wrap $110K,
 * high-rise $190K …) AND a sheet-wide "controls never exceed $180K". The engine
 * used to let the sheet-wide cap REPLACE the type cap whenever it was present,
 * which is every project created after the global cap was added — and, once the
 * snapshot-fill fix landed, every older project too (Fulshear garden jumped
 * $65,000 → $77,900; Broadstone wrap $110,000 → $180,000).
 *
 * Run: node --test scripts/tests/controlsCap.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

const SECTIONS = { exterior: { siteDesignLevel: 'conventional' } };
const big = (buildingTypeKey, grossSf) => ({ grossSf, unitsSf: grossSf, numUnits: 300, buildingTypeKey });

test('garden: the $65K type cap holds even though the sheet-wide cap is $180K', () => {
  const b = calculateBudget(big('garden', 410_000), SECTIONS);   // 410,000 × 0.19 = 77,900 uncapped
  assert.equal(b.controls, PRICING.controls.rates.garden.cap);
  assert.equal(b.controls, 65_000);
});

test('wrap: $110K type cap holds', () => {
  const b = calculateBudget(big('wrap', 600_000), SECTIONS);     // 600,000 × 0.35 = 210,000 uncapped
  assert.equal(b.controls, 110_000);
});

test('high-rise: the sheet-wide $180K cap is the lower one and wins over the $190K type cap', () => {
  const b = calculateBudget(big('highRise', 800_000), SECTIONS); // 800,000 × 0.50 = 400,000 uncapped
  assert.equal(b.controls, Math.min(PRICING.controls.rates.highRise.cap, PRICING.controls.cap));
  assert.equal(b.controls, 180_000);
});

test('under both caps: plain $/SF of gross', () => {
  const b = calculateBudget(big('garden', 200_000), SECTIONS);
  // Garden is $0.18/SF (Mike 2026-09-05: "split the difference and do $0.18").
  assert.equal(PRICING.controls.rates.garden.perSf, 0.18);
  assert.equal(b.controls, Math.round(200_000 * 0.18 * 100) / 100);
});

test('a frozen sheet with no sheet-wide cap still honors the type cap', () => {
  const s = JSON.parse(JSON.stringify(PRICING));
  delete s.controls.cap;
  const b = calculateBudget(big('garden', 410_000), SECTIONS, s);
  assert.equal(b.controls, 65_000);
});
