import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Building-data takeoff categories (drawing takeoffs Phase 1, 2026-08-12).
// The Takeoffs tab renders whatever keys exist in a file's takeoffData, so
// no UI change is needed to hold these, this constant exists so the Phase 2
// drawing parser (and anything comparing sets) writes the SAME key names
// every time. The values appear verbatim in the Fixture Count Comparison
// table's Type column, so they're human-readable labels, not code keys.
export const BUILDING_TAKEOFF_CATEGORIES = {
  entranceDoors:  'Entrance Doors',
  buildings:      'Buildings',
  elevatorShafts: 'Elevator Shafts',
  wallpacks:      'Wallpacks',
};

/**
 * Parses a Countfire Excel takeoff (last tab) and returns { fixtureType: totalQty }.
 * Handles two format variants:
 *   New: Count at col 0, fixture type at col 0, type ("Point") at col 1
 *   Old: empty col 0, Count at col 1, fixture type at col 1, type at col 2
 */
export function parseTakeoffBuffer(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true });
  if (!wb.SheetNames.length) return null;

  const ws = wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Format 3: simple two-column summary sheet [fixtureType, qty], no Count/Total headers.
  // Detected when the first non-empty row has a string in col 0 and a number in col 1.
  const firstDataRow = data.find(row => String(row[0]).trim() !== '');
  const looksLikeSummary = firstDataRow
    && typeof firstDataRow[0] === 'string'
    && typeof firstDataRow[1] === 'number'
    && !String(firstDataRow[0]).trim().match(/^count$/i)
    && !String(firstDataRow[1]).toString().match(/^(point|measure|type)$/i);

  if (looksLikeSummary) {
    const quantities = {};
    for (const row of data) {
      const name = String(row[0] ?? '').trim();
      const qty  = Number(row[1]);
      if (!name || isNaN(qty) || qty <= 0) continue;
      if (name.includes('(IN LFT)') || name.includes('(IN LF)')) continue;
      if (name.toUpperCase().startsWith('UNTAGGED')) continue;
      quantities[name] = (quantities[name] ?? 0) + qty;
    }
    return Object.keys(quantities).length > 0 ? quantities : null;
  }

  // Detect format: find header row containing 'Count'
  let headerRowIdx = data.findIndex(row => String(row[0]).trim() === 'Count');
  let col = 0; // column offset: 0 for new format, 1 for old format

  if (headerRowIdx === -1) {
    headerRowIdx = data.findIndex(row => String(row[1]).trim() === 'Count');
    col = 1;
  }

  if (headerRowIdx === -1) return null;

  const headerRow = data[headerRowIdx];
  const totalColIdx = headerRow.findIndex(cell => String(cell).trim() === 'Total');
  if (totalColIdx === -1) return null;

  const quantities = {};

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];

    // Stop if we hit a second section header (e.g. "Measure")
    const firstContent = String(row[col] ?? '').trim();
    if (firstContent === 'Measure' || firstContent === 'Count') break;

    const fixtureType = firstContent;
    const rowType = String(row[col + 1] ?? '').trim();

    // Only include actual fixture count rows
    if (!fixtureType || rowType !== 'Point') continue;

    let qty = Number(row[totalColIdx]) || 0;

    // If Total = 0, check whether the cell has an unevaluated formula.
    // Countfire exports sometimes omit cached formula results; the per-column
    // quantities (cols col+2 through totalColIdx-1) are always stored as plain
    // values and sum to the correct total.
    if (qty === 0) {
      const cellAddr = XLSX.utils.encode_cell({ r: i, c: totalColIdx });
      const cell = ws[cellAddr];
      if (cell && cell.f) {
        for (let c = col + 2; c < totalColIdx; c++) qty += Number(row[c]) || 0;
      }
    }

    quantities[fixtureType] = qty;
  }

  return Object.keys(quantities).length > 0 ? quantities : null;
}
