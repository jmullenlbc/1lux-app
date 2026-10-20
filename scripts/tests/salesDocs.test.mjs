// Sales Docs (0137): pricing guard, workbook drawing, time math, visitor matching.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { scanWorkbook, scanPdfPages, scanHeaderRows, shareAllowed, COST_HEADER_RE } from '../../src/lib/salesDocs/pricingScan.js';
import { renderSheet, renderWorkbook, MAX_ROWS, MAX_COLS } from '../../src/lib/salesDocs/renderXlsx.js';
import { clampDelta, isViewingNow, completion, formatDuration, deviceFromUa } from '../../src/lib/salesDocs/tracking.js';
import { matchFromPool, isForwarded, isFreemail, emailDomain, websiteDomain, normalizeEmail } from '../../src/lib/salesDocs/matching.js';

const decode = XLSX.utils.decode_range;

// Round trip through a real .xlsx so hidden flags are read the way uploads are.
function roundTrip(wb) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
  return XLSX.read(buf, { type: 'buffer', cellDates: true, cellStyles: true });
}

function book(sheets, hiddenIdx = []) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(([name, aoa, cols]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (cols) ws['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  if (hiddenIdx.length) wb.Workbook = { Sheets: sheets.map((_, i) => ({ Hidden: hiddenIdx.includes(i) ? 1 : 0 })) };
  return roundTrip(wb);
}

const CLEAN_ROWS = [
  ['TYPE', 'DESCRIPTION', 'QTY', 'UNIT PRICE', 'TOTAL'],
  ['A1', '4in downlight', 400, 14, 5600],
  ['B2', 'Wall sconce', 120, 85, 10200],
];

test('T3: a DN UNIT header blocks sharing', () => {
  const wb = book([['Quote', [['TYPE', 'DESCRIPTION', 'QTY', 'DN UNIT', 'CN UNIT'], ['A1', 'Disk', 10, 9, 14]]]]);
  const out = scanWorkbook(wb, decode);
  assert.equal(out.status, 'BLOCKED');
  assert.deepEqual(out.hits.map((h) => [h.reason, h.cell, h.text]), [['COST_HEADER', 'D1', 'DN UNIT']]);
  assert.equal(shareAllowed(out.status), false);
});

test('a clean price sheet passes', () => {
  const out = scanWorkbook(book([['Quote', CLEAN_ROWS]]), decode);
  assert.equal(out.status, 'CLEAN');
  assert.equal(shareAllowed('CLEAN'), true);
});

test('T4: a hidden "Costs" sheet blocks and is never drawn', () => {
  const wb = book([['Quote', CLEAN_ROWS], ['Costs', [['a', 'b', 'c'], [1, 2, 3]]]], [1]);
  const out = scanWorkbook(wb, decode);
  assert.equal(out.status, 'BLOCKED');
  assert.ok(out.hits.some((h) => h.reason === 'HIDDEN_SHEET' && h.sheetName === 'Costs'));
  const drawn = renderWorkbook(wb, decode);
  assert.equal(drawn[1].hidden, true);
  assert.equal(drawn[1].render, null);
  assert.equal(drawn[0].render.rowCount, 3);
});

test('a hidden column with values blocks; an empty hidden column does not', () => {
  const rows = [['TYPE', 'DESC', 'SECRET', 'QTY', 'NOTE'], ['A1', 'Disk', 9.5, 10, '']];
  const withValue = scanWorkbook(book([['Q', rows, [{}, {}, { hidden: true }]]]), decode);
  assert.equal(withValue.status, 'BLOCKED');
  assert.ok(withValue.hits.some((h) => h.reason === 'HIDDEN_COLUMN' && h.cell === 'C'));

  const empty = [['TYPE', 'DESC', 'QTY', ''], ['A1', 'Disk', 10]];
  const wb = book([['Q', empty, [{}, {}, {}, { hidden: true }]]]);
  assert.equal(scanWorkbook(wb, decode).status, 'CLEAN');
});

test('hidden columns are left out of the drawn sheet', () => {
  const rows = [['TYPE', 'DESC', 'SECRET', 'QTY'], ['A1', 'Disk', 9.5, 10]];
  const wb = book([['Q', rows, [{}, {}, { hidden: true }]]]);
  const r = renderSheet(wb.Sheets.Q, decode);
  assert.deepEqual(r.colLabels, ['A', 'B', 'D']);
  assert.equal(JSON.stringify(r).includes('SECRET'), false);
  assert.equal(JSON.stringify(r).includes('9.5'), false);
  assert.deepEqual(r.cells[1][2], ['10', 1]);
});

test('cost words match whole words only', () => {
  for (const s of ['DN', 'D.N.', 'Dealer Net', 'Buy Price', 'unit cost', 'GP %', 'Margin', 'MARKUP']) assert.ok(COST_HEADER_RE.test(s), s);
  for (const s of ['DNA', 'Costco', 'BUYER', 'Costs', 'GPS', 'Download']) assert.equal(COST_HEADER_RE.test(s), false, s);
});

test('header rows need three text cells; long text and numbers are not headers', () => {
  assert.equal(scanHeaderRows([['Cost', 'only two']]).length, 0);
  assert.equal(scanHeaderRows([['Notes', 'A note about cost that runs past thirty characters', 'x']]).length, 0);
  assert.equal(scanHeaderRows([['a', 'b', 'Cost', 4]]).length, 1);
  assert.equal(scanHeaderRows(Array.from({ length: 16 }, (_, i) => (i === 15 ? ['a', 'b', 'Cost'] : []))).length, 0);
});

test('a defined name with a cost word blocks', () => {
  const wb = book([['Q', CLEAN_ROWS]]);
  wb.Workbook = { ...(wb.Workbook || {}), Names: [{ Name: 'Unit_Cost', Ref: 'Q!$D$2' }, { Name: '_xlnm.Print_Area', Ref: 'Q!$A$1' }] };
  const out = scanWorkbook(wb, decode);
  assert.deepEqual(out.hits.map((h) => h.reason), ['DEFINED_NAME']);
});

test('PDF pricing words only warn, with the page', () => {
  const out = scanPdfPages(['Spec sheet', 'Dealer Net pricing below']);
  assert.equal(out.status, 'WARN');
  assert.equal(out.hits[0].page, 2);
  assert.equal(shareAllowed('WARN'), true);
  assert.equal(scanPdfPages(['nothing here']).status, 'CLEAN');
});

test('big sheets are cut at the caps and say so', () => {
  const aoa = Array.from({ length: MAX_ROWS + 5 }, (_, r) => Array.from({ length: MAX_COLS + 3 }, (_, c) => (c === 0 ? `r${r}` : c)));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const r = renderSheet(ws, decode);
  assert.equal(r.rowCount, MAX_ROWS);
  assert.equal(r.colCount, MAX_COLS);
  assert.equal(r.truncated, true);
});

test('trailing empty rows are trimmed and merges survive', () => {
  const ws = XLSX.utils.aoa_to_sheet([['Title', null, null], ['a', 'b', 'c']]);
  ws['!ref'] = 'A1:C500';
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  const r = renderSheet(ws, decode);
  assert.equal(r.rowCount, 2);
  assert.deepEqual(r.merges, [[0, 0, 1, 3]]);
});

test('T9: a ping can add at most 10 seconds', () => {
  assert.equal(clampDelta(600000), 10000);
  assert.equal(clampDelta(5000), 5000);
  assert.equal(clampDelta(-3), 0);
  assert.equal(clampDelta('abc'), 0);
});

test('viewing now, completion and durations', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  assert.equal(isViewingNow(new Date(now - 20000), now), true);
  assert.equal(isViewingNow(new Date(now - 31000), now), false);
  assert.equal(completion([{ unitIndex: 0, durationMs: 6000 }, { unitIndex: 1, durationMs: 4000 }, { unitIndex: 2, durationMs: 5000 }], 4), 0.5);
  assert.equal(completion([], 0), 0);
  assert.equal(formatDuration(45000), '45s');
  assert.equal(formatDuration(200000), '3m 20s');
  assert.equal(formatDuration(3900000), '1h 05m');
  assert.deepEqual(deviceFromUa('Mozilla/5.0 (iPhone) Safari/604.1'), { device: 'Phone', browser: 'Safari' });
});

test('visitor matching: person, company domain, freemail, website', () => {
  const pool = {
    contacts: [
      { id: 'p1', email: 'Jane@Acme.com', clientId: 'c1' },
      { id: 'p2', email: 'bob@acme.com', clientId: 'c1' },
      { id: 'p3', email: 'sam@gmail.com', clientId: 'c9' },
    ],
    clients: [{ id: 'c2', email: null, website: 'https://www.builder.co' }],
  };
  assert.deepEqual(matchFromPool('jane@acme.com', pool), { matchType: 'EMAIL', contactId: 'p1', clientId: 'c1', domain: 'acme.com' });
  assert.equal(matchFromPool('new.person@acme.com', pool).clientId, 'c1');
  assert.equal(matchFromPool('new.person@acme.com', pool).matchType, 'DOMAIN');
  assert.equal(matchFromPool('ann@builder.co', pool).clientId, 'c2');
  assert.equal(matchFromPool('other@gmail.com', pool).matchType, 'NONE');
  assert.equal(matchFromPool('sam@gmail.com', pool).matchType, 'EMAIL');
  assert.equal(matchFromPool('not an email', pool).matchType, 'NONE');
  assert.equal(isFreemail('Outlook.com'), true);
  assert.equal(emailDomain(' A@B.CO '), 'b.co');
  assert.equal(websiteDomain('www.x.com/about'), 'x.com');
  assert.equal(normalizeEmail('nope'), null);
});

test('T10: forwarded = opened by someone other than the recipient', () => {
  assert.equal(isForwarded('jane@acme.com', 'JANE@acme.com'), false);
  assert.equal(isForwarded('jane@acme.com', 'bob@acme.com'), true);
  assert.equal(isForwarded(null, 'bob@acme.com'), false);
});
