/**
 * Outlook exports for Voice Training (Mike 9-26): .pst, .olm and .msg are read
 * in the browser and give back only the person's own sent mail.
 *
 * Each format is built here byte by byte, so the readers are checked against
 * the published layouts rather than against themselves.
 *
 * Run: node --test scripts/tests/outlookExport.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import CFB from 'cfb';
import {
  RTF_PREBUF, decompressRtf, rtfToText, pstUnpermute, parseMsgFile, extractOlmEmails, extractPstEmails, parseOlmMessage,
} from '../../src/lib/tone/outlook.js';

const WHEN = Date.UTC(2026, 4, 1, 14, 22);
const LONG = 'Hey Lee, great seeing you at the job walk. I will send the fixture package over by Friday and we can go through pricing together.';
const utf16 = s => Buffer.from(`${s}`, 'utf16le');
const filetime = ms => (BigInt(ms) + 11644473600000n) * 10000n;

test('the .pst unscramble table is a true one-to-one table', () => {
  const b = pstUnpermute(Uint8Array.from({ length: 256 }, (_, i) => i));
  assert.equal(new Set(b).size, 256);
});

test('compressed RTF: a back reference into the starting dictionary, literals, then the end marker', () => {
  assert.equal(RTF_PREBUF.length, 207);
  const tail = ' Hi Lee}';
  // token 0: ref to offset 0, length 11 ("{\rtf1\ansi"); then literals; then the end marker at the write offset.
  const tokens = [{ ref: (0 << 4) | (11 - 2) }, ...[...tail].map(c => ({ lit: c.charCodeAt(0) }))];
  const endAt = (207 + 11 + tail.length) % 4096;
  tokens.push({ ref: endAt << 4 });
  const body = [];
  for (let i = 0; i < tokens.length; i += 8) {
    const group = tokens.slice(i, i + 8);
    body.push(group.reduce((f, t, k) => f | (t.ref != null ? 1 << k : 0), 0));
    for (const t of group) t.ref != null ? body.push(t.ref >> 8, t.ref & 0xFF) : body.push(t.lit);
  }
  const head = Buffer.alloc(16);
  head.writeUInt32LE(body.length + 12, 0); head.writeUInt32LE(11 + tail.length, 4);
  head.writeUInt32LE(0x75465a4c, 8);
  const out = Buffer.from(decompressRtf(Uint8Array.from([...head, ...body]))).toString('latin1');
  assert.equal(out, '{\\rtf1\\ansi Hi Lee}');
});

test('RTF to words, including Outlook HTML wrapped in RTF', () => {
  const rtf = '{\\rtf1\\ansi\\fromhtml1{\\fonttbl{\\f0 Arial;}}{\\*\\htmltag19 <html>}\\htmlrtf {\\htmlrtf0 Hi Lee,{\\*\\htmltag116 <br>}\\htmlrtf \\line \\htmlrtf0 Caf\\\'e9 at 9 works.\\par Thanks \\u8217?s all}';
  const t = rtfToText(rtf);
  assert.match(t, /^Hi Lee,\nCafé at 9 works\.\nThanks ’s all$/);
  assert.doesNotMatch(t, /Arial|html/);
});

// ─── .msg ────────────────────────────────────────────────────────────────────

function msgFile({ subject, body, date }) {
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '/__substg1.0_0037001F', utf16(subject));
  CFB.utils.cfb_add(cfb, '/__substg1.0_1000001F', utf16(body));
  const props = Buffer.alloc(32 + 16);
  props.writeUInt32LE((0x0039 << 16) | 0x0040, 32); props.writeUInt32LE(6, 36);
  props.writeBigUInt64LE(filetime(date), 40);
  CFB.utils.cfb_add(cfb, '/__properties_version1.0', props);
  // An attachment's own subject must never be taken for the email's.
  CFB.utils.cfb_add(cfb, '/__attach_version1.0_#00000000/__substg1.0_0037001F', utf16('WRONG'));
  return new File([CFB.write(cfb, { type: 'buffer' })], 'coffee.msg');
}

test('.msg: subject, words and sent date from one dragged-out email', async () => {
  const e = await parseMsgFile(msgFile({ subject: 'Coffee Tuesday?', body: `${LONG}\n\nMike`, date: WHEN }));
  assert.equal(e.subject, 'Coffee Tuesday?');
  assert.match(e.body, /^Hey Lee, great seeing you/);
  assert.equal(e.date, WHEN);
});

test('.msg: a long body (stored outside the small-stream area) is read and capped', async () => {
  const e = await parseMsgFile(msgFile({ subject: 'Pricing', body: `${LONG} `.repeat(30), date: WHEN }));
  assert.ok(e.body.length <= 801);
  assert.match(e.body, /^Hey Lee/);
});

test('.msg: automatic mail is skipped', async () => {
  assert.equal(await parseMsgFile(msgFile({ subject: 'Automatic reply: out of office', body: LONG, date: WHEN })), null);
});

// ─── .olm ────────────────────────────────────────────────────────────────────

function zip(files) {
  const locals = [], centrals = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), data = deflateRawSync(Buffer.from(f.data));
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(Buffer.byteLength(f.data), 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(Buffer.byteLength(f.data), 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(off, 42);
    locals.push(lh, name, data); centrals.push(ch, name);
    off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const olmXml = (subject, html, from = 'mike@ilcstudios.com') => `<?xml version="1.0" encoding="UTF-8"?><emails><email>
<OPFMessageCopySubject>${subject}</OPFMessageCopySubject><OPFMessageCopySentTime>2026-05-01T14:22:00Z</OPFMessageCopySentTime>
<OPFMessageCopyFromAddresses><emailAddress OPFContactEmailAddressAddress="${from}" OPFContactEmailAddressName="Mike"/></OPFMessageCopyFromAddresses>
<OPFMessageCopyBody>${html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</OPFMessageCopyBody></email></emails>`;

test('.olm: reads the XML of one message, HTML body turned to words', () => {
  const e = parseOlmMessage(olmXml('Lunch &amp; learn', `<html><body><p>${LONG}</p><div>Mike</div></body></html>`));
  assert.equal(e.subject, 'Lunch & learn');
  assert.match(e.body, /^Hey Lee/);
  assert.equal(e.date, Date.parse('2026-05-01T14:22:00Z'));
  assert.equal(e.from, 'mike@ilcstudios.com');
});

test('.olm: only the Sent Items folder is kept', async () => {
  const file = new File([zip([
    { name: 'Accounts/mike@ilcstudios.com/com.microsoft.__Messages/Sent Items/message_00001.xml', data: olmXml('Fixture package', `<p>${LONG}</p>`) },
    { name: 'Accounts/mike@ilcstudios.com/com.microsoft.__Messages/Inbox/message_00002.xml', data: olmXml('Their email', `<p>${LONG} from them</p>`, 'lee@x.com') },
    { name: 'Accounts/mike@ilcstudios.com/com.microsoft.__Contacts/contact_1.xml', data: '<contacts/>' },
  ])], 'export.olm');
  const out = await extractOlmEmails(file, 'mike@ilcstudios.com', { max: 10 });
  assert.deepEqual(out.map(e => e.subject), ['Fixture package']);
  assert.equal(out[0].from, undefined);
});

// ─── .pst ────────────────────────────────────────────────────────────────────

const SCRAMBLE = (() => {  // the forward table, so the file is stored the way Outlook stores it
  const inv = pstUnpermute(Uint8Array.from({ length: 256 }, (_, i) => i));
  const fwd = new Uint8Array(256);
  inv.forEach((plain, stored) => { fwd[plain] = stored; });
  return fwd;
})();

/** A heap-on-node property context holding `props` [{id, type, bytes | value}]. */
function propertyContext(props) {
  const items = [];
  const add = b => { items.push(Buffer.from(b)); return items.length << 5; };
  const header = add(Buffer.alloc(8));          // filled in below, once the records exist
  const recs = Buffer.alloc(props.length * 8);
  [...props].sort((a, b) => a.id - b.id).forEach((p, i) => {
    recs.writeUInt16LE(p.id, i * 8); recs.writeUInt16LE(p.type, i * 8 + 2);
    recs.writeUInt32LE(p.value ?? add(p.bytes), i * 8 + 4);
  });
  const recHid = add(recs);
  items[0] = Buffer.from([0xB5, 2, 6, 0, ...new Uint8Array(new Uint32Array([recHid]).buffer)]);
  const starts = [12];
  for (const it of items) starts.push(starts[starts.length - 1] + it.length);
  const mapAt = starts[starts.length - 1] + (starts[starts.length - 1] % 2);
  const map = Buffer.alloc(4 + starts.length * 2);
  map.writeUInt16LE(items.length, 0);
  starts.forEach((s, i) => map.writeUInt16LE(s, 4 + i * 2));
  const hn = Buffer.alloc(12);
  hn.writeUInt16LE(mapAt, 0); hn[2] = 0xEC; hn[3] = 0xBC; hn.writeUInt32LE(header, 4);
  return Buffer.concat([hn, ...items, Buffer.alloc(mapAt - starts[starts.length - 1]), map]);
}
const str = (id, s) => ({ id, type: 0x001F, bytes: utf16(s) });
const time = (id, ms) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(filetime(ms)); return { id, type: 0x0040, bytes: b }; };

