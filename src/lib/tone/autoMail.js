/**
 * Automatic mail is nobody's voice (Mike 9-30: "No bounce back reply from us
 * that is an auto-generated out of office should be uploaded into the model or
 * bot intelligence"). Out-of-office replies and calendar invites, accepts,
 * declines and updates come from a machine or a template, so they never teach
 * anyone's voice, for every person who builds one.
 *
 * autoMailReason({ subject, body, full, head, raw }) -> 'OUT_OF_OFFICE' | 'CALENDAR' | null
 *   body  the person's own words (quotes and signature cut)
 *   full  the whole readable text, when there is one (calendar footers sit at the bottom)
 *   head  the header block, raw the message body (mbox and .eml only)
 * The saved library keeps only subject and body, so those rules do most of the work.
 *
 * Pure, no imports: runs in the browser and on the server.
 */
export const AUTO_REASONS = { OUT_OF_OFFICE: 'Out of office', CALENDAR: 'Calendar invite or reply' };

const hdr = (head, name) => (String(head || '').match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'im'))?.[1] || '').trim().toLowerCase();

const OOO_SUBJECT = /^(?:re:\s*)?(?:automatic reply|auto[- ]?reply|auto[- ]?response|autoreply|out of (?:the )?office|ooo\b|away from (?:the |my )?office|on vacation|vacation (?:reply|response|notice)|annual leave)|\bout of (?:the )?office\b|\(ooo\)|\bauto[- ]?reply\b|\bautomatic reply\b/i;

// Google: "Invitation: Site walk @ Mon Oct 3, 2026 10am - 11am (EDT) (lee@x.com)".
// Outlook: "Accepted: Site walk", "Canceled: Site walk", "New Time Proposed: ...".
const CAL_SUBJECT = /^(?:(?:fw|fwd):\s*)?(?:invitation|updated invitation(?: with note)?|accepted|declined|tentative(?:ly accepted)?|canceled event(?: with note)?|cancelled event(?: with note)?|canceled|cancelled|new event|event (?:canceled|cancelled|updated)|proposed new time|new time proposed|meeting forward notification)\s*:|invitation from google calendar/i;
const GCAL_WHEN = /@ (?:mon|tue|wed|thu|fri|sat|sun)[a-z]* (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}, \d{4}/i;

const CAL_BODY = [
  /invitation from google calendar/i,
  /you are receiving this (?:courtesy )?email (?:at the account|because you are)/i,
  /forwarding this invitation could allow any recipient/i,
  /\bview all guest info\b/i,
  /\breply for [^\n]{1,80}\n?[^\n]{0,40}\b(?:yes|no|maybe)\b/i,
  /^\s*join (?:with )?google meet\b/im,
  /^\s*join zoom meeting\b/im,
  /\bmeeting id:?\s*\d{3}\s?\d{3,4}\s?\d{3,4}\b/i,
  /^\s*microsoft teams meeting\b/im,
  /\bjoin on your computer,? mobile app or room device\b/i,
  /\bclick here to join the meeting\b/i,
  /\bhas (?:accepted|declined|tentatively accepted) this invitation\b/i,
  /^\s*when:\s.+\n(?:.*\n){0,2}?\s*where:\s/im,   // Outlook invite body
];

// "I am currently out of the office" style openings that alone mean an autoreply.
const OOO_STRONG = /\b(?:this is an auto(?:mated|matic)[- ](?:reply|response|message)|auto(?:matic)?[- ]?reply|automatically generated|i(?:'m| am) currently out of (?:the )?office|thank you for your (?:e-?mail|message)[.!,]?\s+i(?:'m| am) (?:currently )?(?:out|away|on vacation|on pto|traveling|travelling))\b/i;
// Softer: an away line near the top AND a return date, limited access or an
// urgent-contact line, in a short email. Losing a real "I'm out until Monday"
// email costs one sample; keeping a template teaches the bot a template.
const OOO_LEAD = /\b(?:i am|i'm|i will be|i'll be)\s+(?:currently\s+)?(?:out of (?:the )?office|away from (?:the |my )?(?:office|desk|e-?mail)|on (?:vacation|holiday|pto|leave|annual leave|paternity leave|maternity leave))\b|\bout of (?:the )?office\b/i;
const OOO_TAIL = /\b(?:limited (?:access|ability)[^.\n]{0,30}(?:e-?mail|phone)|(?:until|through|thru|returning|return(?:ing)? (?:to the office )?on|back (?:in the office )?on|back on)\s+(?:mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d)|upon (?:my )?return|when i return|on my return|(?:respond|reply|get back to you)[^.\n]{0,40}(?:as soon as (?:possible|i can|i am back|i'm back)|when i(?:'m| am) back)|(?:for|if (?:this is|you have an?)) (?:urgent|immediate|time[- ]sensitive)[^.\n]{0,80}(?:contact|reach|call|e-?mail)|in my absence|delayed (?:response|reply)|checking (?:e-?mail|email) (?:periodically|intermittently|sporadically))/i;

export function isCalendarMail({ subject = '', body = '', full = '', head = '', raw = '' } = {}) {
  if (head) {
    if (/text\/calendar|application\/ics/i.test(hdr(head, 'Content-Type'))) return true;
    if (hdr(head, 'X-MS-Exchange-Calendar-Series-Instance-Id') || hdr(head, 'X-Google-Calendar-Content-Type')) return true;
  }
  if (raw && /^content-type:\s*(?:text\/calendar|application\/ics)|^BEGIN:VCALENDAR|name="?invite\.ics/im.test(String(raw).slice(0, 2_000_000))) return true;
  const s = String(subject || '');
  if (CAL_SUBJECT.test(s) || GCAL_WHEN.test(s)) return true;
  const t = `${full || ''}\n${body || ''}`;
  return CAL_BODY.some(re => re.test(t));
}

export function isOutOfOffice({ subject = '', body = '', head = '' } = {}) {
  if (head) {
    const auto = hdr(head, 'Auto-Submitted');
    if (auto && auto !== 'no') return true;
    if (hdr(head, 'X-Autoreply') || hdr(head, 'X-Autorespond') || hdr(head, 'X-Autoresponder')) return true;
    if (/auto_reply|autoreply/.test(hdr(head, 'Precedence'))) return true;
  }
  if (OOO_SUBJECT.test(String(subject || ''))) return true;
  const b = String(body || '');
  const lead = b.slice(0, 400);
  if (OOO_STRONG.test(lead)) return true;
  return b.length <= 700 && OOO_LEAD.test(lead) && OOO_TAIL.test(b);
}

export function autoMailReason(e = {}) {
  if (isCalendarMail(e)) return 'CALENDAR';
  if (isOutOfOffice(e)) return 'OUT_OF_OFFICE';
  return null;
}

/**
 * The saved library: the rules above, plus a template sent 3 or more times
 * (dates and numbers ignored) that opens with an away line, at any length.
 * rows: [{ id, subject, body }] -> Map(id -> reason)
 */
export function findAutoMail(rows) {
  const out = new Map();
  const shape = b => String(b || '').toLowerCase()
    .replace(/\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d+/g, '#')
    .replace(/\s+/g, ' ').trim();
  const groups = new Map();
  for (const r of rows) {
    const reason = autoMailReason({ subject: r.subject, body: r.body });
    if (reason) { out.set(r.id, reason); continue; }
    const k = shape(r.body);
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  for (const list of groups.values()) {
    if (list.length >= 3 && OOO_LEAD.test(String(list[0].body).slice(0, 400))) list.forEach(r => out.set(r.id, 'OUT_OF_OFFICE'));
  }
  return out;
}
