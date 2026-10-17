/**
 * Which emails count as "real" contact with a person.
 *
 * Mike's rule for the two Last Email fields on a person: they must ignore mass
 * emails, calendar invites and replies. A mass email is one with **25 or more
 * people on it** (Mike, 2026-09-06). What is left is a genuine one-to-one (or
 * small-group) email that somebody actually sat down and wrote, which is what
 * "when did we last really talk to them" means.
 *
 * Everything in this file is pure: no database, no network, and nothing that
 * knows Microsoft exists. That is deliberate. When the mailbox connects, the
 * only new code is the adapter that turns a provider's message into the neutral
 * shape below; these rules do not move.
 *
 * The neutral message shape:
 *   {
 *     externalId   string   the provider's own id for the message
 *     direction    'INBOUND' | 'OUTBOUND'
 *     subject      string
 *     sentAt       Date | string
 *     from         string             one address
 *     to, cc, bcc  string[]           addresses
 *     isCalendarInvite  boolean?      set it when the provider says so
 *     inReplyTo    string?            a message id, when the provider gives one
 *     conversationIndex string?       Microsoft's threading blob, when present
 *     headers      object?            lowercase header name → value
 *   }
 */

/**
 * A mass email is 25 or more people on it. Mike's number, 2026-09-06.
 *
 * This is the DEFAULT, not the law. Mike asked for it to be changeable
 * (2026-09-07: "make it changeable but set to 25"), so the number can also come
 * from an Activity Exclusion Rule of type MIN_RECIPIENTS on the Sales
 * Automation → Rules screen. `src/lib/email/settings.js` reads that rule and
 * hands the answer in here; when there is no rule, this is what applies.
 */
export const MASS_EMAIL_MIN_PEOPLE = 25;

/** Reply prefixes, including the ones non-English Outlook clients write. */
const REPLY_PREFIXES = [
  're', 'aw', 'antw', 'sv', 'vs', 'ref', 'odp', 'res', 'rif', 'r',
];

/** Forward prefixes. A forward is not a reply, but it is not a fresh email either. */
const FORWARD_PREFIXES = ['fw', 'fwd', 'wg', 'tr', 'rv', 'enc', 'vs'];

/** Subject words that give away an automatic message rather than a person. */
const AUTOMATED_SUBJECT_RE =
  /^(out of (the )?office|automatic reply|auto[-\s]?reply|undeliverable|delivery (status notification|has failed)|read:|not read:|declined:|accepted:|tentative:)/i;

/** Addresses nobody is sitting behind. */
const NOREPLY_RE = /^(no[-._]?reply|do[-._]?not[-._]?reply|donotreply|mailer[-._]?daemon|postmaster|bounces?|notifications?|automated?|alerts?)@/i;

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [value];
}

