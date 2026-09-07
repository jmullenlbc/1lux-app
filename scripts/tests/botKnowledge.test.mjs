// Bot Knowledge — the pure pieces.
//
// Only zip.js and text.js are tested here, and that is on purpose: they are the
// two files with no Prisma, no pdfjs and no `@/` alias, so the test runner can
// import them directly. Everything above them (extract.js, the routes) is glue
// around these two.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import { listZipEntries, readZipEntry } from '../../src/lib/botKnowledge/zip.js';
import {
  detectFileType, fileTypeLabel, docxXmlToText, tidyText,
  isUsefulText, searchTerms, scoreText, excerptAround, ACCEPT_ATTRIBUTE,
} from '../../src/lib/botKnowledge/text.js';

// ── A ZIP builder, so the reader is tested against real bytes ─────────────────
//
// Building the archive here rather than checking a .docx into the repo means the
// test proves the reader parses the format, not that it happens to survive one
// particular file.
function buildZip(files) {
  const locals  = [];
  const central = [];
  let offset = 0;

  for (const { name, content, store = false } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw     = Buffer.from(content, 'utf8');
    const data    = store ? raw : zlib.deflateRawSync(raw);
    const crc     = zlib.crc32 ? zlib.crc32(raw) : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);                    // version needed
    local.writeUInt16LE(0, 6);                     // flags
    local.writeUInt16LE(store ? 0 : 8, 8);         // method
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);          // compressed size
    local.writeUInt32LE(raw.length, 22);           // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);                    // extra length

    locals.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(store ? 0 : 8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);                       // extra
    cd.writeUInt16LE(0, 32);                       // comment
    cd.writeUInt32LE(offset, 42);                  // local header offset

    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }

  const localPart   = Buffer.concat(locals);
  const centralPart = Buffer.concat(central);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);

  return Buffer.concat([localPart, centralPart, eocd]);
}

// ── zip.js ────────────────────────────────────────────────────────────────────

test('zip: lists every entry by name', () => {
  const buf = buildZip([
    { name: '[Content_Types].xml', content: '<Types/>' },
    { name: 'word/document.xml',   content: '<w:document/>' },
  ]);
  assert.deepEqual(listZipEntries(buf).map(e => e.name), ['[Content_Types].xml', 'word/document.xml']);
});

test('zip: reads a deflated entry back byte for byte', () => {
  const xml = '<w:document><w:body><w:p><w:t>Lead times run 8 to 14 weeks.</w:t></w:p></w:body></w:document>';
  const buf = buildZip([{ name: 'a.txt', content: 'filler' }, { name: 'word/document.xml', content: xml }]);
  assert.equal(readZipEntry(buf, 'word/document.xml').toString('utf8'), xml);
});

test('zip: reads a stored (uncompressed) entry', () => {
  const buf = buildZip([{ name: 'word/document.xml', content: '<w:t>stored</w:t>', store: true }]);
  assert.equal(readZipEntry(buf, 'word/document.xml').toString('utf8'), '<w:t>stored</w:t>');
});

test('zip: a missing entry is null, not an error', () => {
  const buf = buildZip([{ name: 'word/document.xml', content: '<x/>' }]);
  assert.equal(readZipEntry(buf, 'xl/workbook.xml'), null);
});

test('zip: something that is not a ZIP fails loudly', () => {
  assert.throws(() => listZipEntries(Buffer.from('this is a plain text file, not an archive at all')), /Not a ZIP/);
});

// ── detectFileType ────────────────────────────────────────────────────────────

test('detectFileType: the five kinds Mike asked for', () => {
  assert.equal(detectFileType('Scope of work.docx'),        'word');
  assert.equal(detectFileType('Fixture schedule.xlsx'),     'excel');
  assert.equal(detectFileType('Lowell budget.pdf'),         'pdf');
  assert.equal(detectFileType('whiteboard.JPEG'),           'image');
  assert.equal(detectFileType('site photo.png'),            'image');
});

test('detectFileType: extension wins over a lying MIME type', () => {
  // Windows sends .docx as application/octet-stream more often than not.
  assert.equal(detectFileType('proposal.docx', 'application/octet-stream'), 'word');
});

test('detectFileType: falls back to MIME when there is no extension', () => {
  assert.equal(detectFileType('scan', 'image/png'),       'image');
  assert.equal(detectFileType('report', 'application/pdf'), 'pdf');
});

test('detectFileType: an unreadable type is null, so the route can refuse it', () => {
  assert.equal(detectFileType('drawings.zip'), null);
  assert.equal(detectFileType('model.rvt'),    null);
});

test('the file picker advertises the types the reader actually handles', () => {
  for (const ext of ['.pdf', '.docx', '.xlsx', '.png', '.jpeg']) {
    assert.ok(ACCEPT_ATTRIBUTE.includes(ext), `accept attribute is missing ${ext}`);
  }
});

test('fileTypeLabel is human, and never blank', () => {
  assert.equal(fileTypeLabel('excel'), 'Excel');
  assert.equal(fileTypeLabel('nonsense'), 'File');
});

// ── docxXmlToText ─────────────────────────────────────────────────────────────

