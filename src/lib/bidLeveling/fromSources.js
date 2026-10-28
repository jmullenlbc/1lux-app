/**
 * Turn the places a bid comes from into BidLine rows (Mike 10-18). Pure.
 *
 *   bidLinesFromMatrix(lines)       an ILC peer review matrix (readMatrix.js)
 *   bidLinesFromPeerReview(items)   this project's Peer Review rows
 *   parsePastedLines(text)          rows pasted from Excel (a competitor quote)
 *
 * ILC lines carry CN only. DN is never copied onto a bid line.
 * requestedMfr / requestedCatalog = what the drawings asked for, so the screen
 * can show requested versus offered and run "we suggest" on the request.
 */
import { normalizeTag } from './normalizeTag.js';
import { swapOutcome } from '../specSwap/family.js';
import { toNumber } from '../matrixImport/readMatrix.js';

const firstLine = (s) => String(s ?? '').split(/\r?\n/)[0].trim();
const blank = (s) => (s == null || String(s).trim() === '' ? null : String(s).trim());

/** EA, LF or LOT from whatever the sheet wrote (UNIT, FT, LINEAR FT, LS). */
export function uomOf(raw) {
  const s = String(raw ?? '').toUpperCase();
  if (/\b(LF|FT|FEET|FOOT|LINEAR)\b|'/.test(s)) return 'LF';
  if (/\b(LOT|LS|LUMP)\b/.test(s)) return 'LOT';
  return 'EA';
}

/** BASE, VE or ALT from an option column ("VE", "Alternate 1", blank). */
export function optionGroupOf(raw) {
  const s = String(raw ?? '').toUpperCase();
  if (/\bVE\b|VALUE/.test(s)) return 'VE';
  if (/\bALT/.test(s)) return 'ALT';
  return 'BASE';
}

function tagged(raw, ctx) {
  const t = normalizeTag(raw, ctx);
  return { typeTagRaw: String(raw ?? '').trim(), typeTag: t.typeTag, variant: t.variant, lengthFt: t.lengthFt };
}

function specBasisOf(outcome, notUsed) {
  if (notUsed) return 'NOT_USED';
  if (outcome === 'KEPT') return 'ORIGINAL';
  if (outcome === 'PLACEHOLDER') return 'ALLOWANCE';
  if (outcome === 'SWAPPED' || outcome === 'ADDED') return 'SUBSTITUTE';
  return 'NO_QUOTE';
}

export function bidLinesFromMatrix(lines) {
  return (lines || [])
    .filter((l) => blank(l.type))
    .map((l, i) => {
      const catalog = blank(firstLine(l.propCatalog));
      return {
        ...tagged(l.type, { description: l.description, catalog, mfr: l.propMfr }),
        section: blank(l.section),
        description: blank(l.description),
        mfr: blank(l.propMfr),
        catalog,
        qty: l.qty ?? null,
        uom: uomOf(l.uom),
        unitPrice: l.unitCn ?? null,
        extPrice: l.totalCn ?? null,
        requestedMfr: blank(l.origMfr),
        requestedCatalog: blank(firstLine(l.origCatalog)),
        specBasis: specBasisOf(swapOutcome(l), l.notUsed),
        optionGroup: 'BASE',
        lineNote: blank(l.notes),
        sortOrder: i,
      };
    });
}

export function bidLinesFromPeerReview(items) {
  return (items || [])
    .filter((it) => blank(it.typeCode))
    .map((it, i) => {
      const l = { origMfr: it.specManufacturer, origCatalog: it.specModel, propMfr: it.propManufacturer, propCatalog: it.propModel };
      const catalog = blank(firstLine(it.propModel));
      const qty = it.qty ?? null;
      const unit = it.propUnitPrice ?? null;
      return {
        ...tagged(it.typeCode, { description: it.description, catalog, mfr: it.propManufacturer }),
        section: blank(it.section),
        description: blank(it.description),
        mfr: blank(it.propManufacturer),
        catalog,
        qty,
        uom: uomOf(it.qtyType),
        unitPrice: unit,
        extPrice: unit != null && qty != null ? Math.round(unit * qty * 100) / 100 : null,
        requestedMfr: blank(it.specManufacturer),
        requestedCatalog: blank(firstLine(it.specModel)),
        specBasis: specBasisOf(swapOutcome(l), !blank(it.propManufacturer) && !blank(it.propModel) && qty == null),
        optionGroup: 'BASE',
        lineNote: blank(it.notes),
        productId: it.propProductId || null,
        sortOrder: i,
      };
    });
}

export const PASTE_FIELDS = {
  type: /^(TYPE|TAG|FIXTURE( TYPE| TAG| MARK)?|MARK|TYPE MARK|LUMINAIRE( TYPE)?|SYMBOL)$/,
  description: /^DESC/,
  requestedMfr: /^(REQ|REQUESTED|SPEC(IFIED)?|ORIGINAL)\b.*(MFR|MANUF|BRAND)/,
  requestedCatalog: /^(REQ|REQUESTED|SPEC(IFIED)?|ORIGINAL)\b.*(CAT|PART|MODEL|SPEC)/,
  mfr: /^(OFFERED |QUOTED )?(MFR|MANUF|MANUFACTURER|BRAND|VENDOR|MAKE)/,
  catalog: /^(OFFERED |QUOTED )?(CAT|CATALOG|PART|MODEL)/,
  qty: /^(QTY|QUANTITY|QUAN)\b/,
  uom: /^(UOM|U\/M|UNIT OF|QTY TYPE)/,
  unitPrice: /^(UNIT( PRICE| COST| CN| SELL| NET)?|EACH|PRICE( EA| EACH)?|EA PRICE|SELL( PRICE)?|NET( PRICE)?)$/,
  extPrice: /^(EXT|EXTENDED|TOTAL|AMOUNT|LINE TOTAL)/,
  optionGroup: /^(OPTION|PACKAGE|GROUP|VE|ALT)/,
  lineNote: /^(NOTE|NOTES|COMMENT)/,
};
const DEFAULT_ORDER = ['type', 'qty', 'mfr', 'catalog', 'unitPrice', 'extPrice'];

/** Column index per field from a heading row (cells already trimmed). */
export function columnsOf(head) {
  const up = head.map((c) => String(c ?? '').trim().toUpperCase().replace(/[.:#]+$/, '').trim());
  const map = {};
  const used = new Set();
  for (const [f, re] of Object.entries(PASTE_FIELDS)) {
    const i = up.findIndex((h, idx) => h && !used.has(idx) && re.test(h));
    if (i >= 0) { map[f] = i; used.add(i); }
  }
  return map;
}

/** One bid line from a row, given `get(field)` that returns the cell text. */
export function lineFromCells(get, sortOrder) {
  const qty = toNumber(get('qty'));
  const unitPrice = toNumber(get('unitPrice'));
  const extPrice = toNumber(get('extPrice')) ?? (unitPrice != null && qty != null ? Math.round(unitPrice * qty * 100) / 100 : null);
  const mfr = blank(get('mfr'));
  const catalog = blank(get('catalog'));
  const requestedMfr = blank(get('requestedMfr'));
  const requestedCatalog = blank(get('requestedCatalog'));
  const swapped = requestedCatalog && catalog && requestedCatalog.toUpperCase() !== catalog.toUpperCase();
  return {
    ...tagged(get('type'), { description: get('description'), catalog, mfr }),
    description: blank(get('description')),
    mfr,
    catalog,
    qty,
    uom: uomOf(get('uom')),
    unitPrice,
    extPrice,
    requestedMfr,
    requestedCatalog,
    specBasis: qty === 0 ? 'NO_QUOTE' : swapped ? 'SUBSTITUTE' : null,
    optionGroup: optionGroupOf(get('optionGroup')),
    lineNote: blank(get('lineNote')),
    sortOrder,
  };
}

/**
 * Rows pasted from Excel (tab separated). A first row of headings maps the
 * columns; with no headings the order is Type, Qty, Mfr, Catalog, Unit, Ext.
 */
export function parsePastedLines(text) {
  const rows = String(text || '').split(/\r?\n/).map((r) => r.split('\t')).filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];
  const map = columnsOf(rows[0]);
  const hasHeader = 'type' in map && Object.keys(map).length >= 3;
  const cols = hasHeader ? map : Object.fromEntries(DEFAULT_ORDER.map((f, i) => [f, i]));
  const body = hasHeader ? rows.slice(1) : rows;
  const getter = (r) => (f) => (f in cols ? (r[cols[f]] ?? '').trim() : '');
  return body
    .filter((r) => getter(r)('type'))
    .map((r, i) => lineFromCells(getter(r), i));
}
