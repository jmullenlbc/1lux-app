/**
 * Maram's Procurement Revenue cards (9-16 call, her Pipedrive dashboard):
 * next-12-months window, $0 months kept, running total, built-in filters,
 * and the `tpl` identity that lets them reach every existing dashboard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFieldWidget } from '../../src/lib/dashboards/engine.js';
import { prebuiltKey, missingPrebuilt } from '../../src/lib/dashboards/prebuilt.js';
import TEMPLATES from '../../prisma/seeds/dashboardTemplates.js';

const now = new Date();
const inMonths = (n) => new Date(now.getFullYear(), now.getMonth() + n, 10).toISOString();
const rows = [
  { contractValue: 900000, averageProbability: 90, procurementStatus: 'OPEN', expectedOrderDate: inMonths(1) },
  { contractValue: 500000, averageProbability: 85, procurementStatus: 'OPEN', expectedOrderDate: inMonths(5) },
  { contractValue: 300000, averageProbability: 50, procurementStatus: 'OPEN', expectedOrderDate: inMonths(1) },
  { contractValue: 200000, averageProbability: 30, procurementStatus: 'WON',  expectedOrderDate: inMonths(2) },
  { contractValue: 700000, averageProbability: 95, procurementStatus: 'OPEN', expectedOrderDate: inMonths(14) }, // past the window
  { contractValue: 100000, averageProbability: 10, procurementStatus: 'OPEN', expectedOrderDate: inMonths(1) },  // under 20%
  { contractValue: 400000, averageProbability: 90, procurementStatus: 'LOST', expectedOrderDate: inMonths(1) },
];
const SALES = (TEMPLATES.TEMPLATES_BY_SECTION || TEMPLATES).SALES;
const card = (tpl) => { const t = SALES.find(t => t.dataSpec.tpl === tpl); return { ...t, dataSpec: t.dataSpec }; };

test('80%+ card: twelve months, $0 months kept, open only, 80%+ only', () => {
  const { series } = runFieldWidget(card('procurement-open-80'), rows, 'SALES');
  assert.equal(series.length, 12);
  assert.equal(series[1].value, 900000);
  assert.equal(series[5].value, 500000);
  assert.equal(series.reduce((a, s) => a + s.value, 0), 1400000);
});

test('20%+ running total counts open and won, and never goes down', () => {
  const { series } = runFieldWidget(card('procurement-open-won-20-cumulative'), rows, 'SALES');
  assert.equal(series.length, 12);
  assert.equal(series[0].value, 0);
  assert.equal(series[1].value, 1200000);
  assert.equal(series[2].value, 1400000);
  assert.equal(series[11].value, 1900000);
  for (let i = 1; i < 12; i++) assert.ok(series[i].value >= series[i - 1].value);
});

test('tpl cards arrive on an existing dashboard once, and stay off once removed', () => {
  assert.equal(prebuiltKey({ tpl: 'procurement-on-hold', terms: [] }), 'tpl:procurement-on-hold');
  const tpls = SALES.filter(t => t.dataSpec.tpl);
  assert.equal(tpls.length, 5);
  assert.equal(missingPrebuilt(SALES, []).length, 5);
  const have = [{ name: 'renamed', dataSpec: JSON.stringify(tpls[0].dataSpec) }];
  assert.equal(missingPrebuilt(SALES, have).length, 4);
  assert.equal(missingPrebuilt(SALES, [], ['tpl:procurement-on-hold']).length, 4);
});

test('probability picker: set steps, and an off-list saved value is kept', async () => {
  const { probabilityOptions, PROBABILITY_STEPS } = await import('../../src/lib/pipeline.js');
  assert.deepEqual(PROBABILITY_STEPS, [5, 20, 50, 80, 90, 100]);
  assert.deepEqual(probabilityOptions(null).map(o => o.value), ['', '5', '20', '50', '80', '90', '100']);
  assert.deepEqual(probabilityOptions(60).map(o => o.value), ['', '5', '20', '50', '60', '80', '90', '100']);
  assert.equal(probabilityOptions(80).length, 7);
});