function pstFile() {
  const blocks = [];   // { bid, data, internal }
  let nextBid = 4;
  const block = (data, internal = false) => { const bid = internal ? nextBid + 2 : nextBid; nextBid += 4; blocks.push({ bid, data }); return bid; };
  const nodes = [];    // { nid, bidData, bidSub, parent }
  const folder = (nid, name) => nodes.push({ nid, bidData: block(propertyContext([str(0x3001, name)])), bidSub: 0, parent: 0x122 });
  folder(0x8022, 'Sent Items');
  folder(0x8042, 'Inbox');
  nodes.push({ nid: 0x200024, parent: 0x8022, bidSub: 0,
    bidData: block(propertyContext([str(0x0037, 'Fixture package'), str(0x1000, `${LONG}\n\nMike`), time(0x0039, WHEN)])) });
  // A body too big for the heap sits in a subnode, found through an internal (SLBLOCK) block.
  const bodyBid = block(utf16(`Second one. ${LONG}`));
  const sl = Buffer.alloc(8 + 24);
  sl[0] = 0x02; sl.writeUInt16LE(1, 2); sl.writeUInt32LE(0x3F, 8); sl.writeBigUInt64LE(BigInt(bodyBid), 16);
  nodes.push({ nid: 0x200044, parent: 0x8022, bidSub: block(sl, true),
    bidData: block(propertyContext([str(0x0037, 'Walkthrough'), { id: 0x1000, type: 0x001F, value: 0x3F }, time(0x0039, WHEN + 1000)])) });
  nodes.push({ nid: 0x200064, parent: 0x8042, bidSub: 0,
    bidData: block(propertyContext([str(0x0037, 'Inbound'), str(0x1000, `${LONG} not mine`)])) });

  const out = Buffer.alloc(0x3000 + blocks.reduce((n, b) => n + Math.ceil((b.data.length + 16) / 64) * 64, 0));
  out.write('!BDN', 0, 'latin1'); out.writeUInt16LE(23, 10); out[513] = 1;
  out.writeBigUInt64LE(0x1000n, 224); out.writeBigUInt64LE(0x1200n, 240);
  let at = 0x3000;
  const bbt = [];
  for (const b of blocks) {
    const data = b.bid % 4 === 2 ? b.data : Buffer.from(b.data.map(x => SCRAMBLE[x]));
    data.copy(out, at);
    bbt.push({ bid: b.bid, ib: at, cb: b.data.length });
    at += Math.ceil((b.data.length + 16) / 64) * 64;
  }
  const leaf = (ib, entries, cb, write, ptype) => {
    entries.forEach((e, i) => write(e, ib + i * cb));
    out[ib + 488] = entries.length; out[ib + 489] = Math.floor(488 / cb); out[ib + 490] = cb; out[ib + 491] = 0; out[ib + 496] = ptype;
  };
  leaf(0x1000, nodes.sort((a, b) => a.nid - b.nid), 32, (n, o) => {
    out.writeUInt32LE(n.nid, o); out.writeBigUInt64LE(BigInt(n.bidData), o + 8); out.writeBigUInt64LE(BigInt(n.bidSub), o + 16); out.writeUInt32LE(n.parent, o + 24);
  }, 0x81);
  leaf(0x1200, bbt, 24, (b, o) => {
    out.writeBigUInt64LE(BigInt(b.bid), o); out.writeBigUInt64LE(BigInt(b.ib), o + 8); out.writeUInt16LE(b.cb, o + 16); out.writeUInt16LE(2, o + 18);
  }, 0x80);
  return new File([out], 'mike.pst');
}

test('.pst: sent mail only, body from the heap or a subnode, newest first', async () => {
  const out = await extractPstEmails(pstFile(), '', { max: 10 });
  assert.deepEqual(out.map(e => e.subject), ['Walkthrough', 'Fixture package']);
  assert.match(out[0].body, /^Second one\. Hey Lee/);
  assert.match(out[1].body, /^Hey Lee, great seeing you/);
  assert.equal(out[1].date, WHEN);
});

test('.pst: friendly refusals', async () => {
  await assert.rejects(extractPstEmails(new File([Buffer.alloc(600)], 'x.pst')), /not an Outlook \.pst/);
  const old = Buffer.alloc(600); old.write('!BDN', 0, 'latin1'); old.writeUInt16LE(14, 10);
  await assert.rejects(extractPstEmails(new File([old], 'x.pst')), /97-2002/);
});
