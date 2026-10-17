/**
 * How a bot email reads and signs off (Mike 9-26).
 *
 *  - stripDashes: no em dash, en dash or double dash in anything the bot
 *    writes, ever. The prompt says so too; this is the backstop.
 *  - toneSection: the salesperson's own voice, from the tone profile built on
 *    their Profile page (sent-mail upload), so the email sounds like them.
 *  - signatureBlock: one company layout, name / title / email / cell swapped
 *    in per person.
 *  - hasBullets: every recap and check-in carries its next steps as bullets.
 *
 * Pure: no imports, safe anywhere.
 */

/**
 * One line for every AI prompt that writes prose a person reads. Streaming
 * replies (the chat boxes) cannot be cleaned after the fact, so they get this.
 */
export const NO_DASHES_RULE = '\n\nWriting style: never use em dashes, en dashes or double hyphens. Use a comma, a colon or a new sentence instead. Write number ranges as "2 to 3".';

/** Replace every em dash, en dash and double dash with plain punctuation. */
export function stripDashes(text) {
  if (text == null) return text;
  return String(text)
    .replace(/^[ \t]*(?:—|–|--)[ \t]*/gm, '')         // leading dash on a line
    .replace(/(\d)[ \t]*[–—][ \t]*(\d)/g, '$1-$2')    // ranges: 2–3 → 2-3
    .replace(/[ \t]*(?:—|–|--)[ \t]*$/gm, '')          // trailing dash on a line
    .replace(/[ \t]*(?:—|–|--)[ \t]*/g, ', ')          // mid-sentence → comma
    .replace(/,[ \t]*([,.!?;:])/g, '$1');                        // ", ." → "." (keeps "Hi Lee," and "Best,")
}

/** A bullet line: "•", "-", "*" or "1." at the start. */
export function hasBullets(body) {
  return /^[ \t]*(?:[•*-]|\d+[.)])[ \t]+\S/m.test(String(body || ''));
}

export const firstName = name => String(name || '').trim().split(/\s+/)[0] || '';

/** 8579980556 / (857) 998-0556 / +1 857 998 0556 → 857.998.0556 */
export function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}` : String(raw || '').trim();
}

/** The layout used until an admin saves one (Mike's Gmail signature, 9-26). */
export const DEFAULT_SIGNATURE_TEMPLATE = '{name}\n{title}\n{email}\nc: {phone}\no: {office}';
export const SIGNATURE_FIELDS = ['name', 'first', 'title', 'email', 'phone', 'office'];

/** 7202488208 + "103" → 720.248.8208 ext 103; blank without a number (the line is optional). */
export function officeLine(phone, ext) {
  if (!String(phone || '').trim()) return '';
  const e = String(ext || '').replace(/^\s*(ext\.?|x)\s*/i, '').trim();
  return `${formatPhone(phone)}${e ? ` ext ${e}` : ''}`;
}

/**
 * The company signature template, filled in for one person. A line whose
 * placeholders are all blank is dropped, so "c: {phone}" vanishes for someone
 * with no phone. `user.signatureTemplate` overrides the default layout.
 * `user.signatureName` is the name as the person wants it printed ("Michael
 * Kershner" on an account called Mike), else the account name.
 */
export function signatureBlock(user, template) {
  if (!user) return '';
  const name = String(user.signatureName || '').trim() || user.name;
  const values = {
    name, first: firstName(name), title: user.jobTitle,
    email: user.email, phone: user.phone ? formatPhone(user.phone) : '',
    office: officeLine(user.officePhone, user.officeExt),
  };
  const val = k => String(values[k.toLowerCase()] ?? '').trim();
  const t = String(template ?? user.signatureTemplate ?? DEFAULT_SIGNATURE_TEMPLATE).replace(/\r\n/g, '\n');
  return t.split('\n').map(line => {
    const keys = [...line.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    if (keys.length && keys.every(k => !val(k))) return null;
    return line.replace(/\{(\w+)\}/g, (_, k) => val(k)).trimEnd();
  }).filter(l => l != null).join('\n').replace(/^\n+|\n+$/g, '').replace(/\n{3,}/g, '\n\n');
}

/** Sign-off name line plus the signature (never twice). */
export function withSignature(body, user) {
  const sig = signatureBlock(user);
  const text = String(body || '').replace(/\s+$/, '');
  if (!sig || text.endsWith(sig)) return text;
  return `${text}\n\n${sig}`;
}

/**
 * Add paragraphs to an email a person already edited: above the sign-off
 * ("Best,\nMike") and the signature, never below them.
 */
export function insertBeforeSignOff(body, paragraphs, user) {
  let text = String(body || '').replace(/\s+$/, '');
  const add = String(paragraphs || '').trim();
  if (!add) return text;
  let tail = '';
  const sig = signatureBlock(user);
  if (sig && text.endsWith(sig)) { tail = `\n\n${sig}`; text = text.slice(0, -sig.length).replace(/\s+$/, ''); }
  const m = text.match(/\n\n([^\n]{1,30},)\n([^\n]{1,40})$/);
  if (m) { tail = `\n\n${m[1]}\n${m[2]}${tail}`; text = text.slice(0, m.index); }
  return `${text}\n\n${add}${tail}`;
}

/**
 * A shared note's email changes hands (0108): the old sender's signature and
 * sign-off name come off, the new sender's go on. Everything else is kept.
 */
export function swapSender(body, from, to) {
  let text = String(body || '').replace(/\s+$/, '');
  const oldSig = signatureBlock(from);
  if (oldSig && text.endsWith(oldSig)) text = text.slice(0, -oldSig.length).replace(/\s+$/, '');
  const olds = [from?.name, from?.signatureName].map(n => firstName(n).toLowerCase()).filter(Boolean);
  const next = firstName(String(to?.signatureName || '').trim() || to?.name);
  const m = text.match(/\n\n([^\n]{1,30},)\n([^\n]{1,40})$/);
  if (m && next && olds.includes(m[2].trim().toLowerCase())) text = `${text.slice(0, m.index)}\n\n${m[1]}\n${next}`;
  return withSignature(text, to);
}

function parseProfile(p) {
  if (!p) return null;
  if (typeof p === 'object') return p;
  try { return JSON.parse(p); } catch { return null; }
}

const list = (label, xs) => (Array.isArray(xs) && xs.length ? `${label}: ${xs.slice(0, 12).map(x => `"${x}"`).join(', ')}\n` : '');

/** Prompt block describing how this person writes, or '' with no profile. */
export function toneSection(profile, name) {
  const p = parseProfile(profile);
  if (!p) return '';
  const who = firstName(name) || 'the sender';
  return `
