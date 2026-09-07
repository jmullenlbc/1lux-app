/**
 * Ceiling fans on a CONCEPTUAL budget.
 *
 * Mike 2026-09-05: "Fans can show $175 at conceptual. It will be more precise in
 * the design questionnaire." — then, asked net or gross: "Should be gross but
 * make it $180." So before a design fan level is picked, every fan location is
 * $180 GROSS and the engine takes the $35 disk credit off it: $145 net. Once
 * the design questionnaire picks a level, that level's price minus the same
 * credit takes over (low $142−35, medium $190−35, high $270−35).
 *
 * Run: node --test scripts/tests/fansConceptual.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';

const PD = { numUnits: 100 };
const fans = (responses, pricing) => calculateBudget(PD, responses, pricing).sections.units.fans.product;
const CREDIT = PRICING.fans.diskCredit;

test('master sheet: conceptual fan price is $180 gross, $35 credit', () => {
  assert.equal(PRICING.fans.conceptualPerFan, 180);
  assert.equal(CREDIT, 35);
});

test('conceptual (no fan level picked) charges $180 gross − $35 credit = $145 per fan', () => {
  // masterOnly = one fan per unit → 100 fans
  assert.equal(fans({ units: { fans: 'masterOnly' } }), 100 * (180 - CREDIT));
});

test('a design fan level replaces the conceptual price, net of the same credit', () => {
  assert.equal(fans({ units: { fans: 'masterOnly', fanLevel: 'low'    } }), 100 * (PRICING.designFanLevels.low    - CREDIT));
  assert.equal(fans({ units: { fans: 'masterOnly', fanLevel: 'medium' } }), 100 * (PRICING.designFanLevels.medium - CREDIT));
  assert.equal(fans({ units: { fans: 'masterOnly', fanLevel: 'high'   } }), 100 * (PRICING.designFanLevels.high   - CREDIT));
});

test('an unknown fan level falls back to the conceptual price, not $0', () => {
  assert.equal(fans({ units: { fans: 'masterOnly', fanLevel: 'platinum' } }), 100 * (180 - CREDIT));
});

test('"none" is $0 regardless of level', () => {
  assert.equal(fans({ units: { fans: 'none', fanLevel: 'high' } }), 0);
});

test('a conceptual price below the credit never goes negative', () => {
  const cheap = { ...PRICING, fans: { ...PRICING.fans, conceptualPerFan: 20 } };
  assert.equal(fans({ units: { fans: 'masterOnly' } }, cheap), 0);
});

test('a blank conceptualPerFan on an old frozen sheet falls back to the legacy net adder', () => {
  // Projects frozen before this key existed have it filled in by
  // fillPricingDefaults; a sheet that explicitly zeroes it should not price
  // fans at $0 — it falls to the legacy net adder instead (no credit taken:
  // that number is already net).
  const frozen = { ...PRICING, fans: { ...PRICING.fans, conceptualPerFan: 0 } };
  assert.equal(fans({ units: { fans: 'masterOnly' } }, frozen), 100 * PRICING.fans.adderPerFan);
});

test('a typed per-fan override is used exactly as typed', () => {
  assert.equal(fans({ units: { fans: 'masterOnly', fansPrice: '200' } }), 100 * 200);
});
