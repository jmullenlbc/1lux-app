/**
 * Read a competitor quote out of a spreadsheet and mark the lines a person
 * should look at (Mike 10-26, bid tool step 1). Pure: the browser hands it the
 * sheet rows; nothing here touches the database or the AI service.
 *
 *   readQuoteSheets(sheets, { fileName })  [{ name, rows }] -> the quote it found
 *   lineReasons(lines, { repQuote })       per line: what needs a look, in plain words
 *   quoteWarnings(lines, totals, info)     whole quote: sums that do not agree, expired
 *   cleanCheckedLines(lines, { repQuote }) what the server keeps after the check
 *
 * Messages follow the plain errors rule: what we saw, and what to do about it.
 */
import { columnsOf, lineFromCells } from './fromSources.js';
import { normalizeTag } from './normalizeTag.js';
import { toNumber } from '../matrixImport/readMatrix.js';
import { cents } from '../money.js';

const CORE = ['qty', 'catalog', 'mfr', 'unitPrice', 'extPrice', 'description'];
const isoDay = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null);
const cellText = (v) => (v instanceof Date ? isoDay(v) || '' : String(v ?? '').trim());
const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);

// A type tag has a digit (A1, LT-03) or is short (EM, XA, EXIT).
export const tagLike = (s) => {
  const t = String(s ?? '').trim();
  return !!t && t.split(/\s+/).length <= 2 && t.length <= 12 && (/\d/.test(t) || t.length <= 4);
};

// Words on a totals row, first match wins. SUBTOTAL is the fixture total.
const TOTAL_WORDS = [
  ['FIXTURES', /\b(SUB ?TOTAL|(FIXTURES?|LIGHTING|MATERIAL) TOTAL)\b/],
  ['FREIGHT', /\b(FREIGHT|SHIPPING|DELIVERY)\b/],
  ['WAREHOUSING', /\b(WAREHOUS\w*|STORAGE)\b/],
  ['TAX', /\bTAX\b/],
  ['CONTROLS', /\bCONTROLS?\b/],
  ['SPARES', /\bSPARES?\b/],
  ['GRAND', /\b(GRAND TOTAL|TOTAL)\b/],
];
const totalBucket = (text) => TOTAL_WORDS.find(([, re]) => re.test(text.toUpperCase()))?.[0] || null;

