// "Won, not yet ordered, next 6 months" Sales cards (Jason, Oct 5 call).
// A job counts as ordered once it has a Shipment row (ORDERED_RULE in
// src/lib/dashboards/providers.js); the dashboard rows carry that as
// hasPurchaseOrder 'Yes' | 'No'. Run: node --test scripts/tests/dashboardWonNotOrdered.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runFieldWidget } from '../../src/lib/dashboards/engine.js';
import { missingPrebuilt, prebuiltKey } from '../../src/lib/dashboards/prebuilt.js';
import TEMPLATES from '../../prisma/seeds/dashboardTemplates.js';

const SALES = (TEMPLATES.TEMPLATES_BY_SECTION || TEMPLATES).SALES;
const card = (tpl) => SALES.find(t => t.dataSpec?.tpl === tpl);

function inMonths(n) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + n, 15);
}

const rows = [
  { id: 'a', name: 'Won, no PO',   procurementStatus: 'WON',  designStatus: 'WON',  hasPurchaseOrder: 'No',  shipmentCount: 0, expectedOrderDate: inMonths(2), currentContract: 100000, designContractValue: 5000, averageProbability: 100 },
  { id: 'b', name: 'Won, has PO',  procurementStatus: 'WON',  designStatus: 'WON',  hasPurchaseOrder: 'Yes', shipmentCount: 1, expectedOrderDate: inMonths(2), currentContract: 50000,  designContractValue: 2000, averageProbability: 100 },
  { id: 'c', name: 'Still open',   procurementStatus: 'OPEN', designStatus: 'OPEN', hasPurchaseOrder: 'No',  shipmentCount: 0, expectedOrderDate: inMonths(2), currentContract: 70000,  designContractValue: 3000, averageProbability: 50 },
];

const sum = (series) => series.reduce((s, x) => s + x.value, 0);

test('procurement-won-not-ordered counts only WON jobs with no purchase order', () => {
  const tpl = card('procurement-won-not-ordered');
  assert.ok(tpl, 'template exists');
  const out = runFieldWidget({ dataSpec: tpl.dataSpec, chartType: 'BAR' }, rows, 'SALES');
  assert.equal(out.series.length, 6, 'six months, $0 ones included');
  assert.equal(sum(out.series), 100000, 'only the won job without a PO counts');
});

test('design-won-not-ordered sums design fees the same way', () => {
  const tpl = card('design-won-not-ordered');
  assert.ok(tpl, 'template exists');
  const out = runFieldWidget({ dataSpec: tpl.dataSpec, chartType: 'BAR' }, rows, 'SALES');
  assert.equal(sum(out.series), 5000);
});

test('a job dated past the 6 month window is left out', () => {
  const tpl = card('procurement-won-not-ordered');
  const far = [{ ...rows[0], expectedOrderDate: inMonths(8) }];
  const out = runFieldWidget({ dataSpec: tpl.dataSpec, chartType: 'BAR' }, far, 'SALES');
  assert.equal(sum(out.series), 0);
});

test('procurement-open-20 is open jobs only, 20 percent and up, not cumulative', () => {
  const tpl = card('procurement-open-20');
  assert.ok(tpl, 'template exists');
  assert.ok(!tpl.dataSpec.cumulative);
  const out = runFieldWidget({ dataSpec: tpl.dataSpec, chartType: 'BAR' }, rows, 'SALES');
  assert.equal(out.series.length, 12);
  assert.equal(sum(out.series), 70000, 'won jobs are excluded');
});

test('the new cards reach an existing dashboard through missingPrebuilt', () => {
  const have = SALES.filter(t => !['procurement-open-20', 'procurement-won-not-ordered', 'design-won-not-ordered'].includes(t.dataSpec?.tpl))
    .map(t => ({ name: t.name, dataSpec: JSON.stringify(t.dataSpec) }));
  const added = missingPrebuilt(SALES, have, new Set());
  const keys = added.map(t => prebuiltKey(t.dataSpec));
  assert.ok(keys.includes('tpl:procurement-open-20'));
  assert.ok(keys.includes('tpl:procurement-won-not-ordered'));
  assert.ok(keys.includes('tpl:design-won-not-ordered'));
});
