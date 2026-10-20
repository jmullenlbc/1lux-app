/**
 * Peer review matrix reader (Mike 10-18). Rules only, no AI.
 *
 * Every ILC matrix uses one template: TYPE, LOCATION TAG, DESCRIPTION,
 * ORIGINAL MANUFACTURER / PRODUCT SPECIFICATION / SPEC DETAILS, QTY, QTY TYPE,
 * ILC PROPOSED MANUFACTURER / SPECIFICATION, PROPOSED UNIT DN / CN, TOTAL CN,
 * NOTES. Older files add ORIGINAL UNIT DN / CN; a few are ILC only.
 *
 * A file holds many tabs (one per bulletin or drawing set) plus RFQ TEMPLATE,
 * TAKE OFF REPORT, STANDARD PR PRODUCTS and DATA tabs. The team adds each new
 * bulletin tab on the LEFT, so the leftmost fixture tab is the newest. Mike
 * 10-18: learn only from the newest tab. `newestLines` takes each fixture type
 * from the newest tab it appears on, so a job split across tabs (units on one,
 * site on another) is not lost.
 *
 * Pure: pass the SheetJS module in (`readMatrixWorkbook(XLSX, buffer)`) or
 * hand `readMatrixSheets` plain arrays of rows.
 */

const FIELDS = {
  type: [/^TYPE$/, /^FIXTURE TYPE$/, /^TAG$/],
  location: [/LOCATION/],
  description: [/^DESCRIPTION$/],
  origMfr: [/ORIGINAL MANUFACTURER/, /^SPEC(IFIED)? MANUFACTURER/, /^BASIS OF DESIGN MANUFACTURER/],
  origCatalog: [/ORIGINAL PRODUCT SPEC/, /^ORIGINAL SPEC(IFICATION)?$/, /^SPEC(IFIED)? (PRODUCT|CATALOG)/],
  origDetails: [/ORIGINAL SPEC DETAILS/],
  qty: [/^QTY$/, /^QUANTITY$/],
  uom: [/QTY TYPE/, /^UOM$/],
  propMfr: [/(ILC )?PROPOSED MANUFACTURER/, /^ILC MANUFACTURER/],
  propCatalog: [/(ILC )?PROPOSED (PRODUCT )?SPEC/, /^ILC SPEC/],
  origUnitDn: [/ORIGINAL UNIT DN/],
  origUnitCn: [/ORIGINAL UNIT CN/],
  unitDn: [/PROPOSED UNIT DN/, /^UNIT DN$/],
  unitCn: [/PROPOSED UNIT CN/, /^UNIT CN$/, /^UNIT PRICE$/],
  totalCn: [/PROPOSED TOTAL CN/, /^TOTAL CN$/, /^EXT(ENDED)? PRICE$/],
  altChoices: [/ALT CHOICES/],
  repName: [/^SALES REP$/],
  rfqStatus: [/RFQ STATUS/],
  notes: [/^NOTES$/],
  internalNotes: [/INTERNAL NOTES/],
};

const NUMBER_FIELDS = new Set(['qty', 'origUnitDn', 'origUnitCn', 'unitDn', 'unitCn', 'totalCn']);

// Header block labels above the table (value = first filled cell to the right).
const HEADER_LABELS = {
  totalSf: /^TOTAL SF$/,
  units: /^UNITS$/,
  drawingSet: /^DRAWING SET$/,
  client: /^CLIENT$/,
  project: /^PROJECT( NAME)?$/,
  address: /^ADDRESS$/,
  date: /^DATE$/,
};

// Tabs that are never a fixture matrix, even when they carry the header.
const SKIP_TAB = /RFQ|TAKE ?OFF|STANDARD|^DATA$|TEMPLATE|\bCOUNTS?\b|BREAKDOWN|IMPORT|QUOTE DIST/i;
const COPY_TAB = /^(\w{1,3} )?COPY OF\b/i;
const VE_TAB = /\bVE\b|VALUE ENG/i;
const ORIGINAL_TAB = /ORIGINAL (SPEC|DESIGN)|RIGINAL SPEC/i;

function headerText(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v).replace(/\s+/g, ' ').trim().toUpperCase().replace(/\*+$/, '').trim();
}

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}

/** Column index per field for one row, or null when the row is not a header. */
export function mapHeader(row) {
  const hdr = (row || []).map(headerText);
  const map = {};
  const used = new Set();
  for (const [field, pats] of Object.entries(FIELDS)) {
    const i = hdr.findIndex((h, idx) => h && !used.has(idx) && pats.some((p) => p.test(h)));
    if (i >= 0) {
      map[field] = i;
      used.add(i);
    }
  }
  const isHeader = 'propMfr' in map && ('origMfr' in map || 'unitCn' in map);
  return isHeader ? map : null;
}

