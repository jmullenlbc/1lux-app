/**
 * Reading Outlook exports for Voice Training (Mike 9-26: "we need to be able
 * to upload the equivalent of Google takeout from Microsoft").
 *
 *  - .pst  Outlook for Windows: File > Open & Export > Import/Export > Export to a file.
 *  - .olm  Outlook for Mac: File > Export.
 *  - .msg  one email dragged out of Outlook.
 *
 * Runs in the BROWSER, like the .mbox reader: a .pst is often gigabytes and
 * the front door refuses anything over ~4.4 MB, so the file never leaves the
 * person's computer. We read only the pieces we need with File.slice and hand
 * back { subject, date, body } for the person's own sent mail.
 *
 * No libraries. Formats: MS-PST (Unicode), MS-CFB + MS-OXMSG, ZIP, MS-OXRTFCP.
 */
import { finishEmail, newest, stripHtml } from './mbox.js';

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 0x100000000;
const filetime = (b, o) => { const ms = u64(b, o) / 10000 - 11644473600000; return ms > 0 ? Math.round(ms) : 0; };

async function bytesAt(file, at, len) {
  return new Uint8Array(await file.slice(at, at + len).arrayBuffer());
}
const utf16 = b => new TextDecoder('utf-16le').decode(b).replace(/\0+$/, '');
const utf8 = b => new TextDecoder('utf-8').decode(b).replace(/\0+$/, '');
function cp1252(b) {
  try { return new TextDecoder('windows-1252').decode(b).replace(/\0+$/, ''); } catch { return String.fromCharCode(...b).replace(/\0+$/, ''); }
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
/** Run `fn` over `items`, `n` at a time, keeping order. */
async function pmap(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// The folder a person's sent mail lives in, in the languages we are likely to see.
export const SENT_FOLDER = /^(sent|sent items|sent mail|sent messages|gesendete|gesendete elemente|éléments envoyés|elementos enviados|posta inviata|verzonden items)$/i;

// ─── Compressed RTF (MS-OXRTFCP) ─────────────────────────────────────────────
// Outlook often keeps a message's body only as compressed RTF.

export const RTF_PREBUF = '{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier{\\colortbl\\red0\\green0\\blue0\r\n\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx';

export function decompressRtf(bytes) {
  if (!bytes || bytes.length < 16) return null;
  const compSize = u32(bytes, 0), rawSize = u32(bytes, 4), magic = u32(bytes, 8);
  if (magic === 0x414c454d) return bytes.subarray(16, 16 + rawSize);  // "MELA": stored as is
  if (magic !== 0x75465a4c) return null;                                 // "LZFu"
  const dict = new Uint8Array(4096);
  for (let i = 0; i < RTF_PREBUF.length; i++) dict[i] = RTF_PREBUF.charCodeAt(i);
  let w = RTF_PREBUF.length;
  const out = [];
  const end = Math.min(bytes.length, compSize + 4);
  let p = 16;
  while (p < end) {
    const flags = bytes[p++];
    for (let bit = 0; bit < 8 && p < end; bit++) {
      if (flags & (1 << bit)) {
        if (p + 1 >= end) break;
        const ref = (bytes[p] << 8) | bytes[p + 1]; p += 2;
        const off = ref >> 4, len = (ref & 0xF) + 2;
        if (off === w % 4096) return Uint8Array.from(out);             // end marker
        for (let k = 0; k < len; k++) { const c = dict[(off + k) % 4096]; out.push(c); dict[w % 4096] = c; w++; }
      } else {
        const c = bytes[p++]; out.push(c); dict[w % 4096] = c; w++;
      }
    }
  }
  return Uint8Array.from(out);
}

const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'listtable',
  'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'datastore', 'latentstyles', 'mmathPr', 'filetbl', 'revtbl']);

/** Plain words out of RTF, including Outlook's HTML-inside-RTF. */
export function rtfToText(rtf) {
  const s = String(rtf || '');
  const re = /\\(?:([a-zA-Z]+)(-?\d+)? ?|'([0-9a-fA-F]{2})|([^a-zA-Z]))/y;
  let out = '', depth = 0, skipAt = -1, groupStart = false, htmlrtf = false, uc = 1, drop = 0;
  const put = t => { if (skipAt >= 0) return; if (drop > 0) { drop--; return; } if (!htmlrtf) out += t; };
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '{') { depth++; groupStart = true; i++; continue; }
    if (c === '}') { if (depth === skipAt) skipAt = -1; depth--; groupStart = false; i++; continue; }
    if (c === '\r' || c === '\n') { i++; continue; }
    if (c !== '\\') { put(c); groupStart = false; i++; continue; }
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) { i++; continue; }
    i = re.lastIndex;
    const first = groupStart; groupStart = false;
    if (m[4] === '*') { if (first && skipAt < 0) skipAt = depth; continue; }
    if (m[3]) { const b = parseInt(m[3], 16); put(b < 0x80 ? String.fromCharCode(b) : cp1252(Uint8Array.of(b))); continue; }
    if (m[4]) { if (m[4] === '~') put(' '); else if ('\\{}'.includes(m[4])) put(m[4]); continue; }
    const word = m[1], arg = m[2];
    if (first && RTF_SKIP.has(word) && skipAt < 0) { skipAt = depth; continue; }
    if (word === 'htmlrtf') { htmlrtf = arg !== '0'; continue; }
    if (skipAt >= 0) continue;
    if (word === 'uc') { uc = Number(arg) || 0; continue; }
    if (word === 'u') { let n = Number(arg); if (n < 0) n += 65536; if (!htmlrtf) out += String.fromCharCode(n); drop = uc; continue; }
    if (word === 'par' || word === 'line') { out += '\n'; continue; }  // kept even inside \htmlrtf, where <br> and <p> land
    if (word === 'tab') put(' ');
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function rtfBody(bytes) {
  const raw = decompressRtf(bytes);
  return raw ? rtfToText(cp1252(raw)) : '';
}

// ─── .msg (MS-CFB compound file + MS-OXMSG) ──────────────────────────────────

const FREE = 0xFFFFFFFF, END = 0xFFFFFFFE;

/** The streams directly under the root of a compound file, by upper-case name. */
export function readCfbRoot(b) {
  const sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  if (b.length < 512 || sig.some((v, i) => b[i] !== v)) throw new Error('That .msg file is not an Outlook email.');
  const secSize = 1 << u16(b, 30), miniSize = 1 << u16(b, 32);
  const nFat = u32(b, 44), dirStart = u32(b, 48), cutoff = u32(b, 56), miniFatStart = u32(b, 60);
  let difat = u32(b, 68);
  const sector = n => b.subarray((n + 1) * secSize, (n + 2) * secSize);
  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < nFat; i++) { const s = u32(b, 76 + i * 4); if (s < 0xFFFFFFFA) fatSectors.push(s); }
  for (let guard = 0; difat < 0xFFFFFFFA && fatSectors.length < nFat && guard < 10000; guard++) {
    const d = sector(difat);
    for (let i = 0; i < secSize / 4 - 1 && fatSectors.length < nFat; i++) { const s = u32(d, i * 4); if (s < 0xFFFFFFFA) fatSectors.push(s); }
    difat = u32(d, secSize - 4);
  }
  const fat = [];
  for (const s of fatSectors) { const d = sector(s); for (let i = 0; i < secSize; i += 4) fat.push(u32(d, i)); }
  const chain = (start, table) => {
    const out = [];
    for (let s = start; s < 0xFFFFFFFA && out.length <= table.length; s = table[s] ?? END) out.push(s);
    return out;
  };
  const readChain = start => concat(chain(start, fat).map(sector));
  const dir = readChain(dirStart);
  const entry = i => {
    const o = i * 128;
    if (o + 128 > dir.length) return null;
    const nameLen = u16(dir, o + 64);
    return {
      name: utf16(dir.subarray(o, o + Math.max(0, nameLen - 2))), type: dir[o + 66],
      left: u32(dir, o + 68), right: u32(dir, o + 72), child: u32(dir, o + 76),
      start: u32(dir, o + 116), size: u32(dir, o + 120),
    };
  };
  const root = entry(0);
  if (!root) throw new Error('That .msg file looks damaged.');
  let mini = null, miniFat = null;
  const streamOf = e => {
    if (e.size >= cutoff) return readChain(e.start).subarray(0, e.size);
    mini ??= readChain(root.start);
    if (!miniFat) { const m = readChain(miniFatStart); miniFat = []; for (let i = 0; i + 4 <= m.length; i += 4) miniFat.push(u32(m, i)); }
    return concat(chain(e.start, miniFat).map(s => mini.subarray(s * miniSize, (s + 1) * miniSize))).subarray(0, e.size);
  };
  const streams = new Map();
  const seen = new Set();
  const visit = i => {
    if (i === FREE || seen.has(i) || seen.size > 5000) return;
    seen.add(i);
    const e = entry(i);
    if (!e) return;
    if (e.type === 2) streams.set(e.name.toUpperCase(), () => streamOf(e));
    visit(e.left); visit(e.right);   // siblings only; never into attachments or recipients
  };
  visit(root.child);
  return streams;
}

/** One dragged-out Outlook email → { subject, date, body }, or null. */
export async function parseMsgFile(file) {
  if (file.size > 30e6) return null;
  const streams = readCfbRoot(new Uint8Array(await file.arrayBuffer()));
  const raw = (id, type) => streams.get(`__SUBSTG1.0_${id}${type}`)?.() || null;
  const str = id => { const w = raw(id, '001F'); if (w) return utf16(w); const a = raw(id, '001E'); return a ? cp1252(a) : ''; };
  let date = 0;
  const props = streams.get('__PROPERTIES_VERSION1.0')?.();
  if (props) {
    const found = {};
    for (let o = 32; o + 16 <= props.length; o += 16) {
      if (u16(props, o) === 0x0040) found[u16(props, o + 2)] = filetime(props, o + 8);
    }
    date = found[0x0039] || found[0x0E06] || 0;
  }
  let text = str('1000');
  if (!text.trim()) { const h = raw('1013', '0102'); text = h ? stripHtml(utf8(h)) : stripHtml(str('1013')); }
  if (!text.trim()) { const r = raw('1009', '0102'); text = r ? rtfBody(r) : ''; }
  return finishEmail(str('0037'), text, date);
}

// ─── .olm (Outlook for Mac: a zip of XML files) ──────────────────────────────

export async function zipEntries(file, kind = '.olm') {
  const damaged = kind === '.zip'
    ? `${file.name || 'That .zip file'} looks damaged or only partly downloaded. Download that part again.`
    : 'That .olm file looks damaged. Export it again from Outlook.';
  const tailLen = Math.min(file.size, 65557);
  const tail = await bytesAt(file, file.size - tailLen, tailLen);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error(damaged);
  let cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
  if (u16(tail, e + 10) === 0xFFFF || cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) {
    const loc = e - 20;
    if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw new Error(damaged);
    const z = await bytesAt(file, u64(tail, loc + 8), 56);
    if (u32(z, 0) !== 0x06064b50) throw new Error(damaged);
    cdSize = u64(z, 40); cdOff = u64(z, 48);
  }
  const cd = await bytesAt(file, cdOff, cdSize);
  const out = [];
  for (let p = 0; p + 46 <= cd.length && u32(cd, p) === 0x02014b50;) {
    const method = u16(cd, p + 10), n = u16(cd, p + 28), x = u16(cd, p + 30), c = u16(cd, p + 32);
    let comp = u32(cd, p + 20), size = u32(cd, p + 24), off = u32(cd, p + 42);
    const name = utf8(cd.subarray(p + 46, p + 46 + n));
    const xEnd = p + 46 + n + x;
    for (let q = p + 46 + n; q + 4 <= xEnd;) {
      const id = u16(cd, q), len = u16(cd, q + 2);
      if (id === 1) {   // zip64 sizes and offset, only for the fields that overflowed
        let r = q + 4;
        if (size === 0xFFFFFFFF) { size = u64(cd, r); r += 8; }
        if (comp === 0xFFFFFFFF) { comp = u64(cd, r); r += 8; }
        if (off === 0xFFFFFFFF) off = u64(cd, r);
      }
      q += 4 + len;
    }
    out.push({ name, method, comp, size, off });
    p = xEnd + c;
  }
  return out;
}

async function inflateRaw(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export async function zipRead(file, e) {
  const lh = await bytesAt(file, e.off, 30);
  if (u32(lh, 0) !== 0x04034b50) return null;
  const raw = await bytesAt(file, e.off + 30 + u16(lh, 26) + u16(lh, 28), e.comp);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRaw(raw);
  return null;
}

/**
 * One zip entry as something with a .stream(), read piece by piece so a
 * many-GB mailbox inside a Google Takeout .zip never sits in memory whole.
 */
export async function zipEntryStream(file, e) {
  const lh = await bytesAt(file, e.off, 30);
  if (u32(lh, 0) !== 0x04034b50 || (e.method !== 0 && e.method !== 8)) return null;
  const start = e.off + 30 + u16(lh, 26) + u16(lh, 28);
  const blob = file.slice(start, start + e.comp);
  return { name: e.name, size: e.size,
    stream: () => (e.method === 8 ? blob.stream().pipeThrough(new DecompressionStream('deflate-raw')) : blob.stream()) };
}

const xmlUnescape = s => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xmlTag = (xml, tag) => xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1];

/** One .olm message XML → { subject, date, body, from }, or null. */
export function parseOlmMessage(xml) {
  const subject = xmlUnescape(xmlTag(xml, 'OPFMessageCopySubject') || '');
  const body = xmlTag(xml, 'OPFMessageCopyBody') ?? xmlTag(xml, 'OPFMessageCopyHTMLBody') ?? '';
  const html = xmlUnescape(body);
  const text = /<\/?(p|div|br|span|html|body|table)\b/i.test(html) ? stripHtml(html) : html;
  const fromBlock = xmlTag(xml, 'OPFMessageCopyFromAddresses') || xmlTag(xml, 'OPFMessageCopySenderAddress') || '';
  const from = (fromBlock.match(/OPFContactEmailAddressAddress="([^"]*)"/)?.[1] || xmlUnescape(fromBlock)).toLowerCase();
  const date = Date.parse(xmlTag(xml, 'OPFMessageCopySentTime') || xmlTag(xml, 'OPFMessageCopyReceivedTime') || '') || 0;
  const e = finishEmail(subject, text, date);
  return e && { ...e, from };
}

export async function extractOlmEmails(file, myEmail = '', { max = 200, onProgress } = {}) {
  const all = (await zipEntries(file)).filter(e => /com\.microsoft\.__Messages\/.+\.xml$/i.test(e.name));
  if (!all.length) throw new Error('No email was found in that .olm file.');
  const folderOf = name => name.split(/com\.microsoft\.__Messages\//i)[1].split('/')[0];
  const sent = all.filter(e => SENT_FOLDER.test(folderOf(e.name)));
  const me = String(myEmail || '').toLowerCase();
  if (!sent.length && !me) throw new Error('No Sent folder was found in that .olm file.');
  const pool = (sent.length ? sent : all)
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))
    .slice(0, max * 4 + 200);
  const out = [];
  let done = 0;
  await pmap(pool, 8, async e => {
    if (out.length >= max) return;
    try {
      const bytes = await zipRead(file, e);
      const m = bytes && parseOlmMessage(utf8(bytes));
      if (m && (sent.length || m.from.includes(me))) { delete m.from; out.push(m); }
    } catch { /* one unreadable message never stops the rest */ }
    onProgress?.(Math.round(file.size * (++done / pool.length)), out.length);
  });
  return newest(out, max);
}

