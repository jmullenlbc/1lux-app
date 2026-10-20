// Turn one workbook sheet into what the share viewer draws (0137). Pure.
//
// Cached values only (what Excel last showed), never formulas. Hidden sheets,
// rows and columns are left out entirely, so they cannot be read from the page
// source either. Capped at 2,000 rows by 60 columns; past that the viewer says
// so and, when the link allows it, points to the download.
import { colLetters, sheetHidden } from './pricingScan.js';

export const MAX_ROWS = 2000;
export const MAX_COLS = 60;
const DEFAULT_COL_PX = 80;
const MAX_COL_PX = 400;

function cellText(cell) {
  if (!cell || cell.v == null) return null;
  if (cell.w != null && cell.w !== '') return String(cell.w);
  if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  return String(cell.v);
}

/**
 * @param {object} ws SheetJS worksheet (read with cellStyles: true)
 * @param {Function} decode XLSX.utils.decode_range
 * @returns {{ rowCount, colCount, truncated, colLabels, colWidths, rowNums, cells, merges }}
 *   cells[r][c] is null, a string, or [string, 1] for a number (right aligned)
 */
export function renderSheet(ws, decode) {
  if (!ws || !ws['!ref']) {
    return { rowCount: 0, colCount: 0, truncated: false, colLabels: [], colWidths: [], rowNums: [], cells: [], merges: [] };
  }
  const range = decode(ws['!ref']);
  const colsMeta = ws['!cols'] || [];
  const rowsMeta = ws['!rows'] || [];

  const allCols = [];
  for (let c = range.s.c; c <= range.e.c; c++) if (!colsMeta[c]?.hidden) allCols.push(c);
  const allRows = [];
  for (let r = range.s.r; r <= range.e.r; r++) if (!rowsMeta[r]?.hidden) allRows.push(r);

  // Trim trailing empty rows so a stray format at row 60,000 does not count.
  const rowHasValue = (r) => allCols.some((c) => cellText(ws[`${colLetters(c)}${r + 1}`]) != null);
  while (allRows.length && !rowHasValue(allRows[allRows.length - 1])) allRows.pop();

  const cols = allCols.slice(0, MAX_COLS);
  const rows = allRows.slice(0, MAX_ROWS);
  const truncated = allCols.length > cols.length || allRows.length > rows.length;

  const cells = rows.map((r) => cols.map((c) => {
    const cell = ws[`${colLetters(c)}${r + 1}`];
    const text = cellText(cell);
    if (text == null) return null;
    return cell.t === 'n' ? [text, 1] : text;
  }));

  const colWidths = cols.map((c) => {
    const m = colsMeta[c];
    const px = m?.wpx ?? (m?.wch ? Math.round(m.wch * 7 + 10) : DEFAULT_COL_PX);
    return Math.min(MAX_COL_PX, Math.max(32, px));
  });

  // Merges whose top-left cell is shown, spans counted in shown rows/columns.
  const rowAt = new Map(rows.map((r, i) => [r, i]));
  const colAt = new Map(cols.map((c, i) => [c, i]));
  const merges = [];
  for (const m of ws['!merges'] || []) {
    const r0 = rowAt.get(m.s.r);
    const c0 = colAt.get(m.s.c);
    if (r0 == null || c0 == null) continue;
    const rs = rows.filter((r) => r >= m.s.r && r <= m.e.r).length;
    const cs = cols.filter((c) => c >= m.s.c && c <= m.e.c).length;
    if (rs > 1 || cs > 1) merges.push([r0, c0, rs, cs]);
  }

  return {
    rowCount: rows.length,
    colCount: cols.length,
    truncated,
    colLabels: cols.map(colLetters),
    colWidths,
    rowNums: rows.map((r) => r + 1),
    cells,
    merges,
  };
}

/**
 * Every sheet of a workbook: hidden ones are listed (so staff can see they
 * were left out) but never rendered.
 * @returns {Array<{ index, name, hidden, render|null }>}
 */
export function renderWorkbook(wb, decode) {
  return (wb.SheetNames || []).map((name, index) => {
    const hidden = sheetHidden(wb, index);
    return { index, name, hidden, render: hidden ? null : renderSheet(wb.Sheets[name], decode) };
  });
}
