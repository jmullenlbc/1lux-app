// A change order keeps its own sales tax, and only the chosen option counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcCOTotal, chosenLineItems, ratesForCO } from '../../src/lib/changeOrderTotals.js';

const job = { salesTaxPct: 0.0775, freightPct: 0.06, warehousingPct: 0.03 };
const line = (id, qty, cnUnitPrice, extra = {}) => ({ id, qty, cnUnitPrice, ...extra });
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.005, `${a} vs ${b}`);
const co = (salesTaxPct, lineItems = [line('a', 10, 100)]) => ({ salesTaxPct, optionGroups: [{ isSelected: true, lineItems }] });

test('a frozen rate wins over the job rate', () => {
  assert.equal(ratesForCO({ salesTaxPct: 0.0845 }, job).salesTaxPct, 0.0845);
  assert.equal(ratesForCO({ salesTaxPct: 0.0845 }, job).freightPct, 0.06);
});

test('a frozen 0 stays 0, blank follows the job', () => {
  assert.equal(ratesForCO({ salesTaxPct: 0 }, job).salesTaxPct, 0);
  assert.equal(ratesForCO({ salesTaxPct: null }, job).salesTaxPct, 0.0775);
  assert.equal(ratesForCO({}, null).salesTaxPct, null);
});

test('a job rate change does not move a frozen change order', () => {
  const frozen = co(0.0775);
  const before = calcCOTotal(frozen, job);
  near(before, 1167.5);
  assert.equal(calcCOTotal(frozen, { ...job, salesTaxPct: 0.0945 }), before);
});

test('a job rate change does move one not frozen yet', () => {
  near(calcCOTotal(co(null), { ...job, salesTaxPct: 0.1 }), 1190);
});

test('chosen lines come only from the chosen option', () => {
  const lines = chosenLineItems({ optionGroups: [
    { isSelected: false, lineItems: [line('no', 1, 1)] },
    { isSelected: true, lineItems: [line('b', 1, 1, { sortOrder: 2 }), line('a', 1, 1, { sortOrder: 1 })] },
  ] });
  assert.deepEqual(lines.map(l => l.id), ['a', 'b']);
});

test('chosen lines take the picked per line alternate', () => {
  const lines = chosenLineItems({ optionGroups: [{ isSelected: true, lineItems: [
    line('root', 1, 1, { isOptionRow: true, parentLineItemId: null }),
    line('alt', 1, 1, { isOptionRow: true, parentLineItemId: 'root', isGroupSelected: true }),
    line('plain', 1, 1),
  ] }] });
  assert.deepEqual(lines.map(l => l.id).sort(), ['alt', 'plain']);
});

test('no chosen option means no lines', () => {
  assert.deepEqual(chosenLineItems({ optionGroups: [{ isSelected: false, lineItems: [line('a', 1, 1)] }] }), []);
  assert.deepEqual(chosenLineItems({}), []);
});
