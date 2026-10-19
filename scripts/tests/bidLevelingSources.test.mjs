// Bid Leveling inputs: ILC matrix lines, Peer Review rows, pasted quotes (Mike 10-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bidLinesFromMatrix, bidLinesFromPeerReview, parsePastedLines, uomOf, optionGroupOf } from '../../src/lib/bidLeveling/fromSources.js';
import { packagesFor, requestedSpecs } from '../../src/lib/bidLeveling/views.js';
import { buildMatrix } from '../../src/lib/bidLeveling/engine.js';

test('matrix lines carry CN and the requested spec, never DN', () => {
  const lines = bidLinesFromMatrix([
    { type: 'A1', description: 'DISK', origMfr: 'Lithonia', origCatalog: 'FMML 13 840', propMfr: 'ELUMA', propCatalog: 'DL-7-3000\nWHITE', qty: 400, uom: 'UNIT', unitCn: 14, totalCn: 5600, unitDn: 18 },
    { type: 'X1', origMfr: 'Tech', origCatalog: 'T-100', notUsed: true },
    { type: '', propMfr: 'ELUMA' },
  ]);
  assert.equal(lines.length, 2);
  const [a] = lines;
  assert.equal(a.unitPrice, 14);
  assert.equal(a.extPrice, 5600);
  assert.equal(a.catalog, 'DL-7-3000');
  assert.equal(a.requestedMfr, 'Lithonia');
  assert.equal(a.specBasis, 'SUBSTITUTE');
  assert.equal(a.optionGroup, 'BASE');
  assert.ok(!JSON.stringify(lines).includes('18'), 'DN never reaches a bid line');
  assert.equal(lines[1].specBasis, 'NOT_USED');
});

test('Peer Review rows use the CN price, not DN', () => {
  const [l] = bidLinesFromPeerReview([
    { typeCode: 'B2', specManufacturer: 'Acuity', specModel: 'LDN6', propManufacturer: 'ELUMA', propModel: 'DL-R-7', qty: 10, qtyType: 'EA', propUnitPrice: 20, propUnitDN: 26, propProductId: 'p1' },
  ]);
  assert.equal(l.unitPrice, 20);
  assert.equal(l.extPrice, 200);
  assert.equal(l.productId, 'p1');
  assert.ok(!JSON.stringify(l).includes('26'));
});

test('pasted quote with a header row maps columns by name', () => {
  const text = [
    'Type\tQty\tRequested Mfr\tRequested Catalog\tMfr\tCatalog\tUnit Price\tExt\tOption',
    'A1\t400\tLithonia\tFMML\tCooper\tSLD6\t$12.50\t$5,000.00\t',
    'A2\t0\t\t\tProgress\tP300\t30\t0\t',
    'S1\t120\t\t\tElco\tTAPE\t8\t960\tVE',
  ].join('\n');
  const lines = parsePastedLines(text);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].specBasis, 'SUBSTITUTE');
  assert.equal(lines[0].unitPrice, 12.5);
  assert.equal(lines[0].extPrice, 5000);
  assert.equal(lines[1].specBasis, 'NO_QUOTE');
  assert.equal(lines[2].optionGroup, 'VE');
});

test('pasted quote without headers uses Type, Qty, Mfr, Catalog, Unit, Ext', () => {
  const [l] = parsePastedLines('C3\t10\tEluma\tSTR-48\t58.44\n');
  assert.equal(l.typeTag, 'C3');
  assert.equal(l.qty, 10);
  assert.equal(l.extPrice, 584.4);
});

test('uom and option group words', () => {
  assert.equal(uomOf('FT'), 'LF');
  assert.equal(uomOf('UNIT'), 'EA');
  assert.equal(optionGroupOf('Value Engineering'), 'VE');
  assert.equal(optionGroupOf('Alt 1'), 'ALT');
  assert.equal(optionGroupOf(''), 'BASE');
});

test('VE package savings against the base bid for the same types', () => {
  const bid = { lines: [
    { typeTag: 'A1', optionGroup: 'BASE', qty: 10, unitPrice: 100, extPrice: 1000 },
    { typeTag: 'A2', optionGroup: 'BASE', qty: 5, unitPrice: 50, extPrice: 250 },
    { typeTag: 'A1', optionGroup: 'VE', qty: 10, unitPrice: 70, extPrice: 700 },
  ] };
  const [p] = packagesFor(bid);
  assert.deepEqual([p.group, p.total, p.baseSameTypes, p.savings], ['VE', 700, 1000, 300]);
});

test('requested spec: ILC first, then a competitor offer as the fallback', () => {
  const bids = [
    { id: 'c', isIlc: false, lines: [{ typeTag: 'A1', mfr: 'Cooper', catalog: 'SLD6' }, { typeTag: 'A2', mfr: 'Progress', catalog: 'P300' }] },
    { id: 'i', isIlc: true, lines: [{ typeTag: 'A1', requestedMfr: 'Lithonia', requestedCatalog: 'FMML' }] },
  ];
  const specs = requestedSpecs(bids);
  const a1 = [...specs.values()].find((s) => s.mfr === 'Lithonia');
  const a2 = [...specs.values()].find((s) => s.mfr === 'Progress');
  assert.ok(a1 && !a1.fromOffer);
  assert.ok(a2 && a2.fromOffer);
});

test('matrix cells carry the requested spec for the substitute mark', () => {
  const bids = [{ id: 'b', hasUnitPricing: true, lines: bidLinesFromMatrix([
    { type: 'A1', origMfr: 'Lithonia', origCatalog: 'FMML', propMfr: 'ELUMA', propCatalog: 'DL-7', qty: 4, unitCn: 10, totalCn: 40 },
  ]) }];
  const m = buildMatrix(bids, 'b');
  assert.equal(m.types[0].cells.b.requestedCatalog, 'FMML');
});

test('baseline lists a type with no qty: the bidder\'s own qty counts, flagged', async () => {
  const { normalize } = await import('../../src/lib/bidLeveling/engine.js');
  const bids = [
    { id: 'i', isIlc: true, hasUnitPricing: true, totals: [], flags: [], lines: [{ typeTag: 'A1', optionGroup: 'BASE', qty: null }] },
    { id: 'c', hasUnitPricing: true, totals: [], flags: [], lines: [{ typeTag: 'A1', optionGroup: 'BASE', qty: 10, unitPrice: 25, extPrice: 250 }] },
  ];
  const n = normalize(bids, 'i');
  assert.equal(n.perBid.c.fixtures, 250);
  assert.equal(n.perBid.c.fixturesOwnQty, 250);
  assert.equal(n.perBid.c.ownQtyLines[0].typeTag, 'A1');
});
