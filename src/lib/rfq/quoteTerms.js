// What a rep quote says in words, worked out by rules (Mike 11-1). Pure and browser
// safe. The AI read fills these too; the rules fill what it left blank, so spreadsheets
// and pasted quotes get the same fields. The wording comes from 20 real quotes.

const clauses = (text) => String(text ?? '').split(/\r?\n|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const clauseWith = (text, needle) => clauses(text).find((c) => c.toLowerCase().includes(needle.toLowerCase())) || needle;

const RANGE = '(\\d+(?:\\.\\d+)?)(?:\\s*(?:-|\\u2013|\\u2014|to)\\s*(\\d+(?:\\.\\d+)?))?';
const WEEKS = new RegExp(`${RANGE}\\s*(?:weeks?|wks?)\\b`, 'i');
const DAYS = new RegExp(`${RANGE}\\s*(production|business|working)?\\s*days?\\b`, 'i');
const oneDecimal = (n) => Number(n.toFixed(1));

/** "6-8 Weeks" to { min: 6, max: 8 }. In stock is 0. "25 on 3/9" has no answer, so null. */
export function leadWeeks(text) {
  const s = String(text ?? '');
  const w = s.match(WEEKS);
  if (w) return { min: Number(w[1]), max: Number(w[2] ?? w[1]) };
  const d = s.match(DAYS);
  if (d) {
    const perWeek = d[3] ? 5 : 7;
    return { min: oneDecimal(Number(d[1]) / perWeek), max: oneDecimal(Number(d[2] ?? d[1]) / perWeek) };
  }
  if (/\b(?:not|out of|no)\s+(?:in\s+)?stock\b/i.test(s)) return null;
  return /\bin[- ]stock\b|\bfrom stock\b/i.test(s) ? { min: 0, max: 0 } : null;
}

/** The sentence that gives the whole quote's lead time, as written. */
export function quoteLeadFromText(text) {
  return clauses(text).find((c) => /lead[- ]?time/i.test(c) && leadWeeks(c)) || '';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));

/** A day plus some days, in UTC so a day only date never slips. */
export function addDays(day, count) {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}

