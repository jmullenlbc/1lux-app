// RFQ wording, numbers and dates (Mike 10-29). Browser safe: the RFQ tab shows
// the same email text the PDF and the copy buttons use. Trackvia layout kept.

export const NEED_BY_HOURS = 72;

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

export function needByFrom(sentAt = new Date()) {
  return new Date(new Date(sentAt).getTime() + NEED_BY_HOURS * 3600 * 1000);
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

export function emailSubject({ number, projectName }) {
  return `ILC RFQ ${rfqNumber(number)} | ${projectName || 'Project'}`;
}

export function pdfFileName({ number, projectName }) {
  const safe = String(projectName || 'Project').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `ILC Studios RFQ ${rfqNumber(number)} ${safe}.pdf`;
}

/** Plain text email body, same words as Trackvia's template. */
export function emailBody({ number, projectName, needBy, notes, office }) {
  const phone = office?.phone || '720-248-8208';
  const mail = office?.ordersEmail || office?.pricingEmail || 'orders@ilcstudios.com';
  const lines = [
    'Hello,',
    '',
    `Attached is an RFQ request (${rfqNumber(number)}) for ${projectName || 'this project'}. Please respond within 1 business day to confirm you received it. We need pricing within ${NEED_BY_HOURS} hours${needBy ? `, by ${showDateTime(needBy)}` : ''}.`,
    '',
    'Register this project with ILC as the Designer and Distributor.',
    '',
    ...rfqNotesFor(office).map((n) => `* ${n}`),
    '',
    'Call or email us if any questions arise.',
  ];
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