Write the way ${who} actually writes. This is drawn from ${who}'s own sent email:
${p.summary ? `Voice: ${p.summary}\n` : ''}${p.formality ? `Formality: ${p.formality}\n` : ''}${p.sentenceLength ? `Sentence length: ${p.sentenceLength}\n` : ''}${list('Tone', p.tone)}${list('Openers they use', p.openers)}${list('Closers they use', p.closers)}${list('Phrases they use', p.phrases)}${list('Words they reach for', p.vocabulary)}${list('Subject lines they have written', p.subjects)}${p.subjectStyle ? `Their subject lines: ${p.subjectStyle}\n` : ''}${list('They avoid', p.avoids)}${list('Habits', p.patterns)}${list('Kinds of personal things they say (only when a real fact about this person is known; never invent one)', (p.personal || []).map(x => x?.kind).filter(Boolean))}Borrow their rhythm and word choice. Never copy a phrase that does not fit this email.
`;
}

/**
 * Real emails this person wrote, shown to the writer as the thing to sound
 * like. A summary of someone's voice only goes so far; their own words go
 * further. Their details (names, jobs, numbers) must never be copied.
 */
export function voiceExamplesSection(samples, name) {
  if (!samples?.length) return '';
  const who = firstName(name) || 'the sender';
  const shown = samples.map((s, i) => `Email ${i + 1}
Subject: ${s.subject || '(none)'}
${String(s.body || '').trim()}`).join('\n\n');
  return `
Real emails ${who} wrote. Sound like these: same greeting, same length, same words,
same way of signing off, same kind of subject line. Never copy their names, projects or numbers:
${shown}
`;
}

/** The subject rule every writer uses: in the sender's voice, never generic. */
export function subjectRules(meetingNoun) {
  return `The subject line is in the sender's voice too: the way they title their own emails
(see their subject lines above), short, specific to this person or project${meetingNoun ? ` or our ${meetingNoun}` : ''}.
Never a stock line like "Checking in", "Following up" or "Touching base" on its own, and never a day word
(today, yesterday, this morning, this week).`;
}

const DAY_WORDS = /\b(today|yesterday|tonight|this (morning|afternoon|evening|week)|last (night|week))\b/i;
const STOCK_SUBJECT = /^(re:\s*)?(checking in|following up|follow[- ]up|touching base|quick (question|note|check[- ]in))[.!]?$/i;

/** A subject the writer returned, or the fallback when it is empty, dated or generic. */
export function pickSubject(proposed, fallback) {
  // A new email is never a reply or a forward, so a learned "Re:" habit is dropped.
  const s = stripDashes(String(proposed || '').replace(/\s+/g, ' ').trim())
    .replace(/^((re|fwd?|fw)\s*:\s*)+/i, '').trim().slice(0, 120);
  if (!s || DAY_WORDS.test(s) || STOCK_SUBJECT.test(s)) return fallback;
  return s;
}

/** Rules every bot email follows, whoever it is from. */
export const PLAIN_VOICE_RULES = `How it should read:
- Like a real person who knows them, not a form letter. Contractions, plain words, short sentences.
- No stock lines: never "I hope this email finds you well", "Thanks so much for taking the time",
  "I really appreciated", "Please don't hesitate".
- Never use an em dash, en dash or double dash. Use a period or a comma instead.`;