// ─── .pst (MS-PST, Unicode) ──────────────────────────────────────────────────

// MS-PST mpbbI: undoes Outlook's default "compressible" byte scrambling.
const PERMUTE = Uint8Array.from([
  0x47, 0xf1, 0xb4, 0xe6, 0x0b, 0x6a, 0x72, 0x48, 0x85, 0x4e, 0x9e, 0xeb, 0xe2, 0xf8, 0x94, 0x53,
  0xe0, 0xbb, 0xa0, 0x02, 0xe8, 0x5a, 0x09, 0xab, 0xdb, 0xe3, 0xba, 0xc6, 0x7c, 0xc3, 0x10, 0xdd,
  0x39, 0x05, 0x96, 0x30, 0xf5, 0x37, 0x60, 0x82, 0x8c, 0xc9, 0x13, 0x4a, 0x6b, 0x1d, 0xf3, 0xfb,
  0x8f, 0x26, 0x97, 0xca, 0x91, 0x17, 0x01, 0xc4, 0x32, 0x2d, 0x6e, 0x31, 0x95, 0xff, 0xd9, 0x23,
  0xd1, 0x00, 0x5e, 0x79, 0xdc, 0x44, 0x3b, 0x1a, 0x28, 0xc5, 0x61, 0x57, 0x20, 0x90, 0x3d, 0x83,
  0xb9, 0x43, 0xbe, 0x67, 0xd2, 0x46, 0x42, 0x76, 0xc0, 0x6d, 0x5b, 0x7e, 0xb2, 0x0f, 0x16, 0x29,
  0x3c, 0xa9, 0x03, 0x54, 0x0d, 0xda, 0x5d, 0xdf, 0xf6, 0xb7, 0xc7, 0x62, 0xcd, 0x8d, 0x06, 0xd3,
  0x69, 0x5c, 0x86, 0xd6, 0x14, 0xf7, 0xa5, 0x66, 0x75, 0xac, 0xb1, 0xe9, 0x45, 0x21, 0x70, 0x0c,
  0x87, 0x9f, 0x74, 0xa4, 0x22, 0x4c, 0x6f, 0xbf, 0x1f, 0x56, 0xaa, 0x2e, 0xb3, 0x78, 0x33, 0x50,
  0xb0, 0xa3, 0x92, 0xbc, 0xcf, 0x19, 0x1c, 0xa7, 0x63, 0xcb, 0x1e, 0x4d, 0x3e, 0x4b, 0x1b, 0x9b,
  0x4f, 0xe7, 0xf0, 0xee, 0xad, 0x3a, 0xb5, 0x59, 0x04, 0xea, 0x40, 0x55, 0x25, 0x51, 0xe5, 0x7a,
  0x89, 0x38, 0x68, 0x52, 0x7b, 0xfc, 0x27, 0xae, 0xd7, 0xbd, 0xfa, 0x07, 0xf4, 0xcc, 0x8e, 0x5f,
  0xef, 0x35, 0x9c, 0x84, 0x2b, 0x15, 0xd5, 0x77, 0x34, 0x49, 0xb6, 0x12, 0x0a, 0x7f, 0x71, 0x88,
  0xfd, 0x9d, 0x18, 0x41, 0x7d, 0x93, 0xd8, 0x58, 0x2c, 0xce, 0xfe, 0x24, 0xaf, 0xde, 0xb8, 0x36,
  0xc8, 0xa1, 0x80, 0xa6, 0x99, 0x98, 0xa8, 0x2f, 0x0e, 0x81, 0x65, 0x73, 0xe4, 0xc2, 0xa2, 0x8a,
  0xd4, 0xe1, 0x11, 0xd0, 0x08, 0x8b, 0x2a, 0xf2, 0xed, 0x9a, 0x64, 0x3f, 0xc1, 0x6c, 0xf9, 0xec,
]);
export const pstUnpermute = b => { for (let i = 0; i < b.length; i++) b[i] = PERMUTE[b[i]]; return b; };

