import '@/lib/pdfPolyfill';
import { loadPdfjs } from './pdfjsNode.js';
/**
 * parseBudgetLineItems.js
 *
 * Extracts the fixture line-item table from a budget PDF using position-aware
 * text extraction from pdfjs-dist. Groups text items by Y coordinate so each
 * table row arrives as an ordered array of cells (left→right), then tries to
 * identify: Type | Description | Manufacturer | Part # | Qty | Unit Price | Total.
 *
 * Returns an array of line-item objects sorted by total (desc), top 20.
 */

const MONEY_RE  = /^\$?[\d,]+(?:\.\d{1,2})?$/;
const INT_RE    = /^\d{1,5}$/;

function parseMoney(str) {
  if (!str) return null;
  const n = parseFloat(str.replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

function isMoneyLike(str) {
  return MONEY_RE.test(str.trim()) && str.includes('.');
}

function isIntLike(str) {
  return INT_RE.test(str.trim()) && parseInt(str, 10) < 10000;
}

/** Cluster pdfjs text items into rows by y-coordinate proximity. */
function clusterByY(items, yTolerance = 4) {
  const rows = []; // [{y, cells:[{x, text}]}]

  for (const item of items) {
    if (!item.str?.trim()) continue;
    const y = item.transform[5];
    const x = item.transform[4];

    let row = rows.find(r => Math.abs(r.y - y) <= yTolerance);
    if (!row) {
      row = { y, cells: [] };
      rows.push(row);
    }
    row.cells.push({ x, text: item.str.trim() });
  }

  return rows
    .sort((a, b) => b.y - a.y)                              // top-to-bottom
    .map(r => r.cells.sort((a, b) => a.x - b.x).map(c => c.text));
}

/** Try to find the fixture-schedule header row. */
function findHeaderRow(rows) {
  const HEADER_HINTS = ['type', 'desc', 'manuf', 'part', 'qty', 'unit', 'total', 'catalog', 'model', 'price', 'net'];
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const joined = rows[i].join(' ').toLowerCase();
    const matches = HEADER_HINTS.filter(h => joined.includes(h));
    if (matches.length >= 3) return i;
  }
  return -1;
}

/** Parse a single data row into a line item. */
function parseRow(cells) {
  // Need at least 3 cells to be meaningful
  if (cells.length < 3) return null;

  // Walk from right: find the last two money-like cells (total, then unit price)
  let totalIdx = -1;
  let unitIdx  = -1;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (isMoneyLike(cells[i])) {
      if (totalIdx === -1) totalIdx = i;
      else if (unitIdx === -1) { unitIdx = i; break; }
    }
  }

  // Must have at least a total
  if (totalIdx === -1) return null;

  const total     = parseMoney(cells[totalIdx]);
  const unitPrice = unitIdx !== -1 ? parseMoney(cells[unitIdx]) : null;
  if (!total || total <= 0) return null;

  // Qty: integer cell just to the left of the first price column
  const priceStart = unitIdx !== -1 ? unitIdx : totalIdx;
  let qty = null;
  let qtyIdx = -1;
  for (let i = priceStart - 1; i >= 0; i--) {
    if (isIntLike(cells[i])) {
      qty    = parseInt(cells[i], 10);
      qtyIdx = i;
      break;
    }
  }

  // If we have unit price + qty, validate consistency (within 5%)
  if (unitPrice && qty) {
    const expected = unitPrice * qty;
    if (Math.abs(expected - total) / total > 0.10) {
      // Doesn't add up, maybe qty wasn't found correctly; infer it
      qty = Math.round(total / unitPrice);
      qtyIdx = priceStart - 1; // treat as if qty was at priceStart-1
    }
  } else if (unitPrice && !qty) {
    qty    = Math.round(total / unitPrice);
  }

  // Descriptor cells: everything before qtyIdx (or priceStart-1 if no qty)
  const descEnd = qtyIdx !== -1 ? qtyIdx : priceStart;
  const descCells = cells.slice(0, descEnd).filter(Boolean);

  let type = '', description = '', manufacturer = '', partNo = '';

  if (descCells.length >= 4) {
    type         = descCells[0];
    description  = descCells[1];
    manufacturer = descCells[2];
    partNo       = descCells.slice(3).join(' ');
  } else if (descCells.length === 3) {
    type         = descCells[0];
    description  = descCells[1];
    manufacturer = descCells[2];
  } else if (descCells.length === 2) {
    type         = descCells[0];
    description  = descCells[1];
  } else if (descCells.length === 1) {
    // Single cell, try to split: short prefix = type, rest = description
    const m = descCells[0].match(/^([A-Z0-9]{1,5})\s+(.+)$/);
    if (m) { type = m[1]; description = m[2]; }
    else description = descCells[0];
  }

  // Sanity: type should be short; if it's long, fold it into description
  if (type.length > 10) { description = `${type} ${description}`.trim(); type = ''; }

  // Skip obvious non-item rows (subtotals, blank, headers)
  const descLower = description.toLowerCase();
  if (['total', 'subtotal', 'controls', 'freight', 'warehousing', 'tax', 'grand', 'net'].some(w => descLower.startsWith(w) && descCells.length <= 2)) {
    return null;
  }

  return { type, description, manufacturer, partNo, qty: qty || 1, unitPrice: unitPrice || total, total };
}

/** Main entry, call with Buffer from file upload. */
export async function parseBudgetLineItemsFromBuffer(buffer) {
  try {
    const pdfjsLib = await loadPdfjs();
    const uint8    = new Uint8Array(buffer);
    const doc      = await pdfjsLib.getDocument({ data: uint8 }).promise;

    const allRows = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page    = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows    = clusterByY(content.items);
      allRows.push(...rows);
    }

    if (allRows.length === 0) return [];

    // Detect header row and start parsing after it
    const headerIdx = findHeaderRow(allRows);
    const dataRows  = headerIdx >= 0 ? allRows.slice(headerIdx + 1) : allRows;

    const items = [];
    for (const row of dataRows) {
      const item = parseRow(row);
      if (item) items.push(item);
    }

    // Deduplicate by (type + description) keeping highest total
    const seen = new Map();
    for (const item of items) {
      const key = `${item.type}|${item.description}`.toLowerCase();
      const existing = seen.get(key);
      if (!existing || item.total > existing.total) seen.set(key, item);
    }

    return [...seen.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

  } catch (err) {
    console.error('[parseBudgetLineItems] error:', err?.message);
    return [];
  }
}
