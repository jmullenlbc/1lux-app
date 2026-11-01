// What a quote's freight really costs, per brand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentQuotes, freightFor, freightRows, historyRates, jobFreight, quoteSummary, readFreight, rowDollars, STARTING_FREIGHT_PCT,
} from '../../src/lib/rfq/freight.js';

const row = (manufacturer, qty, unitPrice, extra = {}) => ({ manufacturer, qty, unitPrice, status: 'MATCHED', links: [], ...extra });

test('the starting percent is 2%', () => assert.equal(STARTING_FREIGHT_PCT, 0.02));

test('first match wins, in order', () => {
  const base = { brandDollars: 10000, ffa: 5000, startPct: 0.02 };
  assert.deepEqual(freightFor({ ...base, status: 'STATED', amount: 400, typedAmount: 300 }), { label: 'Typed', amount: 300, real: true });
  assert.deepEqual(freightFor({ ...base, status: 'STATED', amount: 400 }), { label: 'Stated', amount: 400, real: true });
  assert.deepEqual(freightFor({ ...base, status: 'ALLOWED' }), { label: 'Allowed', amount: 0, real: true });
  assert.deepEqual(freightFor({ ...base, status: 'SILENT' }), { label: 'Allowed by FFA', amount: 0, real: false });
  assert.deepEqual(freightFor({ ...base, status: 'SILENT', ffa: 20000 }), { label: 'Estimated', amount: 200, real: false });
});

test('a typed zero is a real zero', () => {
  assert.deepEqual(freightFor({ status: 'SILENT', typedAmount: 0, brandDollars: 1000 }), { label: 'Typed', amount: 0, real: true });
});

test('not included beats the FFA on file', () => {
  assert.equal(freightFor({ status: 'NOT_INCLUDED', brandDollars: 10000, ffa: 5000 }).label, 'Estimated');
});

test('a blank or $0 FFA means none is known', () => {
  assert.equal(freightFor({ status: 'SILENT', brandDollars: 10000, ffa: 0 }).label, 'Estimated');
  assert.equal(freightFor({ status: 'SILENT', brandDollars: 10000, ffa: null }).label, 'Estimated');
});

test('brand history beats the starting percent', () => {
  assert.equal(freightFor({ status: 'SILENT', brandDollars: 1000, historyPct: 0.07, startPct: 0.02 }).amount, 70);
});

test('a contradiction asks a person and estimates meanwhile', () => {
  assert.deepEqual(freightFor({ status: 'CONFLICT', brandDollars: 1000, startPct: 0.02 }), { label: 'Estimated', amount: 20, real: false, asks: true });
});

test('reading a quote: dollars become Stated', () => {
  assert.deepEqual(readFreight({ total: 223.42 }), [{ manufacturer: '', status: 'STATED', amount: 223.42, wording: null }]);
  const rows = readFreight({ rows: [{ brand: 'Ligman', status: 'NOT_INCLUDED', wording: 'LIGMAN FREIGHT NOT INCLUDED' }], total: 100 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].manufacturer, 'Ligman');
  assert.equal(rows[1].amount, 100);
});

test('reading a quote: a $0 total is allowed, unless the words say not included', () => {
  assert.equal(readFreight({ total: 0 })[0].status, 'ALLOWED');
  assert.equal(readFreight({ total: 0, text: 'FREIGHT NOT INCLUDED' })[0].status, 'NOT_INCLUDED');
});

test('reading a quote: the rules catch a contradiction the AI missed', () => {
  const rows = readFreight({ rows: [{ brand: '', status: 'ALLOWED' }], text: 'Plus Freight\nStandard freight to jobsite included' });
  assert.equal(rows[0].status, 'CONFLICT');
  assert.match(rows[0].wording, /Plus Freight/);
});

test('reading a quote: words fill in when the read says nothing, and silence saves nothing', () => {
  assert.equal(readFreight({ text: 'This order will ship FFA.' })[0].status, 'ALLOWED');
  assert.deepEqual(readFreight({ text: 'Thank you' }), []);
});

test('reading a quote: a bad status or a zero amount never counts as Stated', () => {
  assert.deepEqual(readFreight({ rows: [{ brand: 'X', status: 'STATED', amount: 0 }, { brand: 'Y', status: 'nonsense' }] }).map((r) => r.status), ['SILENT', 'SILENT']);
});

test('a whole quote answer spreads over every brand it did not name', () => {
  const lines = [row('Ligman', 2, 100), row('Lithonia Lighting', 1, 500), row('', 1, 50, { links: [{ rfqLine: { manufacturer: 'Lithonia' } }] })];
  const rows = freightRows({ freight: [{ manufacturer: 'Ligman', status: 'NOT_INCLUDED' }, { manufacturer: '', status: 'ALLOWED', wording: 'Freight allowed' }], lines });
  assert.equal(rows.length, 2, 'Lithonia and Lithonia Lighting are one brand');
  assert.equal(rows[0].brand, 'Ligman');
  assert.equal(rows[0].dollars, 200);
  assert.equal(rows[1].status, 'ALLOWED');
  assert.equal(rows[1].fromWhole, true);
});

