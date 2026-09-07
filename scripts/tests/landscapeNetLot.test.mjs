/**
 * Landscape lighting — NET lot, wired 2026-09-04 (Mike: "net lot").
 *
 *   landscape = min((lotSf − buildingFootprintSf) × pctOfNetLotSf, maxTotal)
 *
 * Before this the engine multiplied the FULL lot despite the pricing key
 * being named pctOfNetLotSf. Rules worth protecting:
 *   1. Net lot = lot − footprint when a footprint is on file.
 *   2. No footprint on file → fall back to the full lot (never $0 for lack
 *      of a takeoff figure).
 *   3. The cap still binds; footprint ≥ lot → $0 (no negative lot).
 *   4. The sections object exposes the exact figures the views print.
 *
 * Run: node --test scripts/tests/landscapeNetLot.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

const landscape = (pd, responses = {}) =>
  calculateBudget(pd, responses).sections.exterior.landscape;

const PCT = PRICING.exterior.landscape.pctOfNetLotSf;
const CAP = PRICING.exterior.landscape.maxTotal;

test('net lot = lot − footprint (Fulshear shape: 545,000 − 130,463 = 414,537 → capped)', () => {
  const l = landscape({ lotSf: 545000, buildingFootprintSf: 130463 });
  assert.equal(l.netLotSf, 414537);
  assert.equal(l.lotSf, 545000);
  assert.equal(l.footprintSf, 130463);
  assert.equal(l.pct, PCT);
  assert.equal(l.capped, true);
  assert.equal(l.product, CAP);
});

test('small net lot prices below the cap on the NET figure, not the full lot', () => {
  // 100,000 lot, 40,000 footprint → 60,000 net × 2% = $1,200 (full lot would be $2,000)
  const l = landscape({ lotSf: 100000, buildingFootprintSf: 40000 });
  assert.equal(l.netLotSf, 60000);
  assert.ok(Math.abs(l.product - 60000 * PCT) < 0.01, `got ${l.product}`);
  assert.equal(l.capped, false);
});

test('no footprint on file → falls back to the full lot', () => {
  const l = landscape({ lotSf: 100000 });
  assert.equal(l.netLotSf, 100000);
  assert.ok(Math.abs(l.product - 100000 * PCT) < 0.01);
});

test('footprint at or above the lot → $0, never negative', () => {
  const l = landscape({ lotSf: 50000, buildingFootprintSf: 60000 });
  assert.equal(l.netLotSf, 0);
  assert.equal(l.product, 0);
  assert.equal(l.capped, false);
});

test('no lot on file → $0', () => {
  const l = landscape({ buildingFootprintSf: 40000 });
  assert.equal(l.product, 0);
});

test('the cap is the master-pricing cap ($3,000) and a pricing override moves it', () => {
  assert.equal(CAP, 3000);
  const custom = structuredClone(PRICING);
  custom.exterior.landscape.maxTotal = 10000;
  const l = calculateBudget({ lotSf: 545000, buildingFootprintSf: 130463 }, {}, custom).sections.exterior.landscape;
  assert.ok(Math.abs(l.product - 414537 * PCT) < 0.01, `got ${l.product}`);
  assert.equal(l.capped, false);
});
