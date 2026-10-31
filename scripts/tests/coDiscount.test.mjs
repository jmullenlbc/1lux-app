// Manual discount on a change order: comes off before the fees, dollars or percent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcGroupFooter, calcCOTotal, discountFor } from '../../src/lib/changeOrderTotals.js';

const rates = { salesTaxPct: 0.0775, freightPct: 0.06, warehousingPct: 0.03 };
const line = (qty, cnUnitPrice, extra = {}) => ({ id: `l${qty}${cnUnitPrice}`, qty, cnUnitPrice, ...extra });
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.005, `${a} vs ${b}`);

test('no discount leaves the footer as it was', () => {
  const f = calcGroupFooter([line(10, 100)], rates);
  assert.equal(f.subtotal, 1000);
  assert.equal(f.discount, 0);
  near(f.total, 1167.5);
});

test('a dollar discount comes off before tax, freight and warehousing', () => {
  const f = calcGroupFooter([line(10, 100)], rates, { discountAmount: 400 });
  assert.equal(f.subtotal, 1000);
  assert.equal(f.discount, 400);
  near(f.tax, 46.5);
  near(f.freight, 36);
  near(f.warehousing, 18);
  near(f.total, 700.5);
});

test('a percent discount is worked on the subtotal and wins over dollars', () => {
  const f = calcGroupFooter([line(10, 100)], rates, { discountPct: 0.5, discountAmount: 1 });
  assert.equal(f.discount, 500);
  near(f.total, 583.75);
});

test('CO 17: half of the SP1 heads line, split with the client', () => {
  // Fees on the half, as printed: 12461.82 plus tax, freight, warehousing.
  const half = calcGroupFooter([line(1, 24923.64)], rates, { discountAmount: 12461.82 });
  near(half.subtotal - half.discount, 12461.82);
  near(half.freight, 747.71);
  near(half.warehousing, 373.85);
  near(calcGroupFooter([line(1, 24923.64)], rates, { discountPct: 0.5 }).total, half.total);
});

test('a discount past the subtotal shows a credit, it is not capped', () => {
  const f = calcGroupFooter([line(1, 100)], { freightPct: null, salesTaxPct: null, warehousingPct: null }, { discountAmount: 150 });
  assert.equal(f.total, -50);
});

test('only the selected option counts toward the discount base', () => {
  const root = line(1, 100, { id: 'a', isOptionRow: true, isGroupSelected: false });
  const alt = line(1, 300, { id: 'b', isOptionRow: true, parentLineItemId: 'a', isGroupSelected: true });
  assert.equal(calcGroupFooter([root, alt], {}, { discountPct: 0.1 }).discount, 30);
});

test('the CO total uses the chosen option and its own discount', () => {
  const co = { optionGroups: [
    { isSelected: false, discountAmount: 900, lineItems: [line(1, 1000)] },
    { isSelected: true, discountAmount: 100, lineItems: [line(1, 1000)] },
  ] };
  near(calcCOTotal(co, rates), 1050.75);
});

test('no chosen option totals 0, discount or not', () => {
  assert.equal(calcCOTotal({ optionGroups: [{ isSelected: false, discountAmount: 5, lineItems: [line(1, 10)] }] }, rates), 0);
});

test('blank rates and blank discount are safe', () => {
  assert.equal(discountFor(null, 100), 0);
  assert.equal(calcGroupFooter([line(1, 10)], null).total, 10);
});
