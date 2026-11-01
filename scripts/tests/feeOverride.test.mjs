/**
 * Manual freight and warehousing: blank follows the rate, a typed value
 * replaces it, 0 is real, and everything still adds up to the cent.
 *
 * Run: node --test scripts/tests/feeOverride.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcGroupFooter, calcCOTotal, ratesForCO, freezeRates, CO_OPTION_MONEY } from '../../src/lib/changeOrderTotals.js';
import { matrixFooter, feeLabel } from '../../src/lib/bidMatrixTotals.js';
import { calculateBudget } from '../../src/lib/calculations.js';
import { runParametricEstimate } from '../../src/lib/parametricEstimate.js';
import { cents, sumCents } from '../../src/lib/money.js';

const rates = { salesTaxPct: 0.0775, freightPct: 0.06, warehousingPct: 0.03 };
const lines = [{ id: 'a', qty: 10, cnUnitPrice: 1000 }];

test('a change order option with no override follows the job', () => {
  const f = calcGroupFooter(lines, rates, {});
  assert.equal(f.freight, 600);
  assert.equal(f.warehousing, 300);
  assert.equal(f.freightPct, 0.06);
  assert.equal(f.warehousingPct, 0.03);
});

test('typed dollars replace the job rate and print no percent', () => {
  const f = calcGroupFooter(lines, rates, { freightOverride: 125.5 });
  assert.equal(f.freight, 125.5);
  assert.equal(f.freightPct, null);
  assert.equal(f.warehousing, 300);
  assert.equal(f.total, sumCents([10000, f.tax, 125.5, 300]));
});

test('a typed percent replaces the job rate and works on net after the discount', () => {
  const f = calcGroupFooter(lines, rates, { discountAmount: 2000, warehousingOverridePct: 0.05 });
  assert.equal(f.warehousing, 400);
  assert.equal(f.warehousingPct, 0.05);
  assert.equal(f.freight, 480);
});

test('0 waives it, on dollars and on percent', () => {
  const dollars = calcGroupFooter(lines, rates, { freightOverride: 0 });
  assert.equal(dollars.freight, 0);
  assert.equal(dollars.freightPct, null);
  const percent = calcGroupFooter(lines, rates, { warehousingOverridePct: 0 });
  assert.equal(percent.warehousing, 0);
  assert.equal(percent.warehousingPct, 0);
});

test('the percent wins if both are ever set', () => {
  assert.equal(calcGroupFooter(lines, rates, { freightOverride: 5, freightOverridePct: 0.1 }).freight, 1000);
});

test('an override works with no job rate at all', () => {
  const f = calcGroupFooter(lines, {}, { freightOverride: 75 });
  assert.equal(f.freight, 75);
  assert.equal(f.warehousing, 0);
  assert.equal(f.warehousingPct, null);
});

test('the change order total picks up the chosen option override', () => {
  const co = { optionGroups: [
    { isSelected: false, lineItems: lines },
    { isSelected: true, lineItems: lines, freightOverride: 0, warehousingOverride: 0 },
  ] };
  assert.equal(calcCOTotal(co, rates), sumCents([10000, 775]));
});

test('routes that pick columns by hand get every option money column', () => {
  for (const key of ['discountAmount', 'discountPct', 'freightOverride', 'freightOverridePct', 'warehousingOverride', 'warehousingOverridePct']) {
    assert.equal(CO_OPTION_MONEY[key], true, key);
  }
});

test('with no override the matrix footer does not move a cent', () => {
  const opts = { freightPct: 0.06, warehousingPct: 0.03, salesTaxPct: 0.0775 };
  assert.deepEqual(matrixFooter(12345.67, 2345.89, opts), matrixFooter(12345.67, 2345.89, { ...opts, freightOverride: null, warehousingOverride: null }));
});

test('matrix dollars replace the percent, and the subtotals still add to the Grand Total', () => {
  const m = matrixFooter(8000.33, 2000.17, { freightPct: 0.06, warehousingPct: 0.03, salesTaxPct: 0.0775, freightOverride: 1234.56, warehousingOverride: 0 });
  assert.equal(m.freightAmt, 1234.56);
  assert.equal(m.warehousingAmt, 0);
  assert.equal(m.salesTaxAmt, cents(10000.5 * 0.0775));
  assert.equal(m.grandTotal, sumCents([10000.5, 1234.56, m.salesTaxAmt]));
  assert.equal(sumCents([m.subtotalLighting, m.subtotalControls]), m.grandTotal);
  assert.ok(m.subtotalLighting > m.subtotalControls);
});

test('matrix dollars with nothing priced yet still print', () => {
  const m = matrixFooter(0, 0, { freightPct: 0.06, freightOverride: 500 });
  assert.equal(m.freightAmt, 500);
  assert.equal(m.grandTotal, 500);
  assert.equal(sumCents([m.subtotalLighting, m.subtotalControls]), 500);
});

test('labels drop the percent for typed dollars', () => {
  assert.equal(feeLabel('Freight', 0.06), 'Freight (6%)');
  assert.equal(feeLabel('Freight', 0.065), 'Freight (6.5%)');
  assert.equal(feeLabel('Freight', 0.06, 500), 'Freight');
  assert.equal(feeLabel('Freight', 0.06, 0), 'Freight');
  assert.equal(feeLabel('Freight', 0), 'Freight');
});

test('the Budget engine splits typed dollars so lighting and controls add to the figure', () => {
  const job = { numUnits: 100, grossSf: 100000, freightPct: 0.06, warehousingPct: 0.03 };
  const plain = calculateBudget(job);
  const typed = calculateBudget({ ...job, freightOverride: 4321.09, warehousingOverride: 0 });
  assert.ok(plain.lightingProductSubtotal > 0);
  assert.ok(typed.controlsFreight > 0);
  assert.equal(plain.freightOverride, null);
  assert.equal(typed.freightOverride, 4321.09);
  assert.equal(sumCents([typed.freight, typed.controlsFreight]), 4321.09);
  assert.equal(typed.warehousing, 0);
  assert.equal(typed.controlsWarehousing, 0);
  assert.equal(typed.lightingProductSubtotal, plain.lightingProductSubtotal);
});

test('a sent change order keeps its rates when the job changes', () => {
  const frozen = freezeRates({ optionGroups: [] }, rates);
  assert.deepEqual(frozen, { salesTaxPct: 0.0775, freightPct: 0.06, warehousingPct: 0.03 });
  const sent = { ...frozen, optionGroups: [{ isSelected: true, lineItems: lines }] };
  const changed = { salesTaxPct: 0.09, freightPct: 0.1, warehousingPct: 0.08 };
  assert.equal(calcCOTotal(sent, changed), calcCOTotal(sent, rates));
  assert.deepEqual(ratesForCO(sent, changed), { ...changed, ...frozen });
});

test('a draft follows the job until it is sent', () => {
  const draft = { salesTaxPct: null, freightPct: null, warehousingPct: null };
  const changed = { salesTaxPct: 0.09, freightPct: 0.1, warehousingPct: 0.08 };
  assert.deepEqual(ratesForCO(draft, changed), changed);
  assert.deepEqual(freezeRates(draft, changed), changed);
});

test('a frozen 0 stays 0, and a job with no rate freezes at 0', () => {
  const waived = { freightPct: 0, warehousingPct: 0 };
  assert.equal(ratesForCO(waived, rates).freightPct, 0);
  assert.equal(ratesForCO(waived, rates).warehousingPct, 0);
  assert.deepEqual(freezeRates({}, {}), { salesTaxPct: 0, freightPct: 0, warehousingPct: 0 });
});

test('a typed override still beats the frozen rate', () => {
  const frozen = ratesForCO({ salesTaxPct: 0, freightPct: 0.06, warehousingPct: 0.03 }, rates);
  const footer = calcGroupFooter(lines, frozen, { freightOverride: 250, warehousingOverridePct: 0.05 });
  assert.equal(footer.freight, 250);
  assert.equal(footer.warehousing, 500);
});

test('a saved version priced at its own rate ignores the job rate', () => {
  const saved = matrixFooter(10000, 0, { freightPct: 0.06, warehousingPct: 0.03, salesTaxPct: 0 });
  assert.equal(saved.freightAmt, 600);
  assert.equal(saved.warehousingAmt, 300);
  assert.equal(saved.grandTotal, 10900);
});

test('the parametric panel takes the job dollars', () => {
  const e = runParametricEstimate({ freightOverride: 900, warehousingOverride: 0 });
  assert.equal(e.freight, 900);
  assert.equal(e.warehousing, 0);
  assert.equal(e.grandTotal, 900);
});