function readHeaderBlock(rows) {
  const out = {};
  for (const row of rows) {
    (row || []).forEach((v, i) => {
      const h = headerText(v).replace(/:$/, '');
      for (const [key, pat] of Object.entries(HEADER_LABELS)) {
        if (out[key] !== undefined || !pat.test(h)) continue;
        const next = row.slice(i + 1, i + 5).find((x) => x !== null && x !== undefined && x !== '');
        if (next !== undefined) out[key] = next instanceof Date ? next.toISOString().slice(0, 10) : next;
      }
    });
  }
  return out;
}

/** What kind of tab this is, from its name: MAIN, VE, COPY, ORIGINAL or SKIP. */
export function tabKind(name) {
  const n = String(name || '').trim();
  if (SKIP_TAB.test(n)) return 'SKIP';
  if (COPY_TAB.test(n)) return 'COPY';
  if (ORIGINAL_TAB.test(n)) return 'ORIGINAL';
  if (VE_TAB.test(n)) return 'VE';
  return 'MAIN';
}

/**
 * One tab's fixture table. Returns null when the tab has no table.
 * A row with text only in its first cells and no manufacturer or spec is a
 * section heading (UNITS, COMMON AREA); it labels the lines under it.
 */
export function readMatrixSheet(name, rows, order = 0) {
  const kind = tabKind(name);
  if (kind === 'SKIP') return null;
  let headerAt = -1;
  let map = null;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    map = mapHeader(rows[i]);
    if (map) { headerAt = i; break; }
  }
  if (!map) return null;

  const lines = [];
  let section = '';
  for (let r = headerAt + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = (f) => (f in map ? row[map[f]] : '');
    const line = {};
    for (const f of Object.keys(FIELDS)) {
      line[f] = NUMBER_FIELDS.has(f) ? toNumber(get(f)) : cellText(get(f));
    }
    const hasSpec = line.origMfr || line.origCatalog || line.propMfr || line.propCatalog;
    if (!hasSpec) {
      const words = row.map(cellText).filter(Boolean);
      if (words.length === 1 && !/^\d/.test(words[0]) && words[0].length <= 60) section = words[0].toUpperCase();
      continue;
    }
    if (/^(#REF|TYPE$)/i.test(line.type)) continue;
    if (line.totalCn === null && line.unitCn !== null && line.qty !== null) line.totalCn = line.unitCn * line.qty;
    line.section = section;
    line.rowNumber = r + 1;
    // Mike 10-18: a line with no proposal and no quantity is an item no longer used.
    line.notUsed = !line.propMfr && !line.propCatalog && line.qty === null;
    lines.push(line);
  }
  return { name, order, kind, header: readHeaderBlock(rows.slice(0, headerAt)), columns: Object.keys(map), lines };
}

/** Every fixture tab in workbook order. `sheets` = [{ name, rows }]. */
export function readMatrixSheets(sheets) {
  return sheets
    .map((s, i) => readMatrixSheet(s.name, s.rows, i))
    .filter((t) => t && t.lines.length);
}

export function readMatrixWorkbook(XLSX, buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return readMatrixSheets(
    wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true }),
    })),
  );
}

function tagKey(line) {
  return String(line.type || '').toUpperCase().replace(/[\s_-]/g, '');
}

/**
 * The newest version of every line. MAIN tabs only (copies, VE options and
 * original spec pricing tabs are left out), leftmost first; a later tab only
 * adds fixture types the newer tabs did not have. Untagged lines come from
 * the newest tab only. Falls back to COPY tabs when a file has no MAIN tab.
 */
export function newestLines(tables) {
  let pool = tables.filter((t) => t.kind === 'MAIN');
  if (!pool.length) pool = tables.filter((t) => t.kind === 'COPY');
  pool = [...pool].sort((a, b) => a.order - b.order);
  const seen = new Set();
  const out = [];
  pool.forEach((t, idx) => {
    const added = new Set();
    for (const line of t.lines) {
      const k = tagKey(line);
      if (!k) {
        if (idx === 0) out.push({ ...line, sheetName: t.name });
        continue;
      }
      if (seen.has(k)) continue;
      added.add(k);
      out.push({ ...line, sheetName: t.name });
    }
    for (const k of added) seen.add(k);
  });
  return out;
}

/** Job name from a file name: drops the extension, "(1)" copies, a date prefix and the word MATRIX. Street numbers stay. */
export function jobNameFromFile(fileName) {
  return String(fileName || '')
    .replace(/\.(xlsx|xlsm|xls)$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/_/g, ' ')
    .replace(/^\s*\d{2}\.\d{2}\.\d{2}\s+/, '') // date prefix 25.06.05_, not a street number
    .replace(/\b(PEER REVIEW )?MATRIX\b/gi, '')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
