// Pricing guard for Sales Docs (0137). Pure, no DB, no storage.
//
// A workbook that shows what ILC pays (dealer net, cost, margin) must never go
// out on a share link by accident. Workbooks are BLOCKED when:
//   - a header-like cell names a cost column (DN, buy price, margin, ...)
//   - a sheet is hidden (people hide the cost tab and forget it is there)
//   - a column with anything in it is hidden
//   - a defined name or a sheet name names a cost column
// A Super Admin or Sales Admin can override with a reason. Hidden sheets,
// rows and columns are left out of the shared view even after an override.
//
// PDFs only WARN: a PDF has no columns to read, so a text hit is a hint, not proof.

// Whole-token match. \b would miss "D.N." (no word boundary after a period).
const TOKEN = '(DN|D\\.N\\.|DEALER NET|BUY|BUY PRICE|COST|NET COST|UNIT COST|MARGIN|GP|GROSS PROFIT|MARKUP)';
export const COST_HEADER_RE = new RegExp(`(?<![A-Za-z0-9])${TOKEN}(?![A-Za-z0-9])`, 'i');
export const PDF_WARN_RE = /\bdealer net\b|\bDN\b|\bbuy price\b/i;

const HEADER_ROWS = 15;
const HEADER_MAX_CHARS = 30;
const HEADER_MIN_STRINGS = 3;

/** Column number (0-based) to letters. */
export function colLetters(c) {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const isText = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Header-like cells in the first rows of one sheet that name a cost column.
 * @param {Array<Array<any>>} rows raw cell values, row by row (first 15 are enough)
 * @param {{ sheetName?: string, rowOffset?: number, colOffset?: number }} opts
 */
export function scanHeaderRows(rows, { sheetName = null, rowOffset = 0, colOffset = 0 } = {}) {
  const hits = [];
  rows.slice(0, HEADER_ROWS).forEach((row, r) => {
    const cells = Array.isArray(row) ? row : [];
    if (cells.filter(isText).length < HEADER_MIN_STRINGS) return;
    cells.forEach((v, c) => {
      if (!isText(v)) return;
      const text = v.trim();
      if (text.length > HEADER_MAX_CHARS) return;
      if (!COST_HEADER_RE.test(text)) return;
      hits.push({
        reason: 'COST_HEADER',
        sheetName,
        cell: `${colLetters(c + colOffset)}${r + rowOffset + 1}`,
        text,
      });
    });
  });
  return hits;
}

/** Is sheet i hidden (Hidden 1 = hidden, 2 = very hidden)? */
export function sheetHidden(wb, i) {
  return !!(wb?.Workbook?.Sheets?.[i]?.Hidden);
}

/**
 * Scan a SheetJS workbook (read with cellStyles: true so hidden rows and
 * columns are known). `decode` is XLSX.utils.decode_range, passed in so this
 * file stays free of the library.
 * @returns {{ status: 'CLEAN'|'BLOCKED', hits: Array }}
 */
export function scanWorkbook(wb, decode) {
  const hits = [];
  (wb.SheetNames || []).forEach((name, i) => {
    const ws = wb.Sheets[name];
    if (sheetHidden(wb, i)) hits.push({ reason: 'HIDDEN_SHEET', sheetName: name, cell: null, text: name });
    if (COST_HEADER_RE.test(name)) hits.push({ reason: 'SHEET_NAME', sheetName: name, cell: null, text: name });
    if (!ws || !ws['!ref']) return;
    const range = decode(ws['!ref']);

    // Hidden columns that hold anything.
    (ws['!cols'] || []).forEach((col, c) => {
      if (!col?.hidden || c < range.s.c || c > range.e.c) return;
      for (let r = range.s.r; r <= range.e.r; r++) {
        const cell = ws[`${colLetters(c)}${r + 1}`];
        if (cell && cell.v != null && String(cell.v).trim() !== '') {
          hits.push({ reason: 'HIDDEN_COLUMN', sheetName: name, cell: colLetters(c), text: `Column ${colLetters(c)}` });
          return;
        }
      }
    });

    // Header rows: raw values of the first rows, every column in range. Only
    // text cells count toward the three-text-cells test.
    const rows = [];
    const lastRow = Math.min(range.e.r, range.s.r + HEADER_ROWS - 1);
    for (let r = range.s.r; r <= lastRow; r++) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[`${colLetters(c)}${r + 1}`];
        row.push(cell ? cell.v : null); // numbers and dates stay non-text
      }
      rows.push(row);
    }
    hits.push(...scanHeaderRows(rows, { sheetName: name, rowOffset: range.s.r, colOffset: range.s.c }));
  });

  for (const n of wb?.Workbook?.Names || []) {
    if (n?.Name && !String(n.Name).startsWith('_xlnm') && COST_HEADER_RE.test(n.Name.replace(/[_.]/g, ' '))) {
      hits.push({ reason: 'DEFINED_NAME', sheetName: null, cell: null, text: n.Name });
    }
  }
  return { status: hits.length ? 'BLOCKED' : 'CLEAN', hits };
}

/**
 * PDF text, one string per page. Warn only.
 * @returns {{ status: 'CLEAN'|'WARN', hits: Array }}
 */
export function scanPdfPages(pages) {
  const hits = [];
  pages.forEach((text, i) => {
    const m = String(text || '').match(PDF_WARN_RE);
    if (m) hits.push({ reason: 'PDF_TEXT', page: i + 1, sheetName: null, cell: null, text: m[0] });
  });
  return { status: hits.length ? 'WARN' : 'CLEAN', hits };
}

/** Can a link be made for a version with this scan status? */
export const shareAllowed = (scanStatus) => scanStatus === 'CLEAN' || scanStatus === 'WARN' || scanStatus === 'OVERRIDDEN';

/** Plain words for the scan pill. */
export const SCAN_LABELS = {
  PENDING: 'Checking',
  CLEAN: 'No cost columns',
  WARN: 'Check pricing words',
  BLOCKED: 'Cost columns found · sharing blocked',
  OVERRIDDEN: 'Cleared by admin',
};

export const HIT_LABELS = {
  COST_HEADER: 'Cost column',
  HIDDEN_SHEET: 'Hidden sheet',
  HIDDEN_COLUMN: 'Hidden column',
  DEFINED_NAME: 'Named range',
  SHEET_NAME: 'Sheet name',
  PDF_TEXT: 'Pricing word',
};