const INLINE_TYPES = new Set([0x0002, 0x0003, 0x0004, 0x000A, 0x000B]);
const P = { subject: 0x0037, submit: 0x0039, delivery: 0x0E06, senderEmail: 0x0C1F, senderSmtp: 0x5D01,
  body: 0x1000, rtf: 0x1009, html: 0x1013, folderName: 0x3001 };
const isInternal = bid => Math.floor(bid / 2) % 2 === 1;
const unmarked = bid => bid - (bid % 2);

/** Open a .pst: the node list, and a reader for one node's properties. */
export async function openPst(file) {
  const h = await bytesAt(file, 0, 564);
  if (String.fromCharCode(h[0], h[1], h[2], h[3]) !== '!BDN') throw new Error('That file is not an Outlook .pst.');
  const ver = u16(h, 10);
  if (ver === 14 || ver === 15) throw new Error('That .pst is the old Outlook 97-2002 kind. Export it again from a current Outlook.');
  if (ver !== 23) throw new Error('That .pst version cannot be read here. Export it again from Outlook as a .pst file.');
  const crypt = h[513];
  if (crypt === 2) throw new Error('That .pst uses Outlook "high" encryption. Export it again without a password.');
  const nbtRoot = u64(h, 224), bbtRoot = u64(h, 240);

  const pages = new Map();
  const page = async ib => {
    let p = pages.get(ib);
    if (!p) { if (pages.size > 20000) pages.clear(); p = await bytesAt(file, ib, 512); pages.set(ib, p); }
    return p;
  };

  // Every node, read once (a few thousand pages even for a big file).
  const nodes = [];
  for (let level = [nbtRoot], guard = 0; level.length && guard < 12; guard++) {
    const got = await pmap(level, 32, page);
    const next = [];
    for (const p of got) {
      const n = p[488], cb = p[490], lvl = p[491];
      if (!cb) continue;
      for (let i = 0; i < n; i++) {
        const o = i * cb;
        if (lvl > 0) next.push(u64(p, o + 16));
        else nodes.push({ nid: u32(p, o), bidData: u64(p, o + 8), bidSub: u64(p, o + 16), parent: u32(p, o + 24) });
      }
    }
    level = next;
  }

  // Blocks are looked up one at a time, only for the messages we read.
  async function findBlock(bid) {
    const key = unmarked(bid);
    let ib = bbtRoot;
    for (let d = 0; d < 12; d++) {
      const p = await page(ib);
      const n = p[488], cb = p[490], lvl = p[491];
      if (!cb) return null;
      if (lvl === 0) {
        for (let i = 0; i < n; i++) if (unmarked(u64(p, i * cb)) === key) return { ib: u64(p, i * cb + 8), cb: u16(p, i * cb + 16) };
        return null;
      }
      let pick = -1;
      for (let i = 0; i < n; i++) { if (unmarked(u64(p, i * cb)) <= key) pick = i; else break; }
      if (pick < 0) return null;
      ib = u64(p, pick * cb + 16);
    }
    return null;
  }
  async function readBlock(bid) {
    const at = await findBlock(bid);
    if (!at) return null;
    const b = await bytesAt(file, at.ib, at.cb);
    return !isInternal(bid) && crypt === 1 ? pstUnpermute(b) : b;
  }
  // A node's data as its list of blocks (the heap addresses items by block number).
  async function dataBlocks(bid, depth = 0) {
    const b = await readBlock(bid);
    if (!b) return [];
    if (!isInternal(bid)) return [b];
    if (b[0] !== 0x01 || depth > 2) return [];
    const out = [];
    for (let i = 0; i < u16(b, 2); i++) {
      const child = u64(b, 8 + i * 8);
      if (b[1] === 1) { const d = await readBlock(child); if (d) out.push(d); } else out.push(...await dataBlocks(child, depth + 1));
    }
    return out;
  }
  async function subnodes(bid, map = new Map(), depth = 0) {
    if (!bid || depth > 3) return map;
    const b = await readBlock(bid);
    if (!b || b[0] !== 0x02) return map;
    const n = u16(b, 2);
    for (let i = 0; i < n; i++) {
      if (b[1] === 0) { const o = 8 + i * 24; map.set(u32(b, o), { bidData: u64(b, o + 8), bidSub: u64(b, o + 16) }); }
      else await subnodes(u64(b, 8 + i * 16 + 8), map, depth + 1);
    }
    return map;
  }

  /** A node's property reader: get(propId) → string | number | bytes | null. */
  async function props(node) {
    const blocks = await dataBlocks(node.bidData);
    const b0 = blocks[0];
    if (!b0 || b0[2] !== 0xEC || b0[3] !== 0xBC) return null;   // heap, property context
    const item = hid => {
      if (!hid || (hid & 0x1F)) return null;
      const idx = (hid >>> 5) & 0x7FF, b = blocks[hid >>> 16];
      if (!b) return null;
      const map = u16(b, 0), cAlloc = u16(b, map);
      if (idx < 1 || idx > cAlloc) return null;
      return b.subarray(u16(b, map + 4 + (idx - 1) * 2), u16(b, map + 4 + idx * 2));
    };
    const table = new Map();
    const head = item(u32(b0, 4));
    if (!head || head[0] !== 0xB5) return null;
    const cbKey = head[1], cbEnt = head[2];
    const walk = (hid, lvl, depth) => {
      const d = item(hid);
      if (!d || depth > 8) return;
      const size = lvl > 0 ? cbKey + 4 : cbKey + cbEnt;
      for (let o = 0; o + size <= d.length; o += size) {
        if (lvl > 0) walk(u32(d, o + cbKey), lvl - 1, depth + 1);
        else table.set(u16(d, o), { type: u16(d, o + 2), v: u32(d, o + 4) });
      }
    };
    walk(u32(head, 4), head[3], 0);
    let subs = null;
    return async id => {
      const p = table.get(id);
      if (!p) return null;
      if (INLINE_TYPES.has(p.type)) return p.v;
      let bytes;
      if (p.v & 0x1F) {
        subs ??= await subnodes(node.bidSub);
        const s = subs.get(p.v);
        bytes = s ? concat(await dataBlocks(s.bidData)) : null;
      } else bytes = item(p.v);
      if (!bytes) return null;
      if (p.type === 0x001F) return utf16(bytes);
      if (p.type === 0x001E) return cp1252(bytes);
      if (p.type === 0x0040) return filetime(bytes, 0);
      return bytes;
    };
  }
  return { nodes, props };
}