const INFO_LABELS = [
  ['quoteNumber', /^(QUOTE|QUOTATION|PROPOSAL|BID)\s*(#|NO\.?|NUMBER)\s*:?\s*/i],
  ['expiresAt', /^(VALID (UNTIL|THRU|THROUGH)|EXPIRES?( ON)?|EXPIRATION( DATE)?|GOOD (UNTIL|THRU|THROUGH))\s*:?\s*/i],
  ['quoteDate', /^((QUOTE|BID|PROPOSAL) )?DATE\s*:?\s*/i],
  ['projectName', /^(PROJECT|JOB)( NAME)?\s*:?\s*/i],
];

function asDay(v) {
  if (v instanceof Date) return isoDay(v);
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return isoDay(new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2]))));
  }
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** Quote number, dates and project name from the rows around the table. */
function readInfo(rows) {
  const info = {};
  let validDays = null;
  for (const row of rows) {
    row.forEach((cell, i) => {
      const text = cellText(cell);
      if (!text) return;
      const days = text.match(/\bVALID FOR (\d{1,3}) DAYS\b/i);
      if (days && validDays == null) validDays = Number(days[1]);
      for (const [key, re] of INFO_LABELS) {
        if (info[key] || !re.test(text)) continue;
        const rest = text.replace(re, '').trim();
        const nextCell = row.slice(i + 1).find((c) => cellText(c));
        const raw = rest || nextCell;
        const value = key === 'quoteDate' || key === 'expiresAt' ? asDay(raw) : cellText(raw).slice(0, 120) || null;
        if (value) info[key] = value;
        break;
      }
    });
  }
  if (!info.expiresAt && validDays && info.quoteDate) {
    const d = new Date(`${info.quoteDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + validDays);
    info.expiresAt = isoDay(d);
  }
  return info;
}

/** The company name at the top of the sheet, else the file name. */
function guessBidder(topRows, fileName) {
  for (const row of topRows.slice(0, 6)) {
    for (const cell of row) {
      const t = cellText(cell);
      if (t.length < 3 || t.length > 60 || !/[A-Za-z]{2}/.test(t) || /[:#]/.test(t) || /^\d/.test(t)) continue;
      if (INFO_LABELS.some(([, re]) => re.test(t)) || /^(QUOTE|QUOTATION|PROPOSAL|BID|TO|ATTN|PAGE)\b/i.test(t)) continue;
      return t;
    }
  }
  return String(fileName || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 120);
}

function headerAt(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const map = columnsOf(rows[i].map(cellText));
    const core = CORE.filter((f) => f in map).length;
    if (('type' in map && core >= 2) || core >= 3) return { index: i, map };
  }
  return null;
}

// "Type A1: 6 in downlight" when the quote has no type column.
const TYPE_IN_TEXT = /\bTYPE\s*:?\s*([A-Z]{0,4}[-\s]?\d+[A-Z0-9.'-]*)/i;

/** One sheet's table, or null when no heading row is found. */
export function readQuoteSheet(name, rows) {
  const head = headerAt(rows);
  if (!head) return null;
  const { map } = head;
  const lines = [];
  const totals = {};
  const notes = [];
  const outside = rows.slice(0, head.index);
  let section = null;
  let inTotals = false;
  let taxRateStated = null;

  let afterBlank = true;
  for (let r = head.index + 1; r < rows.length; r++) {
    const row = rows[r];
    const cells = row.map(cellText);
    if (!cells.some(Boolean)) { afterBlank = true; continue; }
    const wasBlank = afterBlank;
    afterBlank = false;
    const get = (f) => (f in map ? cells[map[f]] ?? '' : '');
    const again = columnsOf(cells);
    if ('type' in again && CORE.filter((f) => f in again).length >= 2) continue; // a repeated heading row

    const typeText = get('type');
    const filled = cells.filter(Boolean);
    const priced = toNumber(get('unitPrice')) != null || toNumber(get('extPrice')) != null;
    const hasQty = toNumber(get('qty')) != null;
    const rowText = filled.join(' ');
    // "Tax" or "Tax 10.1%" can sit in the type column, so only a tag with a digit
    // and no total word (A1, T10) rules a totals row out.
    const bucket = !hasQty && (!/\d/.test(typeText) || totalBucket(typeText)) ? totalBucket(rowText) : null;

    if (bucket && filled.some((c) => toNumber(c) != null)) {
      const amount = toNumber(get('extPrice')) ?? toNumber(filled.filter((c) => toNumber(c) != null).pop());
      if (amount != null && totals[bucket] == null) totals[bucket] = amount;
      const rate = bucket === 'TAX' && rowText.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
      if (rate) taxRateStated = Number(rate[1]);
      inTotals = true;
      continue;
    }
    const isLine = (hasQty || priced || (typeText && tagLike(typeText))) && !(inTotals && !typeText);
    if (!isLine) {
      // A heading like "SITE LIGHTING" sits alone after a gap; after the totals it is terms;
      // otherwise it is a second line of the row above (more description or options).
      const prev = lines[lines.length - 1];
      if (inTotals) notes.push(rowText);
      else if (filled.length === 1 && !tagLike(filled[0]) && (typeText || wasBlank || !prev || /:$/.test(filled[0]))) section = filled[0].replace(/:$/, '').slice(0, 120);
      else if (prev && !typeText) {
        if (get('description')) prev.description = `${prev.description || ''} ${get('description')}`.trim();
        if (get('catalog')) prev.catalog = `${prev.catalog || ''} ${get('catalog')}`.trim();
        continue;
      }
      outside.push(row);
      continue;
    }
    const fromText = !typeText && (get('description').match(TYPE_IN_TEXT) || get('catalog').match(TYPE_IN_TEXT));
    const line = lineFromCells((f) => (f === 'type' ? typeText || (fromText ? fromText[1] : '') : get(f)), lines.length);
    line.section = section;
    if (line.optionGroup === 'BASE' && section) {
      if (/\bVE\b|VALUE ENG/i.test(section)) line.optionGroup = 'VE';
      else if (/\bALT(ERNATE)?S?\b/i.test(section)) line.optionGroup = 'ALT';
    }
    line.sourceRow = r + 1;
    lines.push(line);
  }

  const info = readInfo(outside);
  if (taxRateStated != null) info.taxRateStated = taxRateStated;
  return { sheetName: name, headerRow: head.index + 1, lines, totals, info, notesRaw: notes.join('\n').slice(0, 20000) || null, top: rows.slice(0, head.index) };
}

/**
 * The quote in a workbook: the sheet with the most lines. Returns
 * { ok: false, message } in plain words when no table is found.
 */
export function readQuoteSheets(sheets, { fileName = '' } = {}) {
  const found = (sheets || []).map((s) => readQuoteSheet(s.name, s.rows || [])).filter((t) => t && (t.lines.length || Object.keys(t.totals).length));
  if (!found.length) {
    return { ok: false, message: 'We could not find a table of fixtures in this file, so nothing was read. Check the file has a heading row with Type, Qty and Price, or copy the table and paste it below.' };
  }
  const best = found.sort((a, b) => b.lines.length - a.lines.length)[0];
  const { top, ...rest } = best;
  return { ok: true, ...rest, bidderName: guessBidder(top, fileName), otherSheets: found.length - 1 };
}

/** Pasted rows (tab separated) through the same reader as a file. */
export function readPastedQuote(text) {
  const rows = String(text || '').split(/\r?\n/).map((r) => r.split('\t'));
  const read = readQuoteSheets([{ name: 'Pasted', rows }]);
  if (read.ok) return read;
  return { ok: false, message: 'We could not find the heading row in what you pasted, so nothing was read. Include the row with Type, Qty and Price when you copy the table.' };
}

const lineKey = (l) => `${l.typeTag}|${l.variant || ''}|${l.optionGroup || 'BASE'}`;

/**
 * What each line needs a look for. Returns one array per line of
 * { key, text, blocking }. Blocking reasons stop the bid being added.
 *
 * repQuote (Mike 10-30): a rep's quote on the RFQ tab is not a bid set side by
 * side, so a part row with no type stays, it gets picked to an RFQ line later,
 * and one type can have several part rows (housing, trim, optic).
 */
export function lineReasons(lines, { repQuote = false } = {}) {
  const priced = lines.filter((l) => l.unitPrice != null || l.extPrice != null).length >= lines.length / 2;
  const share = (f) => lines.filter((l) => l[f]).length >= lines.length / 2;
  const hasMfr = share('mfr');
  const hasCatalog = share('catalog');
  const counts = {};
  lines.forEach((l) => { if (l.typeTag) counts[lineKey(l)] = (counts[lineKey(l)] || 0) + 1; });

  return lines.map((l) => {
    const out = [];
    const add = (key, text, blocking = false) => out.push({ key, text, blocking });
    const qty = l.qty;
    if (!String(l.typeTagRaw || '').trim()) {
      if (repQuote && (l.catalog || l.description)) add('NO_TYPE', 'No fixture type on this line. Type it if you know it, or leave it and pick the RFQ line later.');
      else add('NO_TYPE', repQuote ? 'This line has no type, part number or description. Fill one in, or remove the line.' : 'No fixture type. Type it so this line lines up with the other bids, or remove the line.', true);
    } else if (!tagLike(l.typeTagRaw)) add('ODD_TYPE', 'This does not look like a fixture type. Check the type column.');
    if (qty == null) add('NO_QTY', 'No quantity. Type the quantity from the quote.');
    else if (qty === 0) add('ZERO_QTY', 'Quantity is 0, so this type counts as not quoted.');
    else if ((l.uom || 'EA') === 'EA' && !Number.isInteger(qty)) add('FRACTION', 'The quantity is not a whole number.');
    if (priced && qty && l.unitPrice == null && l.extPrice == null) add('NO_PRICE', 'No price on this line.');
    if (qty && l.unitPrice != null && l.extPrice != null && !near(qty * l.unitPrice, l.extPrice)) {
      add('MATH', `Qty times unit price is ${money(qty * l.unitPrice)}, but the line says ${money(l.extPrice)}.`);
    }
    if (hasCatalog && !l.catalog) add('NO_PART', 'No part number.');
    if (hasMfr && !l.mfr) add('NO_MAKER', 'No maker.');
    if (!repQuote && l.typeTag && counts[lineKey(l)] > 1) add('TWICE', 'This type shows up more than once. Check it is not counted twice.');
    return out;
  });
}

/** Whole quote checks: sums that do not agree, no line prices, expired. */
export function quoteWarnings(lines, totals = {}, info = {}, { today = new Date() } = {}) {
  const out = [];
  const priced = lines.filter((l) => l.unitPrice != null || l.extPrice != null).length;
  if (lines.length && priced < lines.length / 2) {
    out.push('This quote has no prices on most lines, only totals. We can compare its totals, but not type by type.');
  }
  const base = lines.filter((l) => (l.optionGroup || 'BASE') === 'BASE' && l.qty !== 0);
  const sum = base.reduce((s, l) => s + (l.extPrice ?? (l.unitPrice != null && l.qty != null ? l.unitPrice * l.qty : 0)), 0);
  const fx = toNumber(totals.FIXTURES);
  if (fx != null && priced && !near(sum, fx)) {
    out.push(`The lines add up to ${money(sum)}. The quote's fixture subtotal says ${money(fx)}. A line may be missing or read wrong.`);
  }
  const grand = toNumber(totals.GRAND);
  const parts = ['CONTROLS', 'FREIGHT', 'WAREHOUSING', 'SPARES', 'TAX'].reduce((s, k) => s + (toNumber(totals[k]) ?? 0), fx ?? (priced ? sum : 0));
  if (grand != null && parts && !near(parts, grand)) {
    out.push(`The parts add up to ${money(parts)}. The quote's total says ${money(grand)}. Check the totals below.`);
  }
  const exp = asDay(info.expiresAt);
  if (exp && exp < isoDay(today)) out.push(`This quote expired on ${exp}. Ask the bidder if the prices still stand.`);
  return out;
}

const SPEC_BASIS = new Set(['ORIGINAL', 'LISTED_ALT', 'SUBSTITUTE', 'ALLOWANCE', 'NO_QUOTE', 'NOT_USED']);
const text = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};
const amount = (v) => {
  const n = toNumber(v);
  return n == null || n < 0 ? null : n;
};