/** Lowercased, trimmed address with any "Name <addr>" wrapper removed. */
export function normalizeAddress(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

/**
 * How many distinct people were on the message, counting the sender.
 * The same address in both To and Cc is one person, not two.
 */
export function recipientCount(message) {
  const everyone = [
    message?.from,
    ...asArray(message?.to),
    ...asArray(message?.cc),
    ...asArray(message?.bcc),
  ].map(normalizeAddress).filter(Boolean);
  return new Set(everyone).size;
}

/** 25 or more people on it, unless a MIN_RECIPIENTS rule says a different number. */
export function isMassEmail(message, minPeople = MASS_EMAIL_MIN_PEOPLE) {
  return recipientCount(message) >= normalizeMinPeople(minPeople);
}

/** A usable threshold from whatever the rule row held. Junk falls back to 25. */
export function normalizeMinPeople(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 2 ? Math.floor(n) : MASS_EMAIL_MIN_PEOPLE;
}

/** Strips every stacked RE:/FW: prefix and returns the bare subject. */
export function baseSubject(subject) {
  let s = String(subject ?? '').trim();
  const all = [...REPLY_PREFIXES, ...FORWARD_PREFIXES];
  // Outlook stacks them: "RE: FW: RE: Trailhead". Peel until nothing is left.
  for (let guard = 0; guard < 20; guard += 1) {
    // Optional "[2]" counter that some clients add, then the colon.
    const m = s.match(/^\s*([A-Za-z]{1,4})\s*(\[\d+\])?\s*:\s*/);
    if (!m || !all.includes(m[1].toLowerCase())) break;
    s = s.slice(m[0].length);
  }
  return s.trim();
}

/** True when the subject line carries a reply or forward prefix. */
export function hasReplyPrefix(subject) {
  const s = String(subject ?? '').trim();
  const m = s.match(/^\s*([A-Za-z]{1,4})\s*(\[\d+\])?\s*:\s*/);
  if (!m) return false;
  const word = m[1].toLowerCase();
  return REPLY_PREFIXES.includes(word) || FORWARD_PREFIXES.includes(word);
}

/**
 * A reply, by any of the three signals a mail system can give us:
 * the subject prefix, a header pointing at the message being answered, or
 * Microsoft's conversation index having grown past its first entry.
 */
export function isReply(message) {
  if (!message) return false;
  if (message.inReplyTo) return true;
  const headers = message.headers || {};
  if (headers['in-reply-to']) return true;
  if (headers.references) return true;
  // Microsoft's conversationIndex is 22 bytes for the first message in a thread
  // and 5 bytes longer for every reply after it. Base64, so 22 bytes is 32 chars.
  if (typeof message.conversationIndex === 'string' && message.conversationIndex.length > 32) return true;
  return hasReplyPrefix(message.subject);
}

/** A meeting request, acceptance, cancellation or any other calendar traffic. */
export function isCalendarInvite(message) {
  if (!message) return false;
  if (message.isCalendarInvite === true) return true;
  // Microsoft sets a message class on calendar items.
  const cls = String(message.messageClass ?? message.headers?.['x-microsoft-classified'] ?? '');
  if (/^IPM\.Schedule\./i.test(cls)) return true;
  const contentType = String(message.headers?.['content-type'] ?? '');
  if (/text\/calendar/i.test(contentType)) return true;
  if (/(^|;)\s*method=(request|cancel|reply|counter)/i.test(contentType)) return true;
  const subject = String(message.subject ?? '');
  if (/^(invitation|canceled|cancelled|updated invitation|meeting (request|forward notification)):/i.test(subject.trim())) return true;
  return false;
}

/** An out-of-office, a bounce, a read receipt, a machine, not a person. */
export function isAutomated(message) {
  if (!message) return false;
  const headers = message.headers || {};
  if (headers['auto-submitted'] && String(headers['auto-submitted']).toLowerCase() !== 'no') return true;
  if (headers['x-autoreply'] || headers['x-autorespond']) return true;
  if (headers['precedence'] && /^(bulk|junk|list|auto_reply)$/i.test(String(headers['precedence']))) return true;
  if (headers['list-unsubscribe']) return true;              // a marketing blast
  if (NOREPLY_RE.test(normalizeAddress(message.from))) return true;
  return AUTOMATED_SUBJECT_RE.test(String(message.subject ?? '').trim());
}

/**
 * The whole decision for one message.
 *
 * `counts` is what drives the two Last Email fields on a person. When it is
 * false, `reasons` says why in words, so a person looking at the screen can be
 * told "we have emailed them, but only on mass sends" instead of nothing.
 *
 * Every message is still STORED. Only the two dates are filtered, otherwise we
 * could never change our minds about a rule without re-syncing the mailbox.
 */
export function classifyEmail(message, { massEmailMinPeople = MASS_EMAIL_MIN_PEOPLE } = {}) {
  const minPeople = normalizeMinPeople(massEmailMinPeople);
  const reasons = [];
  if (isMassEmail(message, minPeople)) reasons.push('mass email');
  if (isCalendarInvite(message))       reasons.push('calendar invite');
  if (isReply(message))                reasons.push('reply');
  if (isAutomated(message))            reasons.push('automated');

  return {
    counts:          reasons.length === 0,
    reasons,
    people:          recipientCount(message),
    minPeople,
    massEmail:       reasons.includes('mass email'),
    calendarInvite:  reasons.includes('calendar invite'),
    reply:           reasons.includes('reply'),
    automated:       reasons.includes('automated'),
  };
}

/** Plain-English version of why an email did not count, for the screen. */
export function skipReasonLabel(reasons = [], minPeople = MASS_EMAIL_MIN_PEOPLE) {
  if (!reasons.length) return '';
  const words = {
    'mass email':      `sent to ${normalizeMinPeople(minPeople)} or more people`,
    'calendar invite': 'a calendar invite',
    'reply':           'a reply, not a fresh email',
    'automated':       'an automatic message',
  };
  return reasons.map(r => words[r] || r).join(', ');
}
