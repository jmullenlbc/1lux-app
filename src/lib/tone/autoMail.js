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

const OOO_SUBJECT = /^(?:re:\s*)?(?:automatic reply|auto[- ]?reply|auto[- ]?response|autoreply|out of (?:the )?office|ooo\b|away from (?:the |my )?office|on vacation|vacation (?:reply|response|notice)|annual leave)|\bout of (?:the )?office\b|\(ooo\)|\bauto[- ]?reply\b|\bautomatic reply\b|\boffice (?:is )?(?:closed|closure|closing)\b|\bclosed (?:for|on|in observance of)\b|\bholiday (?:hours|closure|schedule)\b|\bout sick\b|\bout (?:today|tomorrow|all day|of town|of pocket)\b/i;

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
const OOO_LEAD = /\b(?:i am|i'm|i will be|i'll be|i(?:'m| am) going to be|i was)\s+(?:currently\s+)?(?:out of (?:the )?office|away from (?:the |my )?(?:office|desk|e-?mail)|on (?:vacation|holiday|pto|leave|annual leave|paternity leave|maternity leave)|out(?! of (?:ideas|luck|line|the loop|stock|date|scope|budget|pocket for|our hands))\b|away\b|unavailable\b|offline\b|out sick\b)|\bout of (?:the )?office\b|\baway from (?:the |my |our )?office\b|\b(?:will be|is|are|am) (?:away|out|unavailable)\b[^.\n]{0,40}\b(?:office|studio|\d{1,2}\/\d{1,2})|\bout sick\b/i;
// "Our office will be closed Friday", "ILC is closed for Thanksgiving": a notice,
// never a sample of how Mike writes (Mike 10-1: "ILC office closed notice").
const OFFICE_CLOSED = /\b(?:office|offices|we|ilc(?: studios)?|the studio)\s+(?:is|are|will be|will remain|was|were)\s+closed\b|\boffice (?:is )?(?:closed|closure|closing)\b|\bclosed (?:for|in observance of) (?:the )?(?:holiday|holidays|thanksgiving|christmas|new year|labor day|memorial day|independence day|juneteenth|good friday|the day|the week)\b|\bholiday (?:hours|closure|schedule)\b/i;
// "Please email the following people for help": a hand-off line in an away
// note; the names under it go too (see stripAwayLines).
const AWAY_REDIRECT = /\b(?:please )?(?:e-?mail|contact|reach out to|call|text|see) (?:the|one of the|any of the|these|those) (?:following|below|people|folks|team members)\b|\b(?:contact|e-?mail|reach out to|call) [^.\n]{0,60}\bfor (?:help|assistance|anything (?:urgent|you need))\b|\bwhile i(?:'m| am) (?:out|away|gone)\b|\bduring my (?:absence|time (?:out|away))\b/i;
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
  if (OOO_STRONG.test(lead) || OFFICE_CLOSED.test(lead)) return true;
  return b.length <= 700 && OOO_LEAD.test(lead) && (OOO_TAIL.test(b) || AWAY_REDIRECT.test(b));
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

// One away or focus-time sentence inside an otherwise real email (Mike 10-1:
// "there are still out of office sentences and statements everywhere. Remove
// all from the system"). Dates alone never count: "not until Friday" is real.
const AWAY_SENTENCE = new RegExp([
  OOO_STRONG.source, OOO_LEAD.source, OFFICE_CLOSED.source, AWAY_REDIRECT.source,
  String.raw`\bfocus time\b|\bobserves company[- ]wide\b|\bas (?:we|i) (?:are|am) able\b`,
  String.raw`\blimited (?:access|ability)\b[^.\n]{0,30}(?:e-?mail|phone)|\bin my absence\b|\bupon (?:my )?return\b|\bwhen i return\b|\bon my return\b`,
  String.raw`\b(?:for|if (?:this is|you have an?)) (?:urgent|immediate|time[- ]sensitive)\b[^.\n]{0,80}(?:contact|reach|call|e-?mail)`,
  String.raw`\bdelayed (?:response|reply)\b|\bchecking (?:e-?mail|email) (?:periodically|intermittently|sporadically)\b`,
  String.raw`\bi(?:'m| am| will be|'ll be) (?:currently )?(?:traveling|travelling|on pto|on leave|offline)\b`,
].join('|'), 'i');
// Said right after an away line: "Thank you for your understanding."
const AWAY_FOLLOW = /^(?:thank you|thanks)(?: so much)? for (?:your|you're) (?:understanding|patience)[.!]?$/i;

export const isAwaySentence = s => AWAY_SENTENCE.test(String(s || ''));

// A template is away mail if its name, subject or body says so (Mike 10-1:
// an "ILC office closed notice" template got through on the body alone).
const AWAY_NAME = /out of (?:the )?office|\booo\b|away|out sick|office closed|closed notice|closure|holiday hours|auto[- ]?reply|vacation|focus time/i;
export function isAwayTemplate(t) {
  return AWAY_NAME.test(String(t?.name || '')) || isAwaySentence(t?.subject)
    || !!autoMailReason({ subject: t?.subject, body: t?.body }) || isAwaySentence(t?.body);
}

/**
 * The email with every away and focus-time sentence taken out. Wrapped lines
 * are joined first so a sentence is never cut in two. Returns the body
 * unchanged when there is nothing to take out.
 */
export function stripAwayLines(body) {
  const text = String(body || '');
  if (!AWAY_SENTENCE.test(text)) return text;
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    const prev = lines[lines.length - 1];
    if (prev && line.trim() && prev.length >= 55 && !/[.!?:]\s*$/.test(prev) && !/^\s*(?:[-*•]|\d+[.)])\s/.test(line)) {
      lines[lines.length - 1] = `${prev} ${line.trim()}`;
    } else lines.push(line);
  }
  // carry: an away sentence ran off the end of its line unfinished, so the
  // start of the next line is the rest of it.
  // listing: a "please contact the following" line was taken out, so the
  // names and emails under it, up to the next blank line, go too.
  let after = false, carry = false, listing = false;
  const kept = lines.map(line => {
    if (!line.trim()) { after = false; carry = false; listing = false; return line; }
    if (listing) return null;
    const parts = line.split(/(?<=[.!?])\s+/).filter((p, i, all) => {
      const t = p.replace(/\s+/g, ' ').trim();
      const away = (i === 0 && carry) || AWAY_SENTENCE.test(t) || (after && AWAY_FOLLOW.test(t));
      if (away && AWAY_REDIRECT.test(t)) listing = true;
      if (i === all.length - 1) carry = away && !/[.!?]$/.test(t);
      after = away;
      return !away;
    });
    return parts.length ? parts.join(' ') : null;
  }).filter(l => l !== null);
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
