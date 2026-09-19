/**
 * Ceiling fans on a CONCEPTUAL budget.
 *
 * Mike 2026-09-05 set it at $180 gross; Mike 2026-09-16, reconciling Lone Tree
 * against his own sheet: "keep $175 for fans on the gross number for the master
 * pricing sheet." So before a design fan level is picked, every fan location is
 * $175 GROSS and the engine takes the $35 disk credit off it: $140 net. Once
 * the design questionnaire picks a level, that level's price minus the same
 * credit takes over (low $142−35, medium $190−35, high $270−35).
 *
 * Run: node --test scripts/tests/fansConceptual.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget } from '../../src/lib/calculations.js';
import { PRICING } from '../../src/lib/pricing.js';
import { computeIntakeEstimate } from '../../src/lib/intake/estimate.js';

const PD = { numUnits: 100 };
const fans = (responses, pricing) => calculateBudget(PD, responses, pricing).sections.units.fans.product;
const CREDIT = PRICING.fans.diskCredit;

test('master sheet: conceptual fan price is $175 gross, $35 credit', () => {
  assert.equal(PRICING.fans.conceptualPerFan, 175);
  assert.equal(CREDIT, 35);
});

test('conceptual (no fan level picked) charges $175 gross − $35 credit = $140 per fan', () => {
  // masterOnly = one fan per unit → 100 fans
  assert.equal(fans({ units: { fans: 'masterOnly' } }), 100 * (175 - CREDIT));
});

test('a design fan level replaces the conceptual price, net of the same credit', () => {
  assert.equal(fans({ units: { fans: 'masterOnly', fanLevel: 'low'    } }), 100 * (PRICING.designFanLevels.low    - CREDIT));
  assert.equal(fans({ units: { fans: 'masterOnly', fanLevel: 'medium' } }), 100 * (PRICING.designFanLevels.medium - CREDIT));
  assert.equal(fans({ units: { fans: 'masterOnly', fanLevel: 'high'   } }), 100 * (PRICING.designFanLevels.high   - CREDIT));
});

test('an unknown fan level falls back to the conceptual price, not $0', () => {
  assert.equal(fans({ units: { fans: 'masterOnly', fanLevel: 'platinum' } }), 100 * (175 - CREDIT));
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

// Mike 2026-09-16: "Fans should always be counted per bedroom and if living
// room is chosen in the options too then that can be per unit. A 3 bedroom
// unit with master bedroom and living room chosen should be 2 fans. A studio
// with that same option chosen should only be 1 fan."
const drawingsWith = (unitTypes) => ({
  sources: ['a.pdf'], unitTypes,
  projectTotals: { grossInteriorSf: 260000, garageSf: null, corridorSf: null, bohSf: null, statedTotalUnits: null, buildingType: 'garden' },
  siteData: null, conflicts: [], overallConfidence: 0.9,
});

test('conceptual budget: the per-bedroom takeoff count reaches the engine, so studios get no bedroom fan', () => {
  // 20 studios, 100 one-beds, 80 three-beds; "Master bed + Living room".
  const drawings = drawingsWith([
    { code: 'S1', qty: 20, unitSf: 550,  bedrooms: 0, confidence: 0.95 },
    { code: 'A1', qty: 100, unitSf: 750, bedrooms: 1, confidence: 0.95 },
    { code: 'C1', qty: 80, unitSf: 1300, bedrooms: 3, confidence: 0.95 },
  ]);
  const { budget, projectData } = computeIntakeEstimate({ answers: { ceilingFans: 'Master bed + Living room' }, drawings });
  assert.equal(projectData.numFans, 180 + 200, '180 units with a bedroom + 200 living rooms');
  assert.equal(budget.fanCount, 380, 'not 200 × 2 = 400');
  assert.equal(budget.sections.units.fans.product, 380 * (175 - CREDIT));
});

test('conceptual budget: a studio building with "Master bed + Living room" gets one fan per unit', () => {
  const drawings = drawingsWith([{ code: 'S1', qty: 40, unitSf: 550, bedrooms: 0, confidence: 0.95 }]);
  const { budget } = computeIntakeEstimate({ answers: { ceilingFans: 'Master bed + Living room' }, drawings });
  assert.equal(budget.fanCount, 40);
});

test('migration 0088 sets the SAVED master sheet to $175 — a saved 180 would otherwise beat the code default', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../../prisma/migrations/0088_fan_conceptual_175/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /conceptualPerFan/);
  assert.match(sql, /'175'/);
  assert.match(sql, /"key" = 'pricing'/);
});

test('conceptual budget: with no bedroom mix the engine keeps its per-unit multiplier as the last resort', () => {
  const drawings = drawingsWith([{ code: 'A1', qty: 50, unitSf: 750, bedrooms: null, confidence: 0.95 }]);
  const { projectData, budget } = computeIntakeEstimate({ answers: { ceilingFans: 'Master bed + Living room' }, drawings });
  assert.equal(projectData.numFans, null);
  assert.equal(budget.fanCount, 100);
});