/** The day a quote runs out: a written date, else the quote date plus "valid 30 days". */
export function validUntil(text, quoteDate) {
  const s = String(text ?? '');
  const iso = s.match(/(?:expir\w*|valid (?:until|through|thru))[^\n\d]{0,20}(\d{4})-(\d{1,2})-(\d{1,2})/i);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  const named = s.match(/(?:expir\w*|valid (?:until|through|thru))[^\n\d]{0,20}?([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/i);
  const month = named ? MONTHS.indexOf(named[1].slice(0, 3).toLowerCase()) : -1;
  if (month >= 0) return `${named[3]}-${pad(month + 1)}-${pad(named[2])}`;
  const days = s.match(/(?:valid|good|firm)[^.\n]{0,40}?(\d{1,3})\s*days/i);
  return days && isDay(quoteDate) ? addDays(quoteDate, Number(days[1])) : '';
}

const FREIGHT_WORD = '(?:freight|shipping)';
const NOT_INCLUDED = [
  new RegExp(`${FREIGHT_WORD}[^.\\n]{0,30}\\bnot\\s+included\\b`, 'gi'),
  new RegExp(`\\bplus\\s+${FREIGHT_WORD}\\b`, 'gi'),
  new RegExp(`\\b(?:do|does)\\s+not\\s+include\\b[^.\\n]{0,80}${FREIGHT_WORD}`, 'gi'),
  new RegExp(`\\bexclud\\w*[^.\\n]{0,40}${FREIGHT_WORD}`, 'gi'),
  new RegExp(`${FREIGHT_WORD}[^.\\n]{0,40}\\b(?:to be determined|can be determined|tbd|billed separately|to be added)\\b`, 'gi'),
  new RegExp(`\\badditional\\s+${FREIGHT_WORD}\\b`, 'gi'),
];
const ALLOWED = [
  /\bfreight\s+allowed\b/gi,
  /\bship(?:s|ped|ping)?\s+FFA\b/gi,
  new RegExp(`\\bno\\s+charge\\s+for\\s+(?:\\w+\\s+)?${FREIGHT_WORD}\\b`, 'gi'),
  new RegExp(`\\bfree\\s+${FREIGHT_WORD}\\b`, 'gi'),
  new RegExp(`\\b${FREIGHT_WORD}\\b[^.\\n]{0,50}\\bincluded\\b`, 'gi'),
];

/** Says the quote's freight in one word: ALLOWED, NOT_INCLUDED, CONFLICT or SILENT. */
export function freightFromText(text) {
  const s = String(text ?? '');
  let rest = s;
  let no = null;
  for (const re of NOT_INCLUDED) {
    rest = rest.replace(re, (m) => { no = no || m; return ' '; }); // "freight not included" must not read as included
  }
  let yes = null;
  for (const re of ALLOWED) {
    const m = rest.match(re);
    if (m && !yes) yes = m[0];
  }
  if (yes && no) return { status: 'CONFLICT', wording: `${clauseWith(s, yes)} / ${clauseWith(s, no)}` };
  if (yes) return { status: 'ALLOWED', wording: clauseWith(s, yes) };
  if (no) return { status: 'NOT_INCLUDED', wording: clauseWith(s, no) };
  return { status: 'SILENT', wording: '' };
}

export const TERM_KINDS = {
  TARIFF: 'Tariff clause',
  NO_PARTIALS: 'No partial orders',
  DEPOSIT: 'Deposit needed',
  OVERSIZE_FREIGHT: 'Oversize freight',
  SINGLE_RELEASE: 'Freight on one shipment only',
  ACCESSORIAL: 'Accessorial fees',
};
const TERM_RULES = [
  ['TARIFF', /\btariffs?\b/i],
  ['NO_PARTIALS', /\bno\s+partials?\b|\bpartial\s+(?:shipments?|orders?|releases?)\s+(?:are\s+)?not\b/i],
  ['DEPOSIT', /\bdeposit\b|\bbalance must be received\b/i],
  ['OVERSIZE_FREIGHT', new RegExp(`\\bover\\s?siz\\w*[^.\\n]{0,40}${FREIGHT_WORD}|${FREIGHT_WORD}[^.\\n]{0,40}\\bover\\s?siz`, 'i')],
  ['SINGLE_RELEASE', /\bsingle\s+(?:release|shipment)\b/i],
  ['ACCESSORIAL', /\baccessorial\b/i],
];

/** One row per clause worth searching, in the quote's own words. */
export function termsFromText(text) {
  const seen = new Set();
  const out = [];
  for (const c of clauses(text)) {
    for (const [kind, re] of TERM_RULES) {
      const clause = c.slice(0, 400);
      const key = `${kind}|${clause.toLowerCase()}`;
      if (re.test(c) && !seen.has(key)) {
        seen.add(key);
        out.push({ kind, text: clause });
      }
    }
  }
  return out;
}

export function fobFromText(text) {
  const m = String(text ?? '').match(/\bF\.?O\.?B\.?\s*:?\s+([^.\n;]{2,60})/i);
  return m ? m[1].trim() : '';
}

export function paymentTermsFromText(text) {
  const s = String(text ?? '');
  const net = s.match(/\b(?:\d{1,2}%\s*\d{1,2}\s*,?\s*)?net\s*\d{1,3}\b/i);
  if (net) return net[0].trim();
  const named = s.match(/\b(?:payment\s+)?terms?\s*:\s*([^.\n;]{2,60})/i);
  return named ? named[1].trim() : '';
}

/** The rep's own revision words: "REV 1 : UPDATED QTY AND DIA. OF TYPE EP3 POLE". */
export function revisionNoteFromText(text) {
  const m = String(text ?? '').match(/\bREV(?:ISION)?\.?\s*\d+\b[^\n]{0,160}/i);
  return m ? m[0].trim() : '';
}

/** Fills what a read left blank from the quote's own words, so sheets and pasted quotes get the same fields. */
export function quoteFields({ quoteDate = '', expiresAt = '', paymentTerms = '', fob = '', revisionNote = '', leadTime = '', terms = [], words = '' } = {}) {
  const pick = (given, rule) => String(given ?? '').trim() || rule(words);
  const seen = new Set();
  const read = (Array.isArray(terms) ? terms : [])
    .map((t) => ({ kind: String(t?.kind || ''), text: String(t?.text || '').trim().slice(0, 400) }))
    .filter((t) => TERM_KINDS[t.kind] && t.text);
  return {
    expiresAt: isDay(expiresAt) ? expiresAt : validUntil(words, quoteDate),
    paymentTerms: pick(paymentTerms, paymentTermsFromText),
    fobPoint: pick(fob, fobFromText),
    revisionNote: pick(revisionNote, revisionNoteFromText),
    leadTime: pick(leadTime, quoteLeadFromText),
    terms: [...read, ...termsFromText(words)].filter((t) => {
      const key = `${t.kind}|${t.text.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

/** A row's lead: its own words, else the whole quote's unless the row is in stock. */
export function rowLead(l, wholeLead = '') {
  const written = String(l.leadTime || '').trim();
  const stock = String(l.stock || '').trim();
  const leadTime = written || (leadWeeks(stock) ? '' : wholeLead);
  const weeks = leadWeeks(leadTime) ?? leadWeeks(stock);
  return { leadTime: leadTime || null, leadWeeksMin: weeks?.min ?? null, leadWeeksMax: weeks?.max ?? null, stockNote: stock || null };
}
