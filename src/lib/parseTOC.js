/**
 * parseTOC.js
 *
 * Parses a submittal PDF text to extract a fixture-schedule table of contents.
 * Recognises type codes like: D1, SP1, EL1-P, WP1-A, L-1, EX-1A, etc.
 *
 * Returns an array of { typeCode, description } objects, sorted by first
 * appearance in the document.
 */

// TYPE_CODE pattern: 1-6 chars, uppercase/digit, optional dash + more chars
// Examples: D1, D1A, SP1, EL1-P, WP-1, L-1, EX-1A, A-1, EMG1
const TYPE_RE = /^([A-Z]{1,3}[-]?[0-9]{0,3}[A-Z]{0,2})\s*[-–—:|\t]\s*(.+)/;

// Also match "TYPE CODE SPACE DESCRIPTION" where code ends at first space
const TYPE_RE2 = /^([A-Z]{1,3}[0-9]{1,3}[A-Z]?)\s{2,}(.+)/;

// Skip words that look like section headers / noise
const SKIP_WORDS = new Set([
  'table', 'of', 'contents', 'fixture', 'schedule', 'submittal', 'description',
  'type', 'manufacturer', 'model', 'part', 'qty', 'quantity', 'location',
  'section', 'spec', 'specification', 'product', 'notes', 'note', 'total',
  'date', 'project', 'submitted', 'page', 'sheet', 'revision', 'rev',
  'drawing', 'number', 'issue', 'prepared', 'approved', 'reviewed',
]);

function isNoise(line) {
  const lower = line.toLowerCase().trim();
  // Pure numbers/dates/URLs
  if (/^[\d./:@\-\s]+$/.test(lower)) return true;
  // Very short
  if (lower.length < 3) return true;
  // Contains no letter
  if (!/[a-z]/i.test(lower)) return true;
  return false;
}

/**
 * Parse text content (from PDF extraction) into TOC items.
 * @param {string} text — raw text from PDF
 * @returns {{ typeCode: string, description: string }[]}
 */
export function parseTOCFromText(text) {
  const lines  = text.split(/\n|\r\n/).map(l => l.trim()).filter(l => l.length > 0);
  const items  = [];
  const seen   = new Set();

  for (const line of lines) {
    if (isNoise(line)) continue;

    let code = null, desc = null;

    // Try primary pattern
    let m = line.match(TYPE_RE);
    if (m) { code = m[1]; desc = m[2].trim(); }

    // Try secondary pattern (two+ spaces as delimiter)
    if (!m) {
      m = line.match(TYPE_RE2);
      if (m) { code = m[1]; desc = m[2].trim(); }
    }

    if (!code || !desc) continue;

    // Skip if code looks like a common word
    if (SKIP_WORDS.has(code.toLowerCase())) continue;

    // Skip if description is just numbers / dates
    if (isNoise(desc)) continue;

    // Skip if description is too long to be a type label (probably a full sentence)
    if (desc.length > 120) continue;

    // Deduplicate by type code
    const codeKey = code.toUpperCase();
    if (seen.has(codeKey)) continue;
    seen.add(codeKey);

    items.push({ typeCode: code, description: desc });
  }

  return items;
}

/**
 * Parse buffer (PDF) into TOC items using pdfjs.
 * @param {Buffer} buffer
 * @returns {Promise<{ typeCode: string, description: string }[]>}
 */
export async function parseTOCFromBuffer(buffer) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const uint8    = new Uint8Array(buffer);
    const doc      = await pdfjsLib.getDocument({ data: uint8 }).promise;

    let text = '';
    // Only scan the first 8 pages — TOC is almost always at the front
    const maxPages = Math.min(doc.numPages, 8);
    for (let i = 1; i <= maxPages; i++) {
      const page    = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }

    return parseTOCFromText(text.trim());
  } catch (err) {
    console.error('[parseTOC] error:', err?.message);
    return [];
  }
}
