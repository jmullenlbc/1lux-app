/**
 * Parses ILC Studios budget PDFs.
 * Extracts: grand total (with tax/freight) and the budget date.
 *
 * ILC budget format:
 *   Header:  "Budget Number  Budget Date  B0805  26.04.23"
 *   Totals:  "total $274,250"  (lowercase — product subtotal)
 *            "Total $310,588"  (uppercase T — grand total w/ tax + freight)
 *
 * We take the LARGEST dollar total found, which is always the grand total.
 */

export function parseBudgetFields(text) {
  if (!text || text.length < 20) return {};

  const flat = text.replace(/\r?\n/g, ' ');

  // ── Budget date ───────────────────────────────────────────────────────────
  // "Budget Date B0805 26.04.23" or "Budget Date 26.04.23"
  let budgetDate = null;
  const dateMatch = flat.match(/Budget\s+Date\s+(?:[A-Z0-9]+\s+)?(\d{2})\.(\d{2})\.(\d{2})/);
  if (dateMatch) {
    const y  = 2000 + parseInt(dateMatch[1]);
    const mo = parseInt(dateMatch[2]);
    const d  = parseInt(dateMatch[3]);
    budgetDate = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // ── Grand total ───────────────────────────────────────────────────────────
  // Find every occurrence of "total $X" (any case) and take the largest
  const totals = [];
  const re = /\btotal\s+\$\s*([\d,]+(?:\.\d{1,2})?)/gi;
  let m;
  while ((m = re.exec(flat)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (n >= 1_000 && n <= 50_000_000) totals.push(n);
  }
  const budgetTotal = totals.length ? Math.max(...totals) : null;

  return { budgetDate, budgetTotal };
}

/**
 * Derive a short human-readable label from the PDF filename.
 * Looks for known phase/type keywords in order of specificity.
 *
 * Examples:
 *   "26.04.23 ILC - 16W DRY CREEK IFC VE BUDGET.pdf" → "IFC VE"
 *   "25.10.17 ILC - Budget -- 16W DRY CREEK 100DD.pdf" → "100DD"
 *   "26.02.10 ILC - Budget -- 16W DRY CREEK GMP.pdf"  → "GMP"
 */
export function budgetLabelFromFilename(name) {
  const upper = name.toUpperCase().replace(/\.PDF$/i, '');
  const PHASES = [
    'IFC VE', 'IFC VE BUDGET',
    '100DD', '90DD', '60DD',
    'GMP',
    'IFC',
    'CD VE', 'CD',
    'DD VE', 'DD',
    'SD VE', 'SD',
    'CONCEPT',
  ];
  for (const p of PHASES) {
    if (upper.includes(p)) return p.replace('IFC VE BUDGET', 'IFC VE');
  }
  // Fallback: strip date prefix + common boilerplate, take up to 20 chars
  let s = name
    .replace(/^\d{2}\.\d{2}\.\d{2}\s+/,'')
    .replace(/^ILC\s*[-–]+\s*/i,'')
    .replace(/^Budget\s*[-–]+\s*/i,'')
    .replace(/\.pdf$/i,'')
    .trim();
  return s.slice(0, 20);
}

/**
 * Parse a date from the filename prefix "YY.MM.DD …"
 * Returns an ISO string or null.
 */
export function dateFromFilename(name) {
  const m = name.match(/^(\d{2})\.(\d{2})\.(\d{2})\b/);
  if (!m) return null;
  const y  = 2000 + parseInt(m[1]);
  const mo = parseInt(m[2]);
  const d  = parseInt(m[3]);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
