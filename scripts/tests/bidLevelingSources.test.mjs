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

// Quote reader + "Check what we read" (Mike 10-26, bid tool step 1). Made up quotes.
import { readQuoteSheets, readPastedQuote, lineReasons, quoteWarnings, cleanCheckedLines, tagLike } from '../../src/lib/bidLeveling/readQuote.js';

const MADE_UP = [
  ['Bright Line Lighting Sales'],
  ['Quote #:', 'Q-24117', '', 'Date:', '10/02/2026'],
  ['Project:', 'Made Up Apartments', '', 'Valid for 30 days'],
  [],
  ['Type', 'Qty', 'Manufacturer', 'Catalog #', 'Description', 'Unit Price', 'Extended'],
  ['INTERIOR'],
  ['A1', 400, 'Acme', 'DL6-30K', '6 in downlight', 18.5, 7400],
  ['', '', '', 'WHITE TRIM', '', '', ''],
  ['B2', 12, 'Acme', 'STR-48', '4 ft strip', 40, 500],
  ['C3', 0, 'Acme', 'WP-1', 'Wall pack', '', ''],
  ['A1', 10, 'Acme', 'DL6-30K', '6 in downlight', 18.5, 185],
  ['', 4, 'Acme', 'MK-1', 'Mounting kit', 5, 20],
  [],
  ['SITE LIGHTING'],
  ['S1-P', 6, 'Pole Co', 'P-20', '20 ft pole', 900, 5400],
  [],
  ['', '', '', '', 'Subtotal', '', 13505],
  ['', '', '', '', 'Freight', '', 600],
  ['', '', '', '', 'Sales Tax (10.1%)', '', 1364.01],
  ['', '', '', '', 'Total', '', 15469.01],
  ['Lead time 6 to 8 weeks after approved submittals.'],
];

test('reads a made up quote: heading row, sections, second lines, totals, quote info', () => {
  const q = readQuoteSheets([{ name: 'Quote', rows: MADE_UP }], { fileName: 'bright_line.xlsx' });
  assert.equal(q.ok, true);
  assert.equal(q.bidderName, 'Bright Line Lighting Sales');
  assert.equal(q.info.quoteNumber, 'Q-24117');
  assert.equal(q.info.quoteDate, '2026-10-02');
  assert.equal(q.info.expiresAt, '2026-11-01');
  assert.equal(q.info.taxRateStated, 10.1);
  assert.equal(q.lines.length, 6);
  assert.equal(q.lines[0].catalog, 'DL6-30K WHITE TRIM');
  assert.equal(q.lines[0].section, 'INTERIOR');
  assert.equal(q.lines[5].section, 'SITE LIGHTING');
  assert.equal(q.lines[5].typeTag, 'S1');
  assert.equal(q.lines[5].variant, 'P');
  assert.equal(q.lines[2].specBasis, 'NO_QUOTE');
  assert.deepEqual(q.totals, { FIXTURES: 13505, FREIGHT: 600, TAX: 1364.01, GRAND: 15469.01 });
  assert.match(q.notesRaw, /Lead time/);
});

test('marks the lines a person should look at, in plain words', () => {
  const q = readQuoteSheets([{ name: 'Quote', rows: MADE_UP }]);
  const r = lineReasons(q.lines).map((x) => x.map((y) => y.key));
  assert.deepEqual(r[0], ['TWICE']);
  assert.deepEqual(r[1], ['MATH']);
  assert.deepEqual(r[2], ['ZERO_QTY']);
  assert.deepEqual(r[4], ['NO_TYPE']);
  assert.equal(lineReasons(q.lines)[4][0].blocking, true);
  for (const x of lineReasons(q.lines).flat()) assert.doesNotMatch(x.text, /[–—]|--/);
});

test('whole quote warnings: lines versus subtotal, parts versus total, expired', () => {
  const q = readQuoteSheets([{ name: 'Quote', rows: MADE_UP }]);
  assert.deepEqual(quoteWarnings(q.lines, q.totals, q.info, { today: new Date('2026-10-20') }), []);
  const w = quoteWarnings(q.lines, { ...q.totals, FIXTURES: 13000 }, q.info, { today: new Date('2026-11-05') });
  assert.equal(w.length, 3);
  assert.match(w[0], /lines add up to \$13,505\.00.*says \$13,000\.00/);
  assert.match(w[1], /parts add up to \$14,964\.01.*says \$15,469\.01/);
  assert.match(w[2], /expired on 2026-11-01/);
});

test('no table found says what to do', () => {
  const q = readQuoteSheets([{ name: 'Cover', rows: [['Thank you for the opportunity'], ['Call me']] }]);
  assert.equal(q.ok, false);
  assert.match(q.message, /nothing was read/);
  assert.equal(readPastedQuote('just some words').ok, false);
});

test('pasted rows go through the same reader', () => {
  const q = readPastedQuote('Type\tQty\tMfr\tPart\tUnit\tExt\nA1\t10\tAcme\tDL6\t$18.50\t$185.00\nFreight\t\t\t\t\t$50\n');
  assert.equal(q.lines.length, 1);
  assert.equal(q.lines[0].unitPrice, 18.5);
  assert.equal(q.totals.FREIGHT, 50);
});

test('a quote with no type column takes the type from the description', () => {
  const q = readQuoteSheets([{ name: 'S', rows: [['Qty', 'Description', 'Catalog', 'Price'], [5, 'Type B4: wall sconce', 'WS-2', 80]] }]);
  assert.equal(q.lines[0].typeTag, 'B4');
});

test('checked lines are cleaned on the server and the tag is read again', () => {
  const { lines, missingType } = cleanCheckedLines([
    { typeTagRaw: 'lt-03', typeTag: 'HACKED', qty: '10', unitPrice: '$5', uom: 'BOX', optionGroup: 'X', needsReview: 1 },
    { typeTagRaw: '  ', qty: 2 },
    { typeTagRaw: 'B2', qty: 0, unitPrice: -4 },
  ]);
  assert.equal(missingType, 1);
  assert.equal(lines[0].typeTag, 'LT-03');
  assert.equal(lines[0].extPrice, 50);
  assert.equal(lines[0].uom, 'EA');
  assert.equal(lines[0].optionGroup, 'BASE');
  assert.equal(lines[0].needsReview, true);
  assert.equal(lines[1].specBasis, 'NO_QUOTE');
  assert.equal(lines[1].unitPrice, null);
  assert.equal(lines[1].sortOrder, 1);
});

test('type tags versus words', () => {
  assert.ok(tagLike('A1') && tagLike('LT-03') && tagLike('EM') && tagLike('S1-P'));
  assert.ok(!tagLike('SITE LIGHTING') && !tagLike('Mounting kit for poles') && !tagLike(''));
});

test('a tax row with its rate in the type column is a total, not a fixture', () => {
  const q = readQuoteSheets([{ name: 'S', rows: [
    ['Type', 'Qty', 'Catalog', 'Unit Price', 'Extended'],
    ['A1', 10, 'X-1', 10, 100],
    ['T10', '', 'TRACK-10', 5, 5],
    ['Subtotal', '', '', '', 105],
    ['Tax 10.1%', '', '', '', 10.61],
    ['Total', '', '', '', 115.61],
  ] }]);
  assert.deepEqual(q.lines.map((l) => l.typeTag), ['A1', 'T10']);
  assert.equal(q.totals.TAX, 10.61);
  assert.equal(q.info.taxRateStated, 10.1);
});
