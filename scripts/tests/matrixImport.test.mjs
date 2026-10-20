// Peer review matrix reader + "we suggest" rules (Mike 10-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { readMatrixSheets, readMatrixWorkbook, newestLines, tabKind, jobNameFromFile } from '../../src/lib/matrixImport/readMatrix.js';
import { splitCatalog, familyKey, normMfr, swapOutcome, categoryOf } from '../../src/lib/specSwap/family.js';
import { suggestFor, cctOf } from '../../src/lib/specSwap/suggest.js';
import { buildSwapRows, productKey } from '../../src/lib/specSwap/loadRows.js';

const HEADER = ['TYPE', 'LOCATION TAG', 'DESCRIPTION', 'ORIGINAL MANUFACTURER', 'ORIGINAL PRODUCT SPECIFICATION**', 'ORIGINAL SPEC DETAILS',
  'QTY', 'QTY TYPE UNIT/FT', 'ALT CHOICES', 'INTERNAL NOTES', 'ILC PROPOSED MANUFACTURER', 'ILC PROPOSED SPECIFICATION', 'SALES REP',
  'WHO SENT THE RFQ', 'RFQ STATUS', 'NEEDS REVIEW', 'PROPOSED UNIT DN', 'PROPOSED UNIT CN', 'PROPOSED TOTAL CN', 'NOTES'];
const row = (type, desc, om, os, qty, pm, ps, cn) => [type, '', desc, om, os, '', qty, 'UNIT', '', '', pm, ps, '', '', '', '', '', cn, '', ''];

const NEW_TAB = [
  ['PROJECT', '', 'SUN VALLEY'], ['CLIENT', '', 'GREYSTAR'], ['TOTAL SF', '', 250000], [],
  HEADER,
  ['UNITS'],
  row('A1', 'SURFACE DISK', 'Lithonia Lighting', 'FMML 13 840 WH', 400, 'ELUMA', 'DL-7-3000', 14),
  row('A2', 'VANITY', 'Progress', 'P300', 200, 'ELUMA', 'VL-R-24', '$33.00'),
  row('X1', 'OLD PENDANT', 'Tech Lighting', 'T-100', '', '', '', ''),
  row('X2', 'STEP LIGHT', 'Bega', '33054', 12, '', '', ''),
];
const OLD_TAB = [
  HEADER,
  row('A1', 'SURFACE DISK', 'Lithonia', 'FMML 13 840', 380, 'ELUMA', 'DL-12-3000', 30),
  row('S1', 'POLE', 'Lithonia', 'DSX1 LED', 10, 'Lithonia', 'DSX1 LED P1', 900),
];

const SHEETS = [
  { name: '1.23.26 ADDENDUM 2', rows: NEW_TAB },
  { name: 'Copy of 9.2025 ADDENDUM 1', rows: OLD_TAB },
  { name: 'FIXTURE MATRIX VE - MK', rows: OLD_TAB },
  { name: '6.2025 PERMIT FIXTURE MATRIX', rows: OLD_TAB },
  { name: 'RFQ TEMPLATE', rows: [HEADER, row('Z9', 'x', 'a', 'b', 1, 'c', 'd', 1)] },
  { name: 'Sheet9', rows: [['nothing here']] },
];

test('tab kinds from the tab name', () => {
  assert.equal(tabKind('RFQ TEMPLATE'), 'SKIP');
  assert.equal(tabKind('TAKE OFF REPORT'), 'SKIP');
  assert.equal(tabKind('STANDARD PR PRODUCTS'), 'SKIP');
  assert.equal(tabKind('MK Copy of 112125 FIXTURE MATRI'), 'COPY');
  assert.equal(tabKind('VE WITH ACUITY POLE LIGHTS FIXT'), 'VE');
  assert.equal(tabKind('ORIGINAL SPEC PRICING ASI 01- F'), 'ORIGINAL');
  assert.equal(tabKind('1.23.26 ADDENDUM 2 FIXTURE MATR'), 'MAIN');
});

test('reads the table, header block, sections and numbers', () => {
  const tables = readMatrixSheets(SHEETS);
  assert.deepEqual(tables.map((t) => t.kind), ['MAIN', 'COPY', 'VE', 'MAIN']);
  const t = tables[0];
  assert.equal(t.header.project, 'SUN VALLEY');
  assert.equal(t.header.totalSf, 250000);
  assert.equal(t.lines.length, 4);
  const a2 = t.lines.find((l) => l.type === 'A2');
  assert.equal(a2.unitCn, 33);
  assert.equal(a2.totalCn, 6600);
  assert.equal(a2.section, 'UNITS');
  // Mike 10-18: no proposal and no quantity = not used any more; a quantity keeps it live.
  assert.equal(t.lines.find((l) => l.type === 'X1').notUsed, true);
  assert.equal(t.lines.find((l) => l.type === 'X2').notUsed, false);
});