test('docx: paragraphs become separate lines, not one wall of text', () => {
  const xml = '<w:body><w:p><w:r><w:t>First line.</w:t></w:r></w:p><w:p><w:r><w:t>Second line.</w:t></w:r></w:p></w:body>';
  assert.equal(docxXmlToText(xml), 'First line.\nSecond line.');
});

test('docx: tabs survive, because a Word table is tab-separated once flattened', () => {
  const xml = '<w:p><w:r><w:t>A1</w:t></w:r><w:r><w:tab/><w:t>B1</w:t></w:r></w:p>';
  assert.equal(docxXmlToText(xml), 'A1\tB1');
});

test('docx: line breaks inside a paragraph are kept', () => {
  assert.equal(docxXmlToText('<w:p><w:t>one</w:t><w:br/><w:t>two</w:t></w:p>'), 'one\ntwo');
});

test('docx: entities decode once, not twice', () => {
  // "&amp;lt;" is a literal "&lt;" in the document. Decoding &amp; first would
  // turn it into a "<" that was never there.
  assert.equal(docxXmlToText('<w:t>Smith &amp;amp; Jones</w:t>'), 'Smith &amp; Jones');
  assert.equal(docxXmlToText('<w:t>a &amp; b</w:t>'),             'a & b');
  assert.equal(docxXmlToText('<w:t>5 &lt; 10</w:t>'),             '5 < 10');
});

test('docx: empty input is an empty string, never a crash', () => {
  assert.equal(docxXmlToText(''),        '');
  assert.equal(docxXmlToText(null),      '');
  assert.equal(docxXmlToText(undefined), '');
});

// ── tidyText / isUsefulText ───────────────────────────────────────────────────

test('tidyText collapses runaway spacing but keeps paragraph breaks', () => {
  assert.equal(tidyText('a     b\n\n\n\nc  \n  '), 'a b\n\nc');
});

test('a file that produced almost nothing counts as a failure', () => {
  assert.equal(isUsefulText(''),                     false);
  assert.equal(isUsefulText('   \n  '),              false);
  assert.equal(isUsefulText('page 1'),               false);
  assert.ok(isUsefulText('Custom fixture lead times typically run 8 to 14 weeks.'));
});

// ── searchTerms / scoreText ───────────────────────────────────────────────────

test('searchTerms drops filler and very short words', () => {
  assert.deepEqual(searchTerms('What are the lead times for custom fixtures?'),
    ['lead', 'times', 'custom', 'fixtures']);
});

test('searchTerms keeps money and percentages intact', () => {
  assert.deepEqual(searchTerms('margin 23% at $180 gross'), ['margin', '23%', '$180', 'gross']);
});

test('searchTerms on nothing is an empty list, not a crash', () => {
  assert.deepEqual(searchTerms(''),        []);
  assert.deepEqual(searchTerms(null),      []);
  assert.deepEqual(searchTerms('a of  '),  []);
});

test('scoreText: a keyword hit outranks the same word buried in a long body', () => {
  const terms = searchTerms('breezeway stair package');
  const keyworded = scoreText({ title: 'x', keywords: 'breezeway stair package', body: '' }, terms);
  const buried    = scoreText({ title: 'x', keywords: '', body: 'breezeway stair package '.repeat(40) }, terms);
  assert.ok(keyworded > buried, `keyword ${keyworded} should outrank body ${buried}`);
});

test('scoreText: matching every word beats matching one word repeatedly', () => {
  const terms = searchTerms('stair landing pricing');
  const all = scoreText({ title: 'Stair landing pricing', keywords: '', body: '' }, terms);
  const one = scoreText({ title: 'Stair stair stair stair', keywords: '', body: '' }, terms);
  assert.ok(all > one, `all-terms ${all} should beat one-term ${one}`);
});

test('scoreText: no match scores zero, so it can be filtered out', () => {
  assert.equal(scoreText({ title: 'Hotel keys', keywords: '', body: 'nothing here' }, searchTerms('breezeway')), 0);
});

test('scoreText: no query scores zero rather than ranking noise', () => {
  assert.equal(scoreText({ title: 'anything', keywords: 'anything', body: 'anything' }, []), 0);
});

// ── excerptAround ─────────────────────────────────────────────────────────────

test('excerpt: pulls the part of a long document that is about the query', () => {
  const body = `${'filler sentence. '.repeat(200)}The breezeway stair package is $387 per open stair.${' trailing. '.repeat(200)}`;
  const out  = excerptAround(body, searchTerms('breezeway stair package'), 200);
  assert.ok(out.includes('breezeway stair package'), 'the matching sentence should be in the excerpt');
  assert.ok(out.length < body.length, 'the excerpt should be shorter than the document');
});

test('excerpt: a short document comes back whole, with no ellipsis', () => {
  const body = 'Fans are $180 gross at conceptual.';
  assert.equal(excerptAround(body, searchTerms('fans'), 400), body);
});

test('excerpt: no match falls back to the opening, marked as truncated', () => {
  const body = 'x'.repeat(2000);
  const out  = excerptAround(body, searchTerms('nothingmatcheshere'), 100);
  assert.ok(out.endsWith('…'));
  assert.ok(out.length < body.length);
});

test('excerpt: empty body is an empty string', () => {
  assert.equal(excerptAround('', searchTerms('anything'), 100), '');
});
