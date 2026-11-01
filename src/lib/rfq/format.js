// RFQ wording, numbers and dates (Mike 10-29). Browser safe: the RFQ tab shows
// the same email text the PDF and the copy buttons use. Trackvia layout kept.

export const NEED_BY_BUSINESS_DAYS = 3; // Mike 10-29: business days, weekends and holidays skipped

const DAY_MS = 24 * 3600 * 1000;
const dayIn = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', weekday: 'short' });
const ymdIn = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' });
const isWeekend = (d) => ['Sat', 'Sun'].includes(dayIn.format(d));

// Office holidays, observed: a Saturday holiday is taken Friday, a Sunday one Monday.
export const HOLIDAY_NAMES = ["New Year's Day", 'Memorial Day', 'Independence Day', 'Labor Day', 'Thanksgiving', 'Day after Thanksgiving', 'Christmas Day'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => { const x = new Date(Date.UTC(y, m - 1, d)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
const nthWeekday = (y, m, wd, n) => 1 + ((wd - new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7;
const lastWeekday = (y, m, wd) => { const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return last - ((new Date(Date.UTC(y, m - 1, last)).getUTCDay() - wd + 7) % 7); };
const observed = (y, m, d) => { const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return ymd(y, m, d + (wd === 6 ? -1 : wd === 0 ? 1 : 0)); };
const holidayCache = new Map();
/** The observed holiday dates (YYYY-MM-DD) of year y. */
export function holidaysOf(y) {
  if (!holidayCache.has(y)) {
    const thanks = nthWeekday(y, 11, 4, 4);
    holidayCache.set(y, [
      observed(y, 1, 1), ymd(y, 5, lastWeekday(y, 5, 1)), observed(y, 7, 4), ymd(y, 9, nthWeekday(y, 9, 1, 1)),
      ymd(y, 11, thanks), ymd(y, 11, thanks + 1), observed(y, 12, 25),
    ]);
  }
  return holidayCache.get(y);
}
// Next year too: New Year's on a Saturday is taken Dec 31.
export const isHoliday = (d) => { const s = ymdIn.format(d); const y = Number(s.slice(0, 4)); return holidaysOf(y).includes(s) || holidaysOf(y + 1).includes(s); };

export const DEFAULT_COMPANY = 'Innovative Lighting Consultants dba ILC Studios';

export const DEFAULT_RFQ_NOTES = [
  'Please provide unit pricing for each item.',
  'Show the TYPE on each item so we can match it to our schedule.',
  'Include freight to the jobsite, or list it as a separate line.',
  'Quote controls commissioning as a separate line.',
];

/** 1 -> RFQ0001. */
export function rfqNumber(n) {
  return `RFQ${String(n ?? 0).padStart(4, '0')}`;
}

/** A rep's RFQ and its version: RFQ0041 V3. The first send is plain RFQ0041. */
export function rfqLabel({ number, familyNumber, version } = {}) {
  const base = rfqNumber(familyNumber ?? number);
  return version > 1 ? `${base} V${version}` : base;
}

/** A drawing submission on the job: Round 3 GMP. */
export const roundLabel = (r) => (r ? [`Round ${r.number}`, String(r.name || '').trim()].filter(Boolean).join(' ') : '');

/** Brand names compared loosely: Lithonia Lighting, Inc. and LITHONIA are one. */
export const normName = (s) => String(s || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, ' ').replace(/\b(INC|LLC|CO|CORP|CORPORATION|LIGHTING|LTG)\b/g, ' ').replace(/\s+/g, ' ').trim();

// Same time of day, 3 business days later (Denver calendar). Weekends and
// office holidays don't count; sent on one, the count starts the next workday.
export function needByFrom(sentAt = new Date()) {
  let t = new Date(sentAt).getTime();
  for (let left = NEED_BY_BUSINESS_DAYS; left > 0;) {
    t += DAY_MS;
    if (!isWeekend(new Date(t)) && !isHoliday(new Date(t))) left -= 1;
  }
  return new Date(t);
}

export function showDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function showDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The office's bullets, one per line; blank uses the standard four. */
export function rfqNotesFor(office) {
  const own = String(office?.rfqNotes || '').split('\n').map((s) => s.trim()).filter(Boolean);
  return own.length ? own : DEFAULT_RFQ_NOTES;
}

export function officeAddress(office) {
  if (!office) return '';
  const cityLine = [office.city, [office.state, office.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [office.street, cityLine].filter(Boolean).join(', ');
}

export function emailSubject({ number, familyNumber, version, projectName }) {
  return `ILC RFQ ${rfqLabel({ number, familyNumber, version })} | ${projectName || 'Project'}`;
}

export function pdfFileName({ number, familyNumber, version, projectName }) {
  const safe = String(projectName || 'Project').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `ILC Studios RFQ ${rfqLabel({ number, familyNumber, version })} ${safe}.pdf`;
}

/** Plain text email body, same words as Trackvia's template. */
export function emailBody({ number, familyNumber, version, projectName, needBy, notes, office, changes = [] }) {
  const phone = office?.phone || '720-248-8208';
  const mail = office?.ordersEmail || office?.pricingEmail || 'orders@ilcstudios.com';
  const lines = [
    'Hello,',
    '',
    `Attached is an RFQ request (${rfqLabel({ number, familyNumber, version })}) for ${projectName || 'this project'}. Please respond within 1 business day to confirm you received it. We need pricing within ${NEED_BY_BUSINESS_DAYS} business days${needBy ? `, by ${showDateTime(needBy)}` : ''}.`,
    '',
    'Register this project with ILC as the Designer and Distributor.',
    '',
    ...rfqNotesFor(office).map((n) => `* ${n}`),
    '',
    'Call or email us if any questions arise.',
  ];
  if (changes.length) lines.push('', 'Changes since the last version:', ...changes.map((c) => `* ${c.text}`));
  if (String(notes || '').trim()) lines.push('', 'Project Manager Comments:', String(notes).trim());
  lines.push('', 'Thank you!', 'ILC Studios', `${mail} | ${phone}`);
  return lines.join('\n');
}

/** A Gmail compose link with To, Subject and Body filled in. The PDF still has to be attached by hand. */
export function gmailComposeUrl({ to, subject, body }) {
  const p = new URLSearchParams({ view: 'cm', fs: '1', to: to || '', su: subject || '', body: body || '' });
  return `https://mail.google.com/mail/?${p.toString()}`;
}

export const LINE_STATUS = { NONE: '', DRAFT: 'Draft', SENT: 'Sent', RECEIVED: 'Received' };
