import '@/lib/pdfPolyfill';
import { loadPdfjs } from './pdfjsNode.js';
/**
 * parseTOC.js
 *
 * Parses a submittal PDF to extract fixture type codes + descriptions.
 * Handles two common formats:
 *   1. "TypeCode  Description" with whitespace/separator between columns
 *   2. "TypeCode\tManufacturer\tModel\tPage" — tab-separated rows produced
 *      by the Y-position-aware extractor (parseTOCFromBuffer)
 *
 * Returns an array of { typeCode, description } objects.
 */

// ── Type-code regex ──────────────────────────────────────────────────────────
// Requires AT LEAST ONE DIGIT in the base part to avoid matching model-number
// fragments like "V-CA48-X3-DM01" or product acronyms like "BABA".
// Matches: SP1, D1, EL1-P, V2-L, W10, PS1, EB1, A3, EX-1A, etc.
const CODE_PAT = '[A-Z]{1,4}[0-9]{1,3}(?:[-][A-Z0-9]{1,4})?';

// Pattern 1: TypeCode followed by separator (dash, colon, pipe) then description
const TYPE_RE      = new RegExp(`^(${CODE_PAT})\\s*[-–—:|]\\s*(.+)`);

// Pattern 2: TypeCode + 2+ spaces (column-aligned plain text)
const TYPE_RE2     = new RegExp(`^(${CODE_PAT})\\s{2,}(.+)`);

// Pattern 3: Tab-separated — TypeCode TAB Manufacturer (TAB more columns...)
// Used when parseTOCFromBuffer reconstructs rows using Y-position grouping.
// Description = manufacturer name (first column after type code).
const TYPE_RE_TAB  = new RegExp(`^(${CODE_PAT})\t([^\t\\d][^\t]*)`);

// Words that look like table headers / noise
const SKIP_WORDS = new Set([
  'table', 'of', 'contents', 'fixture', 'schedule', 'submittal', 'description',
  'type', 'manufacturer', 'model', 'part', 'qty', 'quantity', 'location',
  'section', 'spec', 'specification', 'product', 'notes', 'note', 'total',
  'date', 'project', 'submitted', 'page', 'sheet', 'revision', 'rev',
  'drawing', 'number', 'issue', 'prepared', 'approved', 'reviewed',
  'resubmit', 'continued', 'number', 'datasheet', 'datasheets',
]);

function isNoise(str) {
  const s = str.trim();
  if (s.length < 2)                     return true;
  if (/^[\d./:@\-\s]+$/.test(s))        return true; // pure numbers/dates
  if (!/[a-zA-Z]/.test(s))              return true; // no letters
  return false;
}

/**
 * Parse text into TOC items.
 * Handles both newline-separated and tab-separated row formats.
 *
 * @param {string} text
 * @returns {{ typeCode: string, description: string }[]}
 */
export function parseTOCFromText(text) {
  const lines = text.split(/\n|\r\n/).map(l => l.trim()).filter(l => l.length > 0);
  const items  = [];
  const seen   = new Set();

  for (const line of lines) {
    // Stop when we hit the Notes Summary or raw datasheet content — past the TOC
    if (/^notes?\s+summary$/i.test(line)) break;

    if (isNoise(line)) continue;

    let code = null, desc = null;

    // Tab-separated first (strongest signal — from Y-position extraction)
    let m = line.match(TYPE_RE_TAB);
    if (m) {
      code = m[1];
      // Strip trailing page number from description (e.g. "HOLOPHANE 2" → "HOLOPHANE")
      desc = m[2].trim().replace(/\s+\d{1,4}\s*$/, '').trim();
    }

    // Primary: separator between code and description
    if (!code) {
      m = line.match(TYPE_RE);
      if (m) { code = m[1]; desc = m[2].trim(); }
    }

    // Secondary: two-or-more spaces as column separator
    if (!code) {
      m = line.match(TYPE_RE2);
      if (m) { code = m[1]; desc = m[2].trim(); }
    }

    if (!code || !desc) continue;

    const lower = code.toLowerCase();
    if (SKIP_WORDS.has(lower))                 continue;
    if (isNoise(desc))                         continue;
    if (desc.length > 120)                     continue;
    // Skip datasheet bullet points and product spec sentences
    if (/^[•·●▪\-]/.test(desc))               continue;

    // Strip any trailing page number from desc (e.g. "Linear Strip  15")
    desc = desc.replace(/\s+\d{1,4}$/, '').trim();
    if (!desc || isNoise(desc))      continue;

    const key = code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({ typeCode: code, description: desc });
  }

  return items;
}

/**
 * Extract text from PDF buffer using Y-position-aware grouping so that
 * table rows come out as tab-separated strings on individual lines —
 * rather than the naive join(' ') which smashes everything onto one line.
 *
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
export async function extractTOCText(buffer) {
  const pdfjsLib = await loadPdfjs();
  const uint8    = new Uint8Array(buffer);
  const doc      = await pdfjsLib.getDocument({ data: uint8 }).promise;

  let text = '';
  // TOC is almost always in the first 8 pages
  const maxPages = Math.min(doc.numPages, 8);

  for (let i = 1; i <= maxPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();

    // Group items by rounded Y position → reconstructs table rows
    // Round to nearest 4 PDF units (~2 pt) to absorb minor vertical offsets
    const lineMap = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 4) * 4;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], str: item.str.trim() });
    }

    // Sort rows top → bottom (PDF Y increases upward, so higher Y = higher on page)
    const rows = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, cells]) =>
        cells
          .sort((a, b) => a.x - b.x)
          .map(c => c.str)
          .join('\t')
      )
      .filter(r => r.trim());

    text += rows.join('\n') + '\n';
  }

  return text.trim();
}

/**
 * Parse a PDF buffer into TOC items.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{ typeCode: string, description: string }[]>}
 */
export async function parseTOCFromBuffer(buffer) {
  try {
    const text = await extractTOCText(buffer);
    return parseTOCFromText(text);
  } catch (err) {
    console.error('[parseTOC] error:', err?.message);
    return [];
  }
}