/** Readable words of one message from its property reader. */
async function pstText(get) {
  const body = await get(P.body);
  if (typeof body === 'string' && body.trim()) return body;
  const html = await get(P.html);
  if (html) return stripHtml(typeof html === 'string' ? html : utf8(html));
  const rtf = await get(P.rtf);
  return rtf instanceof Uint8Array ? rtfBody(rtf) : '';
}

/**
 * The person's own sent mail out of a .pst: every message in a Sent folder,
 * newest first (a message's node number grows as mail arrives, so we read
 * from the top down and stop once we have enough). With no Sent folder,
 * falls back to messages sent from `myEmail`.
 */
export async function extractPstEmails(file, myEmail = '', { max = 200, onProgress } = {}) {
  const { nodes, props } = await openPst(file);
  onProgress?.(0, 0);
  const sentFolders = new Set();
  for (const f of nodes.filter(n => (n.nid & 0x1F) === 0x02)) {
    try { const get = await props(f); const name = get && await get(P.folderName); if (typeof name === 'string' && SENT_FOLDER.test(name.trim())) sentFolders.add(f.nid); } catch { /* skip */ }
  }
  const me = String(myEmail || '').toLowerCase();
  const messages = nodes.filter(n => (n.nid & 0x1F) === 0x04);
  let pool = messages.filter(n => sentFolders.has(n.parent));
  const bySender = !pool.length;
  if (bySender) {
    if (!me) throw new Error('No Sent Items folder was found in that .pst. Export the Sent Items folder from Outlook.');
    pool = messages;
  }
  pool = pool.sort((a, b) => b.nid - a.nid).slice(0, bySender ? max * 20 : max * 4 + 200);
  const out = [];
  let done = 0;
  for (let i = 0; i < pool.length && out.length < max; i += 16) {
    await pmap(pool.slice(i, i + 16), 8, async n => {
      try {
        const get = await props(n);
        if (!get) return;
        if (bySender) {
          const from = [await get(P.senderEmail), await get(P.senderSmtp)].filter(v => typeof v === 'string').join(' ').toLowerCase();
          if (!from.includes(me)) return;
        }
        const date = (await get(P.submit)) || (await get(P.delivery)) || 0;
        const e = finishEmail(await get(P.subject), await pstText(get), typeof date === 'number' ? date : 0);
        if (e) out.push(e);
      } catch { /* one unreadable message never stops the rest */ }
      finally { done++; }
    });
    onProgress?.(Math.round(file.size * Math.min(1, done / pool.length)), out.length);
  }
  return newest(out, max);
}
