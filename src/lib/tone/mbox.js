/**
 * Reading a Google Takeout .mbox for the tone profile (Mike 9-26: "how can each
 * sales person teach you tone of them and the flow of how they speak?").
 *
 * Runs in the BROWSER: a Takeout file is hundreds of MB and the front door
 * refuses anything over ~4.4 MB, so the file never leaves the person's
 * computer. We stream it, keep only the words each person wrote themselves
 * (their own sent mail, quoted replies and signatures cut off), and upload
 * that small list. Also used by the server for small legacy uploads.
 *
 * Pure: its only import is the age table, also pure.
 */
import { keepByAge, KEEP_PER_MAILBOX } from './voiceAge.js';

export const MAX_BODY = 800;
const SKIP_SUBJECTS = ['unsubscribe', 'auto-reply', 'automatic reply', 'out of office', 'no-reply', 'noreply',
  'notification', 'invoice', 'receipt', 'password', 'verification', 'accepted:', 'declined:', 'invitation:', 'updated invitation'];

function utf8(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('utf8');
  return new TextDecoder('utf-8').decode(bytes);
}
function b64(s) {
  const clean = String(s).replace(/[^A-Za-z0-9+/=]/g, '');
  try {
    if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64').toString('utf8');
    return utf8(Uint8Array.from(atob(clean), c => c.charCodeAt(0)));
  } catch { return ''; }
}
function qp(s) {
  const t = String(s).replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; }
    else {
      const c = t.charCodeAt(i);
      if (c < 128) bytes.push(c);
      else bytes.push(...new TextEncoder().encode(t[i]));
    }
  }
  return utf8(Uint8Array.from(bytes));
}

/** "=?UTF-8?B?...?=" and "=?UTF-8?Q?...?=" header words. */
export function decodeHeader(v) {
  return String(v || '').replace(/=\?[^?]+\?([BbQq])\?([^?]*)\?=/g, (_, enc, text) =>
    enc.toUpperCase() === 'B' ? b64(text) : qp(text.replace(/_/g, ' '))).replace(/\s+/g, ' ').trim();
}

function splitHead(raw) {
  const m = raw.match(/\r?\n\r?\n/);
  if (!m) return null;
  const head = raw.slice(0, m.index).replace(/\r?\n[ \t]+/g, ' ');   // unfold
  return { head, body: raw.slice(m.index + m[0].length) };
}
const header = (head, name) => (head.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'im'))?.[1] || '').trim();

function decodePart(head, body) {
  const enc = header(head, 'Content-Transfer-Encoding').toLowerCase();
  if (enc === 'base64') return b64(body);
  if (enc === 'quoted-printable') return qp(body);
  return body;
}

export const stripHtml = h => String(h)
  .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"');

/** The readable text of one message or part: text/plain first, then HTML. */
function textOf(head, body, depth = 0) {
  const type = header(head, 'Content-Type').toLowerCase();
  if (type.startsWith('multipart/') && depth < 5) {
    const boundary = header(head, 'Content-Type').match(/boundary="?([^";]+)"?/i)?.[1];
    if (!boundary) return '';
    const parts = body.split(`--${boundary}`).slice(1).map(p => splitHead(p.replace(/^\r?\n/, ''))).filter(Boolean);
    const plain = parts.find(p => /^text\/plain/i.test(header(p.head, 'Content-Type')) && !/attachment/i.test(header(p.head, 'Content-Disposition')));
    if (plain) return decodePart(plain.head, plain.body);
    for (const p of parts) { const t = textOf(p.head, p.body, depth + 1); if (t) return t; }
    return '';
  }
  if (type && !type.startsWith('text/')) return '';
  const t = decodePart(head, body);
  return type.startsWith('text/html') ? stripHtml(t) : t;
}

/** Only what the person wrote: no quoted thread, no signature block. */
export function ownWords(text) {
  let t = String(text || '').replace(/\r\n/g, '\n');
  const cuts = [
    /^On [^\n]{5,200}(?:\n[^\n]{0,120})?wrote:\s*$/m, /^-{2,}\s*Original Message\s*-{2,}/im, /^_{10,}\s*$/m,
    /^From:\s.+\n(?:.*\n){0,3}?(?:Sent|Date):\s/m, /^-- ?$/m, /^Sent from my (?:iPhone|iPad|Android|mobile)/im,
    /^\s*\[image:/m, // a Gmail picture signature, as plain text
  ];
  for (const re of cuts) { const m = t.match(re); if (m) t = t.slice(0, m.index); }
  const lines = t.split('\n').filter(l => !/^\s*>/.test(l));
  return cutSignature(lines).join('\n')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// A typed signature at the bottom (name, title, email, cell) is not the
// person's voice, and the company signature is added to every draft anyway.
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4}/;
const SIG_LINE = l => l.trim().length > 0 && l.trim().length <= 70 && !/[.!?,:;]$/.test(l.trim());
function cutSignature(lines) {
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) end--;
  let first = -1;
  for (let i = Math.max(0, end - 6); i < end; i++) {
    if (CONTACT.test(lines[i]) && lines[i].trim().length <= 70) { first = i; break; }
  }
  if (first < 0 || lines.slice(first, end).some(l => l.trim().length > 70)) return lines;
  let start = first;
  while (start > 0 && first - start < 3 && SIG_LINE(lines[start - 1])) start--;
  return start > 0 ? lines.slice(0, start) : lines;
}

