/**
 * Extracts contract value and signed date from raw PDF text.
 * Handles AIA contracts, design agreements, and supply/purchase orders.
 * Returns { contractValue: number|null, contractSignedDate: 'YYYY-MM-DD'|null }
 */

const MONTH_MAP = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
};

function parseMonth(str) {
  return MONTH_MAP[str.toLowerCase()] ?? null;
}

function pad(n) { return String(n).padStart(2, '0'); }

function toIso(year, month, day) {
  const y = parseInt(year), m = parseInt(month), d = parseInt(day);
  if (!y || !m || !d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// ── Dollar value extraction ────────────────────────────────────────────────

const MONTH_RE = '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)';
const DOLLAR_RE = /\$\s*([\d,]+(?:\.\d{1,2})?)/i;

// Ordered by specificity, first match wins
const VALUE_PATTERNS = [
  // "Contract Sum ... $X" (AIA B101)
  /contract\s+sum[^$\n]{0,80}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Total Contract Amount / Price / Value ... $X"
  /total\s+contract\s+(?:amount|price|value|fee)[^$\n]{0,60}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Contract Amount / Price / Value ... $X"
  /contract\s+(?:amount|price|value)[^$\n]{0,60}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Grand Total   $X" (purchase orders, SOVs)
  /grand\s+total[^$]{0,30}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Order Total / PO Total ... $X"
  /(?:order|po|purchase\s+order)\s+total[^$]{0,30}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Total Fee ... $X"
  /total\s+(?:design\s+)?fee[^$\n]{0,60}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "for the sum of $X"
  /for\s+the\s+sum\s+of\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "sum of $X"
  /sum\s+of\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Lump Sum: $X"
  /lump\s+sum\s*:?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Total: $X" on its own line (purchase orders)
  /^total\s*:?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/im,
  // "TOTAL $X" (any casing, standalone)
  /\btotal\b\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Compensation ... $X"
  /compensation[^$\n]{0,80}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "$X ... total" (value before keyword)
  /\$\s*([\d,]+(?:\.\d{1,2})?)[^$\n]{0,40}(?:total|lump\s+sum|contract\s+(?:sum|amount|price))/i,
];

function extractValue(text) {
  const flat = text.replace(/\r?\n/g, ' ');
  for (const pattern of VALUE_PATTERNS) {
    const m = flat.match(pattern);
    if (m) {
      const num = parseFloat(m[1].replace(/,/g, ''));
      // Sanity: contract values are typically $1,000 to $50,000,000
      if (num >= 1000 && num <= 50_000_000) return num;
    }
  }
  return null;
}

// ── Date extraction ────────────────────────────────────────────────────────

const DATE_PATTERNS = [
  // "as of the 15th day of January, 2026" / "as of January 15, 2026"
  {
    re: new RegExp(`as\\s+of\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+day\\s+of\\s+(${MONTH_RE})\\s*,?\\s*(\\d{4})`, 'i'),
    fn: m => toIso(m[3], parseMonth(m[2]), m[1]),
  },
  {
    re: new RegExp(`as\\s+of\\s+(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,\\s*(\\d{4})`, 'i'),
    fn: m => toIso(m[3], parseMonth(m[1]), m[2]),
  },
  // "dated the 15th day of January 2026" / "dated January 15, 2026"
  {
    re: new RegExp(`dated[^,\\n]{0,30}(\\d{1,2})(?:st|nd|rd|th)?\\s+day\\s+of\\s+(${MONTH_RE})\\s*,?\\s*(\\d{4})`, 'i'),
    fn: m => toIso(m[3], parseMonth(m[2]), m[1]),
  },
  {
    re: new RegExp(`dated[^,\\n]{0,40}(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`, 'i'),
    fn: m => toIso(m[3], parseMonth(m[1]), m[2]),
  },
  // "this Agreement is made ... [Month] [Day], [Year]"
  {
    re: new RegExp(`(?:this\\s+agreement\\s+is\\s+(?:made|entered)[^.]{0,60})(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,\\s*(\\d{4})`, 'i'),
    fn: m => toIso(m[3], parseMonth(m[1]), m[2]),
  },
  // "Effective Date: January 15, 2026" / "Agreement Date: ..."
  {
    re: new RegExp(`(?:effective|agreement|contract|execution|execution)\\s+date\\s*:?\\s*(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`, 'i'),
    fn: m => toIso(m[3], parseMonth(m[1]), m[2]),
  },
  // "Date: 01/15/2026" or "Date: 1/15/2026"
  {
    re: /(?:effective\s+)?date\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
    fn: m => toIso(m[3], m[1], m[2]),
  },
  // "executed as of / on January 15, 2026"
  {
    re: new RegExp(`executed\\s+(?:as\\s+of|on)\\s+(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`, 'i'),
    fn: m => toIso(m[3], parseMonth(m[1]), m[2]),
  },
  // ISO date near keyword: "signed: 2026-01-15"
  {
    re: /(?:date|signed|executed)\s*:?\s*(\d{4})-(\d{2})-(\d{2})/i,
    fn: m => toIso(m[1], m[2], m[3]),
  },
  // Standalone "Month Day, Year" near top of doc (first 2000 chars), fallback
  {
    re: new RegExp(`(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,\\s*(\\d{4})`,'i'),
    fn: m => toIso(m[3], parseMonth(m[1]), m[2]),
    topOnly: true,
  },
];

function extractDate(text) {
  const flat  = text.replace(/\r?\n/g, ' ');
  const top   = flat.slice(0, 3000); // first ~3000 chars for top-of-doc patterns

  for (const { re, fn, topOnly } of DATE_PATTERNS) {
    const m = (topOnly ? top : flat).match(re);
    if (m) {
      const iso = fn(m);
      if (iso) {
        const year = parseInt(iso.split('-')[0]);
        if (year >= 2010 && year <= 2040) return iso;
      }
    }
  }
  return null;
}

// ── Change Order amount (ILC pricing sheet format) ─────────────────────────
// Handles negative amounts (credits/deductions) and ILC-specific labels.

function toSigned(sign, numStr) {
  const n = parseFloat(numStr.replace(/,/g, ''));
  return sign === '-' ? -n : n;
}

export function parseChangeOrderAmount(text) {
  if (!text || text.length < 10) return null;
  const flat = text.replace(/\r?\n/g, ' ');

  // "TOTAL CHANGE -$X" or "TOTAL CHANGE $X" (ILC line-item CO, most specific)
  let m = flat.match(/\btotal\s+change\s+(-?)\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (m) return toSigned(m[1], m[2]);

  // "TOTAL -$X" or "TOTAL $X" (ILC summary line, immediately after WAREHOUSING)
  m = flat.match(/\btotal\s+(-?)\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (m) return toSigned(m[1], m[2]);

  // "TOTAL [WORDS] $X", e.g. "TOTAL SALES TAX INCREASE $4,521.81"
  m = flat.match(/\btotal\s+(?:[a-zA-Z]+\s+){1,6}\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));

  // Fall back to standard contract value patterns (positive only)
  const v = extractValue(flat);
  return v;
}

// ── COI expiry date extraction ────────────────────────────────────────────
// Looks for "expiration date", "expires", "policy period" end-date patterns.

const COI_EXPIRY_PATTERNS = [
  // "Expiration Date: 01/15/2026"
  {
    re: /expir(?:ation|y|es?)\s*(?:date)?\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,
    fn: m => { const yr = m[3].length === 2 ? '20' + m[3] : m[3]; return toIso(yr, m[1], m[2]); },
  },
  // "Expiration Date: January 15, 2026"
  {
    re: new RegExp(`expir(?:ation|y|es?)\\s*(?:date)?\\s*:?\\s*(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`, 'i'),
    fn: m => toIso(m[3], parseMonth(m[1]), m[2]),
  },
  // "Policy Period: 01/01/2025 to 01/01/2026", take the TO date
  {
    re: /policy\s+period[^:]{0,20}:?\s*[\d\/]+\s+to\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,
    fn: m => { const yr = m[3].length === 2 ? '20' + m[3] : m[3]; return toIso(yr, m[1], m[2]); },
  },
  // "Cert. Exp. Date" or similar
  {
    re: /cert(?:ificate)?\s*exp(?:iry|iration)?\s*(?:date)?\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,
    fn: m => { const yr = m[3].length === 2 ? '20' + m[3] : m[3]; return toIso(yr, m[1], m[2]); },
  },
];

function extractCOIExpiry(text) {
  const flat = text.replace(/\r?\n/g, ' ');
  for (const { re, fn } of COI_EXPIRY_PATTERNS) {
    const m = flat.match(re);
    if (m) {
      const iso = fn(m);
      if (iso) {
        const year = parseInt(iso.split('-')[0]);
        if (year >= 2020 && year <= 2040) return iso;
      }
    }
  }
  return null;
}

export function parseCOIFields(text) {
  if (!text || text.length < 20) return {};
  return { expiryDate: extractCOIExpiry(text) };
}

// ── Public API ─────────────────────────────────────────────────────────────

export function parseContractFields(text) {
  if (!text || text.length < 20) return {};
  return {
    contractValue:      extractValue(text),
    contractSignedDate: extractDate(text),
  };
}