test('a brand name that differs only by Lighting or Inc lands on one row', () => {
  const rows = freightRows({ lines: [row('Lithonia', 1, 100), row('Lithonia Lighting, Inc.', 1, 200)] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dollars, 300);
  assert.equal(rows[0].status, 'SILENT');
});

test('a whole quote stated figure stays one row, for the brands not named', () => {
  const rows = freightRows({ freight: [{ manufacturer: '', status: 'STATED', amount: 223.42 }], lines: [row('A', 1, 100), row('B', 1, 100)] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].brand, '');
  assert.equal(rows[0].dollars, 200);
});

test('skipped rows do not count as freight or cost', () => {
  const s = quoteSummary({ total: null, lines: [row('A', 1, 100), row('A', 1, 900, { status: 'SKIPPED' })] }, { startPct: 0.02 });
  assert.equal(s.rowsTotal, 100);
  assert.equal(s.freight, 2);
});

test('the quote summary adds up, and shows the gap when the rows do not', () => {
  // QUO1208684_3: subtotal 2,821.08, shipping 223.42, total due 3,044.50
  const quote = { total: 3044.5, rfqId: 'r1', freight: [{ manufacturer: '', status: 'STATED', amount: 223.42 }], lines: [row('Lightology', 1, 2821.08, { links: [{ rfqLineId: 'l1', rfqLine: { rfqId: 'r1', manufacturer: 'Lightology' } }] })] };
  const s = quoteSummary(quote, { rfqLines: [{ id: 'l1', rfqId: 'r1' }, { id: 'l2', rfqId: 'r1' }, { id: 'x', rfqId: 'r9' }] });
  assert.deepEqual([s.asked, s.priced, s.missing], [2, 1, 1]);
  assert.equal(s.product, 2821.08);
  assert.equal(s.freight, 223.42);
  assert.equal(s.cost, 3044.5);
  assert.equal(s.gap, 0);
  assert.equal(quoteSummary({ ...quote, total: 3100 }).gap, 55.5);
  assert.equal(quoteSummary({ ...quote, total: null }).gap, null);
});

test('controls and spares come out of the product figure', () => {
  const s = quoteSummary({ controlsTotal: 300, sparesTotal: 100, lines: [row('A', 1, 1000)] }, { startPct: 0 });
  assert.equal(s.product, 600);
  assert.equal(s.cost, 1000);
});

test('the longest lead shows, and in stock counts as zero', () => {
  const s = quoteSummary({ lines: [row('A', 1, 1, { leadWeeksMax: 8, leadTime: '6-8 Weeks' }), row('A', 1, 1, { leadWeeksMax: 0 })] });
  assert.deepEqual(s.longestLead, { text: '6-8 Weeks', weeks: 8 });
  assert.deepEqual(quoteSummary({ lines: [row('A', 1, 1, { leadWeeksMax: 0 })] }).longestLead, { text: 'In stock', weeks: 0 });
  assert.equal(quoteSummary({ lines: [row('A', 1, 1)] }).longestLead, null);
});

test('history comes only from dollars on quotes, and a split quote cannot teach a brand', () => {
  const rates = historyRates([
    { manufacturer: 'Ligman', amount: 50, lines: [row('Ligman', 1, 1000), row('Other', 1, 1000)] },
    { manufacturer: '', amount: 223.42, lines: [row('Lightology', 1, 2821.08)] },
    { manufacturer: '', amount: 90, lines: [row('A', 1, 100), row('B', 1, 100)] },
  ]);
  assert.equal(rates.LIGMAN, 0.05);
  assert.equal(Number(rates.LIGHTOLOGY.toFixed(4)), 0.0792);
  assert.equal(Object.keys(rates).length, 2);
});

test('a row keeps the extended price the quote printed', () => {
  assert.equal(rowDollars({ extPrice: 99.99, qty: 3, unitPrice: 33.33 }), 99.99);
  assert.equal(rowDollars({ qty: 3, unitPrice: 33.335 }), 100.01);
});

test('the newest quote per line prices the job; an older one with nothing left drops out', () => {
  const link = (item) => ({ rfqLine: { peerReviewItemId: item } });
  const old = { id: 'q1', createdAt: '2026-01-01', lines: [row('A', 1, 1, { links: [link('A'), link('B')] })] };
  const newer = { id: 'q2', createdAt: '2026-02-01', lines: [row('A', 1, 1, { links: [link('A')] })] };
  const newest = { id: 'q3', createdAt: '2026-03-01', lines: [row('A', 1, 1, { links: [link('B')] })] };
  assert.deepEqual(currentQuotes([old, newer], new Set(['A', 'B'])).map((q) => q.id).sort(), ['q1', 'q2']);
  assert.deepEqual(currentQuotes([old, newer, newest], new Set(['A', 'B'])).map((q) => q.id).sort(), ['q2', 'q3']);
  assert.deepEqual(currentQuotes([old], new Set(['Z'])), []);
});

test('the job roll up weighs real figures by brand dollars', () => {
  const j = jobFreight([{ freightRows: [{ amount: 100, dollars: 3000, real: true }, { amount: 20, dollars: 1000, real: false }] }], 600);
  assert.deepEqual(j, { budget: 600, expect: 120, profit: 480, realShare: 0.75 });
  assert.equal(jobFreight([], null).profit, null);
  assert.equal(jobFreight([], null).realShare, null);
});