/**
 * One mbox record → { subject, date, body } when it is an email this person
 * wrote, else null. `myEmail` narrows to their own sent mail.
 */
export function parseMessage(raw, myEmail = '') {
  const parts = splitHead(String(raw).replace(/^From [^\n]*\n/, ''));
  if (!parts) return null;
  const { head, body } = parts;
  const labels = header(head, 'X-Gmail-Labels');
  const from = header(head, 'From').toLowerCase();
  const mine = myEmail ? from.includes(String(myEmail).toLowerCase()) : false;
  if (labels ? !(/\bSent\b/i.test(labels) || mine) : (myEmail && !mine)) return null;
  if (/\bChat\b/i.test(labels)) return null;
  const subject = decodeHeader(header(head, 'Subject'));
  if (SKIP_SUBJECTS.some(s => subject.toLowerCase().includes(s))) return null;
  let text = ownWords(textOf(head, body));
  if (text.length < 40) return null;
  if (text.length > MAX_BODY) text = `${text.slice(0, MAX_BODY)}…`;
  const date = Date.parse(header(head, 'Date')) || 0;
  return { subject: subject.slice(0, 200), date, body: text };
}

/**
 * The last step for an email read from any other export (Outlook .pst, .olm,
 * .msg): drop automatic mail, keep only the person's own words, cap the length.
 */
export function finishEmail(subject, text, date = 0) {
  const s = String(subject || '').replace(/^\u0001./, '').replace(/\s+/g, ' ').trim();
  if (SKIP_SUBJECTS.some(k => s.toLowerCase().includes(k))) return null;
  let body = ownWords(text);
  if (body.length < 40) return null;
  if (body.length > MAX_BODY) body = `${body.slice(0, MAX_BODY)}…`;
  return { subject: s.slice(0, 200), date: date || 0, body };
}

/** Newest first, at most `max`. */
export function newest(emails, max = 200) {
  return [...emails].sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, max);
}

/** A whole .mbox already in memory (small files, and the tests). */
export function parseMboxText(text, myEmail = '', max = 200) {
  const out = [];
  for (const rec of String(text).split(/\n(?=From )/)) {
    const e = parseMessage(rec, myEmail);
    if (e) out.push(e);
  }
  return newest(out, max);
}

/**
 * Browser: stream a File of any size, record by record, keeping only the
 * parsed emails. `onProgress(bytesRead, found)` is called as it goes.
 * A big mailbox keeps a spread across every year, tilted to the newest
 * (voiceAge.js), not just the newest few hundred (Mike 9-27).
 */
export async function extractSentEmails(file, myEmail = '', { max = KEEP_PER_MAILBOX, onProgress } = {}) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  const out = [];
  let buf = '', scanFrom = 1, read = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) { buf += value; read += value.length; }
    let idx;
    while ((idx = buf.indexOf('\nFrom ', scanFrom)) !== -1) {
      const e = parseMessage(buf.slice(0, idx), myEmail);
      if (e) out.push(e);
      buf = buf.slice(idx + 1);
      scanFrom = 1;
    }
    scanFrom = Math.max(1, buf.length - 6);
    onProgress?.(read, out.length);
    if (done) break;
  }
  if (buf.trim()) { const e = parseMessage(buf, myEmail); if (e) out.push(e); }
  return keepByAge(out, { max });
}

/** Stable short fingerprint of one email, so the same one uploaded twice is kept once. */
export function sampleHash(subject, body) {
  const s = `${String(subject || '').trim().toLowerCase()}\n${String(body || '').replace(/\s+/g, ' ').trim().toLowerCase()}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}${s.length.toString(16)}`;
}

/** One pasted or .txt email: an optional "Subject:" first line, then the words. */
export function parsePastedEmail(text, fallbackSubject = '') {
  let t = String(text || '').replace(/\r\n/g, '\n').trim();
  let subject = fallbackSubject;
  const m = t.match(/^subject:[ \t]*(.*)\n/i);
  if (m) { subject = m[1].trim(); t = t.slice(m[0].length); }
  const body = ownWords(t);
  if (body.length < 40) return null;
  return { subject: subject.slice(0, 200), date: 0, body: body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}…` : body };
}