test('newest lines: leftmost MAIN tab wins, older tabs only add new types', () => {
  const lines = newestLines(readMatrixSheets(SHEETS));
  const a1 = lines.filter((l) => l.type === 'A1');
  assert.equal(a1.length, 1);
  assert.equal(a1[0].propCatalog, 'DL-7-3000');
  assert.equal(a1[0].sheetName, '1.23.26 ADDENDUM 2');
  const s1 = lines.find((l) => l.type === 'S1');
  assert.equal(s1.sheetName, '6.2025 PERMIT FIXTURE MATRIX');
  assert.equal(lines.length, 5);
});

test('reads a real xlsx through SheetJS', () => {
  const wb = XLSX.utils.book_new();
  for (const s of SHEETS) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const tables = readMatrixWorkbook(XLSX, buf);
  assert.equal(tables.length, 4);
  assert.equal(newestLines(tables).length, 5);
});

test('job name from the file name', () => {
  assert.equal(jobNameFromFile('SUN VALLEY BLOCK 2 PEER REVIEW MATRIX (1).xlsx'), 'SUN VALLEY BLOCK 2');
  assert.equal(jobNameFromFile('25.06.05_PEER REVIEW MATRIX_AVILLA MESA VISTA_in progress.xlsx'), 'AVILLA MESA VISTA IN PROGRESS');
  assert.equal(jobNameFromFile('9TH + CLERMONT MATRIX.xlsx'), jobNameFromFile('9TH + CLERMONT MATRIX (1).xlsx'));
  assert.equal(jobNameFromFile('115 W 5TH - DENVER HEALTH PEER REVIEW MATRIX.xlsx'), '115 W 5TH - DENVER HEALTH');
  assert.equal(jobNameFromFile('PEER REVIEW MATRIX- ALTA METRO CENTER.xlsx'), 'ALTA METRO CENTER');
  assert.equal(jobNameFromFile('1717 WASHINGTON- PEER REVIEW MATRIX .xlsx'), '1717 WASHINGTON');
});

test('catalog families and options', () => {
  assert.deepEqual(splitCatalog('DL-7-3000'), { family: 'DL-7', options: { cct: '3000' } });
  assert.deepEqual(splitCatalog('STR-48-40L-3500-BB'), { family: 'STR-48-40L', options: { cct: '3500', battery: 'BB' } });
  assert.equal(splitCatalog('CYWS-30-B').family, 'CYWS-30');
  assert.equal(splitCatalog('EXU-EL-RG').family, 'EXU-EL-RG');
  assert.equal(splitCatalog('EM-FE-25').family, 'EM-FE-25');
  assert.equal(splitCatalog('PS-UNV-96-24').family, 'PS-UNV-96-24');
  assert.deepEqual(splitCatalog('FMML 13 840 WH'), { family: 'FMML-13', options: { cct: '840', finish: 'WH' } });
  assert.equal(splitCatalog('DL-7-5CCT\nwith junction box').family, 'DL-7');
  assert.equal(splitCatalog('EX-LSB-PS+ WITH LAMP').family, 'EX-LSB-PS');
  assert.equal(splitCatalog('CYWS-30 ***FINNISH TBD').family, 'CYWS-30');
  assert.equal(familyKey('Lithonia Lighting', 'FMML 13 840'), 'LITHONIA|FMML13');
  assert.equal(familyKey('', 'FMML'), null);
  assert.equal(familyKey('Globalux', '#LD-L2-6-15'), familyKey('GLOBALUX', 'LDL2-6-15'));
  assert.equal(familyKey('TBD', 'TBD'), null);
  assert.equal(familyKey('Lithonia', 'Lithonia or equal'), null);
  assert.equal(familyKey('N/A', 'N/A'), null);
  assert.equal(normMfr('ELUMA LIGHTING'), 'ELUMA');
  assert.equal(cctOf('840'), '4000');
  assert.equal(cctOf('30K'), '3000');
  assert.equal(categoryOf('4FT STRIP'), 'linear');
});