/**
 * The lines a person checked, cleaned for saving. Tags are read again on the
 * server so the browser cannot invent a grouping. Returns
 * { lines, missingType } where missingType counts lines with no type. With
 * repQuote a line with a part number or description keeps a blank type.
 */
export function cleanCheckedLines(input, { repQuote = false } = {}) {
  let missingType = 0;
  const lines = [];
  (Array.isArray(input) ? input : []).forEach((l) => {
    const raw = text(l?.typeTagRaw ?? l?.typeTag, 40);
    const description = text(l?.description, 500);
    const mfr = text(l?.mfr, 120);
    const catalog = text(l?.catalog, 200);
    if (!raw && !(repQuote && (catalog || description))) { missingType += 1; return; }
    const t = raw
      ? normalizeTag(raw, { description: description || '', catalog: catalog || '', mfr: mfr || '' })
      : { typeTag: '', variant: '', lengthFt: null };
    const qty = amount(l.qty);
    const unitPrice = amount(l.unitPrice);
    lines.push({
      typeTagRaw: raw,
      typeTag: t.typeTag,
      variant: t.variant,
      lengthFt: t.lengthFt,
      section: text(l.section, 120),
      description,
      mfr,
      catalog,
      qty,
      uom: ['EA', 'LF', 'LOT'].includes(l.uom) ? l.uom : 'EA',
      unitPrice,
      extPrice: amount(l.extPrice) ?? (unitPrice != null && qty != null ? cents(unitPrice * qty) : null),
      requestedMfr: text(l.requestedMfr, 120),
      requestedCatalog: text(l.requestedCatalog, 200),
      specBasis: qty === 0 ? 'NO_QUOTE' : SPEC_BASIS.has(l.specBasis) ? l.specBasis : null,
      optionGroup: ['BASE', 'VE', 'ALT'].includes(l.optionGroup) ? l.optionGroup : 'BASE',
      lineNote: text(l.lineNote, 1000),
      needsReview: !!l.needsReview,
      sortOrder: lines.length,
    });
  });
  return { lines, missingType };
}
