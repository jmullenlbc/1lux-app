import test from 'node:test';
import assert from 'node:assert/strict';
import { calcGroupFooter, coLineTotal, coLineUnit } from '../../src/lib/changeOrderTotals.js';
import { creditAtOtherRate, lineKind, lineNote, wasNow } from '../../src/lib/changeOrderLineKind.js';
import { productKey, runningProducts, taxChangeLines, undeliveredBase } from '../../src/lib/changeOrderProducts.js';

const budgetLine = (extra) => ({
  fromBudget: true, fixtureType: 'A1', qty: 0, cnUnitPrice: 100, originalDN: 77, manufacturer: 'Lithonia', partNumber: 'X1', description: 'Downlight',
  wasFixtureType: 'A1', wasQty: 80, wasUnitPrice: 100, wasUnitCost: 77, wasManufacturer: 'Lithonia', wasPartNumber: 'X1', wasDescription: 'Downlight',
  ...extra,
});

test('what you do on the line tells the kind', () => {
  assert.equal(lineKind({ fixtureType: 'N1', qty: 5, cnUnitPrice: 100 }), 'New product');
  assert.equal(lineKind(budgetLine({ qty: 5 })), 'Quantity added');
  assert.equal(lineKind(budgetLine({ qty: -20 })), 'Quantity reduced');
  assert.equal(lineKind(budgetLine({ qty: -80 })), 'Removed');
  assert.equal(lineKind(budgetLine({ qty: 80, cnUnitPrice: 120 })), 'Price change');
  assert.equal(lineKind(budgetLine({ qty: 80, partNumber: 'X2' })), 'Changed product');
  assert.equal(lineKind(budgetLine({ description: 'Now in black' })), 'Spec change');
  assert.equal(lineKind(budgetLine({})), 'No change yet');
});

test('a line shows Was and Now, and an untouched line shows nothing', () => {
  assert.match(wasNow(budgetLine({ qty: 80, cnUnitPrice: 120 })), /100/);
  assert.match(wasNow(budgetLine({ qty: 80, cnUnitPrice: 120 })), /120/);
  assert.equal(lineNote(budgetLine({})), '');
  assert.match(lineNote(budgetLine({ qty: -80 })), /^Removed/);
});

test('a new price bills only the difference on the units it applies to', () => {
  assert.equal(coLineUnit(budgetLine({ qty: 10, cnUnitPrice: 120 })), 20);
  assert.equal(coLineTotal(budgetLine({ qty: 10, cnUnitPrice: 120 })), 200);
  assert.equal(coLineTotal(budgetLine({ qty: 10, partNumber: 'X2' })), 0);
  assert.equal(coLineTotal(budgetLine({ qty: -20 })), -2000);
  assert.equal(coLineTotal(budgetLine({ description: 'Now in black' })), 0);
  assert.equal(coLineTotal({ fixtureType: 'N1', qty: 3, cnUnitPrice: 33.33 }), 99.99);
});

test('a credit refunds the rate charged, not the rate on this change order', () => {
  const rates = { salesTaxPct: 0.0845, freightPct: 0, warehousingPct: 0 };
  const lines = [
    { fixtureType: 'A', qty: 1, cnUnitPrice: 1000 },
    budgetLine({ qty: -10, creditTaxPct: 0.0775 }),
  ];
  const footer = calcGroupFooter(lines, rates, {});
  assert.equal(footer.subtotal, 0);
  assert.equal(footer.taxMixed, true);
  assert.equal(footer.tax, 84.5 - 77.5);
  assert.equal(creditAtOtherRate(lines[1], rates.salesTaxPct), true);
  assert.equal(calcGroupFooter([lines[0]], rates, {}).taxMixed, false);
});

test('a product keeps a running record, and only approved COs move it', () => {
  const start = [{ type: 'A1', qty: 80, unitPrice: 100, unitCost: 77, manufacturer: 'Lithonia', partNumber: 'X1', description: 'Downlight' }];
  const co = (id, status, items) => ({ id, coNumber: id, title: id, date: '2026-01-01', status, optionGroups: [{ isSelected: true, lineItems: items }] });
  const [p] = runningProducts(start, [
    co('CO-1', 'APPROVED', [budgetLine({ qty: -20 }), { isFee: true, feeForLineId: 'x', fixtureType: 'A1', qty: 1, cnUnitPrice: 50 }]),
    co('CO-2', 'DRAFT', [budgetLine({ qty: -60 })]),
  ], { startTaxPct: 0.0775 });
  assert.equal(p.key, productKey(' a1 '));
  assert.equal(p.now.qty, 60);
  assert.equal(p.events.length, 3);
  assert.equal(p.taxPct, 0.0775);
});

test('Modera CO 2: the whole job was undelivered, so the base is the whole subtotal', () => {
  const base = 645971.81;
  const [off, on] = taxChangeLines({ base, oldPct: 0.0775, newPct: 0.0845, date: '2025-07-01' });
  assert.equal(off.description, '7.75% tax rate at contract');
  assert.equal(on.description, '8.45% tax rate as of 7/1/25');
  assert.equal(off.dollars, -50062.82); // the old PDF printed -50,062.81; every step here rounds to the cent
  assert.equal(on.dollars, 54584.62);

  const products = [{ key: 'A1', dollars: base, now: { unitPrice: 100 } }];
  assert.deepEqual(undeliveredBase(products, [], '2025-07-01'), { total: base, delivered: 0, undelivered: base });
});

test('goods delivered by the rate date come off the base; later ones do not', () => {
  const products = [{ key: 'A1', dollars: 8000, now: { unitPrice: 100 } }];
  const lines = [
    { fixtureType: 'A1', qty: 30, shipment: { deliveredDate: '2025-06-15' }, deliveryEvents: [] },
    { fixtureType: 'a1', qty: 20, shipment: { deliveredDate: null }, deliveryEvents: [{ deliveryDate: '2025-06-20', qtyReceived: 5 }, { deliveryDate: '2025-08-01', qtyReceived: 15 }] },
    { fixtureType: 'A1', qty: 30, shipment: { deliveredDate: '2025-08-01' }, deliveryEvents: [] },
  ];
  assert.deepEqual(undeliveredBase(products, lines, '2025-07-01'), { total: 8000, delivered: 3500, undelivered: 4500 });
});