test('swap outcome', () => {
  assert.equal(swapOutcome({ origMfr: 'Lithonia', origCatalog: 'X', propMfr: 'Eluma', propCatalog: 'DL-7' }), 'SWAPPED');
  assert.equal(swapOutcome({ origMfr: 'Lithonia', origCatalog: 'X', propMfr: 'LITHONIA LIGHTING', propCatalog: 'X' }), 'KEPT');
  assert.equal(swapOutcome({ origMfr: 'Lithonia', origCatalog: 'X', propMfr: 'Acuity, original spec', propCatalog: '' }), 'KEPT');
  assert.equal(swapOutcome({ origMfr: 'Lithonia', propMfr: 'BUDGET PLACEHOLDER' }), 'PLACEHOLDER');
  assert.equal(swapOutcome({ origMfr: 'Lithonia', origCatalog: 'DSX1', propMfr: 'Acuity', propCatalog: 'ORIGINAL SPEC' }), 'KEPT');
  assert.equal(swapOutcome({ origMfr: '', origCatalog: '', propMfr: 'Eluma', propCatalog: 'EX-TH' }), 'ADDED');
  assert.equal(swapOutcome({ origMfr: 'Bega', origCatalog: '33054', propMfr: '', propCatalog: '' }), null);
});

test('we suggest: family match ranked by jobs, brand + category fallback', () => {
  const sw = (sourceName, propFamily, extra = {}) => ({
    sourceName, origMfr: 'LITHONIA', origFamily: 'LITHONIA|FMML13', category: 'surface disk',
    propMfr: 'ELUMA', propFamily, propCatalog: `${propFamily}-3000`, outcome: 'SWAPPED', unitCn: 14, sheetDate: '2026-01-01', ...extra,
  });
  const swaps = [
    sw('JOB A', 'DL-7'), sw('JOB B', 'DL-7', { unitCn: 12 }), sw('JOB C', 'DL-7', { unitCn: 16 }),
    sw('JOB D', 'DL-12', { unitCn: 30 }),
    sw('JOB E', 'DL-7', { outcome: 'PLACEHOLDER' }),
    sw('JOB F', 'STR-48-40L', { origFamily: 'LITHONIA|CLX', category: 'linear' }),
  ];
  const s = suggestFor({ mfr: 'Lithonia', catalog: 'FMML 13 840 WH' }, swaps);
  assert.equal(s.match, 'FAMILY');
  assert.equal(s.cct, '4000');
  assert.equal(s.options[0].propFamily, 'DL-7');
  assert.equal(s.options[0].jobs, 3);
  assert.equal(s.options[0].medianUnitCn, 14);
  assert.equal(s.options[1].propFamily, 'DL-12');

  const b = suggestFor({ mfr: 'Lithonia', catalog: 'ZL1N 4FT', description: '4FT STRIP' }, swaps);
  assert.equal(b.match, 'BRAND_CATEGORY');
  assert.equal(b.options[0].propFamily, 'STR-48-40L');

  const c = suggestFor({ mfr: 'Cooper', catalog: 'SNLED 4FT', description: '4FT STRIP' }, swaps);
  assert.equal(c.match, 'CATEGORY');
  assert.equal(c.options[0].propFamily, 'STR-48-40L');

  assert.equal(suggestFor({ mfr: 'Bega', catalog: '33054' }, swaps).match, 'NONE');
});

test('matrix loader: rows from browser lines, skips, links our product, strings only', () => {
  const productByKey = new Map([[productKey('Eluma', 'DL-7-3000'), 'p1']]);
  const lines = [
    { type: 'A1', description: 'Surface disk', location: 'Unit', sheetName: 'R2', origMfr: 'Lithonia', origCatalog: 'FMML 13 840\nWH', propMfr: 'ELUMA', propCatalog: 'DL-7-3000', qty: '12', uom: 'EA', unitCn: 14.5, unitDn: 9 },
    { type: 2, origMfr: 'Lithonia', origCatalog: 'CLX', propMfr: 'Lithonia', propCatalog: 'CLX L48' },
    { type: 'X', origMfr: 'Bega', origCatalog: '33054' },
    { type: 'P', origMfr: 'WAC', origCatalog: 'HR-2', propMfr: 'Placeholder', propCatalog: '' },
  ];
  const { rows, totals } = buildSwapRows(lines, { job: 'JOB A', sheetDate: new Date('2026-01-01'), productByKey });
  assert.deepEqual(
    { rows: totals.rows, SWAPPED: totals.SWAPPED, KEPT: totals.KEPT, PLACEHOLDER: totals.PLACEHOLDER, skipped: totals.skipped, linked: totals.linked },
    { rows: 3, SWAPPED: 1, KEPT: 1, PLACEHOLDER: 1, skipped: 1, linked: 1 },
  );
  const a = rows[0];
  assert.equal(a.sourceKind, 'MATRIX_FILE');
  assert.equal(a.sourceName, 'JOB A');
  assert.equal(a.origCatalog, 'FMML 13 840');
  assert.equal(a.productId, 'p1');
  assert.equal(a.qty, 12);
  assert.equal(a.unitCn, 14.5);
  assert.equal(a.category, 'surface disk');
  assert.equal('unitDn' in a, false);
  assert.equal(rows[1].typeTag, '2');
});
