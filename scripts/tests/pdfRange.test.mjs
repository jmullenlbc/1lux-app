/**
 * Tests for src/lib/pdfRange.js, reading a drawing set by byte range instead
 * of pulling the whole file into memory.
 * Run: node --test scripts/tests/pdfRange.test.mjs
 *
 * Why this file exists, in order of how much each failure would cost:
 *
 *   1. A 400 MB set must never be pulled across in one go. If this path quietly
 *      buffers, the Lambda dies on exactly the big uploads it was raised for.
 *   2. The reader must stay LAZY. pdfjs will happily stream a whole file in the
 *      background unless told not to, which would undo the point while every
 *      test still passed.
 *   3. A failed range fetch must not take the process down. pdfjs calls
 *      requestDataRange fire-and-forget, so a rejected promise there is an
 *      unhandled rejection, not a caught error.
 *   4. The brakes must actually stop a scan. The clock alone does not bound
 *      memory: a fast connection reads a whole set well inside the time budget
 *      and then falls over.
 *
 * Corrected 2026-08-22. This file used to assert that reading cost tracks the
 * pages touched and not the file size, and called that "the property the 400 MB
 * cap rests on". Measured on a real 231 MB set, it is not true: opening
 * reserves the whole file length, and parsing costs 2-3x the bytes fetched, so
 * a scan peaked at 827 MB of real memory having fetched 108 MB. What the cap
 * actually rests on is the memory ceiling below, which measures the process
 * instead of predicting it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openRangedPdf, RANGE_THRESHOLD_BYTES, SCAN_BYTE_BUDGET, memoryCeilingBytes }
  from '../../src/lib/pdfRange.js';
import { extractPdfPages } from '../../src/lib/drawingExtract.js';

// ── A real PDF, built here ──────────────────────────────────────────────────
// There are no PDF fixtures in the repo and no PDF-writing library installed,
// so the test writes its own: a valid multi-page file with a text layer and a
// correct cross-reference table. `padBytes` inflates each page's content stream
// so that fetching a page costs measurable bytes, without that every page is a
// few hundred bytes and the budget tests would prove nothing.
function makePdf(pageTexts, padBytes = 0) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };

  const catalogNo = 1, pagesNo = 2, fontNo = 3;
  objs.push('', '', '');                   // reserve 1..3; filled in below
  objs[fontNo - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  const kids = [];
  for (const text of pageTexts) {
    // Trailing spaces are legal filler inside a content stream.
    const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET` + ' '.repeat(padBytes);
    const contentNo = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageNo = add(
      `<< /Type /Page /Parent ${pagesNo} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fontNo} 0 R >> >> /Contents ${contentNo} 0 R >>`
    );
    kids.push(`${pageNo} 0 R`);
  }

  objs[catalogNo - 1] = `<< /Type /Catalog /Pages ${pagesNo} 0 R >>`;
  objs[pagesNo - 1]   = `<< /Type /Pages /Kids [ ${kids.join(' ')} ] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogNo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Buffer.from(out, 'latin1');
}

// Serves a buffer the way S3 GetObject with a Range header would, and keeps a
// tally so the tests can see what a read actually cost.
function serve(buf) {
  const log = { reads: 0, bytes: 0 };
  return {
    log,
    size: buf.length,
    fetchRange: async (begin, end) => {
      log.reads += 1;
      log.bytes += end - begin;
      return new Uint8Array(buf.subarray(begin, end));
    },
  };
}

const PAGES = ['G0.00 COVER SHEET', 'G0.02 GROSS BUILDING AREA', 'AS1.10 ARCHITECTURAL SITE PLAN',
               'A0.10 UNIT MATRIX', 'A2.01 FLOOR PLAN LEVEL 1', 'L1.01 LANDSCAPE PLAN'];

// ── The reader works at all ─────────────────────────────────────────────────

test('opens a PDF it never holds, and reads the right pages', async () => {
  const { size, fetchRange } = serve(makePdf(PAGES));
  const opened = await openRangedPdf({ size, fetchRange });
  assert.equal(opened.doc.numPages, PAGES.length);

  const scan = await extractPdfPages(opened.doc);
  assert.equal(scan.scannedPages, PAGES.length);
  assert.match(scan.pages[2].text, /ARCHITECTURAL SITE PLAN/);
  await opened.destroy();
});

// pdfjs fetches in 64 KB chunks, so a fixture has to be comfortably larger than
// that before "lazy" and "eager" look any different. At this padding the file is
// a few megabytes across dozens of chunks, small enough to stay a fast test,
// big enough that reading only part of it is visible.
const FAT = 400_000;

test('opening does not drag the whole file across', async () => {
  // The regression this catches: pdfjs streams the entire file in the
  // background unless disableAutoFetch AND disableStream are both set. Drop
  // either one and every other test here still passes while the 400 MB cap
  // quietly becomes a 400 MB memory allocation.
  const { size, fetchRange, log } = serve(makePdf(PAGES, FAT));
  const opened = await openRangedPdf({ size, fetchRange });
  assert.ok(log.bytes < size / 2,
    `opening pulled ${log.bytes} of ${size} bytes. It should read the index, not the file`);
  await opened.destroy();
});

test('reading one page fetches one page, not the set', async () => {
  // BYTES FETCHED tracks the pages touched. Note the careful wording: bytes
  // fetched is not the same as bytes resident, and this test does not claim it
  // is, see the correction at the top of the file.
  const { size, fetchRange } = serve(makePdf(PAGES, FAT));
  const opened = await openRangedPdf({ size, fetchRange });
  const scan = await extractPdfPages(opened.doc, { maxPages: 1 });
  assert.equal(scan.scannedPages, 1);
  assert.ok(opened.stats.bytesFetched < size / 2,
    `one page cost ${opened.stats.bytesFetched} of ${size} bytes`);
  await opened.destroy();
});

test('the byte tally is live, so a caller can watch what a read is costing', async () => {
  const { size, fetchRange } = serve(makePdf(PAGES, FAT));
  const opened = await openRangedPdf({ size, fetchRange });
  const atOpen = opened.stats.bytesFetched;
  await extractPdfPages(opened.doc);
  assert.ok(opened.stats.bytesFetched > atOpen, 'reading pages must show up in the tally');
  assert.ok(opened.stats.requests > 1, 'a ranged read is many small fetches, not one big one');
  await opened.destroy();
});

// ── The brakes ─────────────────────────────────────────────────────────────

test('overBudget flips once the read has pulled more than it should hold', async () => {
  const { size, fetchRange } = serve(makePdf(PAGES, FAT));
  const opened = await openRangedPdf({ size, fetchRange });
  assert.equal(opened.overBudget(), false, 'a small file is nowhere near the real budget');
  assert.equal(opened.overBudget(0), true, 'any read at all is over a zero budget');
  await opened.destroy();
});

test('a scan stops when the byte budget runs out, and says so', async () => {
  // Memory, not time, is what kills the Lambda on a 400 MB set. Without a brake
  // that is not a clock, a fast connection reads the whole set well inside the
  // time budget and then falls over.
  const { size, fetchRange } = serve(makePdf(PAGES, 60_000));
  const opened = await openRangedPdf({ size, fetchRange });
  const scan = await extractPdfPages(opened.doc, {
    shouldStop: () => opened.stats.bytesFetched > 20_000,
  });
  assert.ok(scan.scannedPages < PAGES.length, `stopped at ${scan.scannedPages} of ${PAGES.length}`);
  assert.equal(scan.stoppedEarly, true, 'a short read must announce itself, not pass as complete');
  await opened.destroy();
});

test('a scan that fits the budget is not cut short', async () => {
  const { size, fetchRange } = serve(makePdf(PAGES));
  const opened = await openRangedPdf({ size, fetchRange });
  const scan = await extractPdfPages(opened.doc, { shouldStop: opened.overBudget });
  assert.equal(scan.scannedPages, PAGES.length);
  await opened.destroy();
});

test('the budget leaves room under a Lambda and sits above the buffered path', () => {
  assert.ok(SCAN_BYTE_BUDGET > RANGE_THRESHOLD_BYTES,
    'a file too big to buffer must still get a real scan budget');
  assert.ok(SCAN_BYTE_BUDGET <= 128 * 1024 * 1024,
    'headroom: the budget is what stands between a big set and an out-of-memory kill');
});

// ── The memory ceiling, the brake the 400 MB cap actually rests on ─────────

test('the ceiling follows the box it is running on', () => {
  // Lambda publishes its own memory size, so the brake does not have to be
  // guessed and does not go stale if Amplify is ever reconfigured.
  const before = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
  const beforeOverride = process.env.PDF_SCAN_MEMORY_CEILING_MB;
  try {
    delete process.env.PDF_SCAN_MEMORY_CEILING_MB;

    delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
    const local = memoryCeilingBytes();
    assert.ok(local > 0 && local <= 512 * 1024 * 1024,
      'off Lambda the stand-in must be tight enough that a dry run tells the truth');

    process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '512';
    const small = memoryCeilingBytes();
    process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '1769';
    const big = memoryCeilingBytes();
    assert.ok(big > small, 'a bigger Lambda must buy a bigger read, not the same one');
    assert.ok(small < 512 * 1024 * 1024,
      'the ceiling must leave room for Next.js itself and the render that follows');

    process.env.PDF_SCAN_MEMORY_CEILING_MB = '64';
    assert.equal(memoryCeilingBytes(), 64 * 1024 * 1024,
      'an explicit override must win, so a bad Lambda reading is fixable without a deploy');
  } finally {
    if (before === undefined) delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
    else process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = before;
    if (beforeOverride === undefined) delete process.env.PDF_SCAN_MEMORY_CEILING_MB;
    else process.env.PDF_SCAN_MEMORY_CEILING_MB = beforeOverride;
  }
});

test('a read that crosses the ceiling stops, even though it has fetched almost nothing', async () => {
  // The regression this catches is the one that started all of this: a byte
  // budget with plenty of room left while real memory is already over the line.
  // A 1 MB ceiling puts every process over it, so the scan must stop on memory
  // alone with the byte budget untouched.
  const before = process.env.PDF_SCAN_MEMORY_CEILING_MB;
  process.env.PDF_SCAN_MEMORY_CEILING_MB = '1';
  try {
    const { size, fetchRange } = serve(makePdf(PAGES, FAT));
    const opened = await openRangedPdf({ size, fetchRange });
    assert.ok(opened.stats.bytesFetched < SCAN_BYTE_BUDGET,
      'this fixture must be nowhere near the byte budget, or the test proves nothing');
    assert.equal(opened.overBudget(), true, 'over the memory ceiling must read as over budget');

    const scan = await extractPdfPages(opened.doc, { shouldStop: opened.overBudget });
    // 2026-09-15: one bounded page is the floor, not zero. The ceiling counts
    // baseline process memory, so a big set can be "over" the moment it is
    // opened, and a read of zero pages was being judged "no text layer"
    // (Lone Tree ARCH). The brake takes hold right after page 1.
    assert.equal(scan.scannedPages, 1, 'a read already over the ceiling reads exactly the first page');
    assert.equal(scan.braked, true, 'and is finished, not paused');
    assert.equal(scan.nextPage, null);
    assert.equal(scan.stoppedEarly, true, 'a short read must announce itself, not pass as complete');
    await opened.destroy();
  } finally {
    if (before === undefined) delete process.env.PDF_SCAN_MEMORY_CEILING_MB;
    else process.env.PDF_SCAN_MEMORY_CEILING_MB = before;
  }
});

test('the brake stays on once it has fired', async () => {
  // Memory falls again the moment V8 decides to collect. A brake that releases
  // itself because a garbage collection happened to land at the right moment
  // would let a read that is already in trouble carry on.
  const { size, fetchRange } = serve(makePdf(PAGES, FAT));
  const before = process.env.PDF_SCAN_MEMORY_CEILING_MB;
  process.env.PDF_SCAN_MEMORY_CEILING_MB = '1';
  let opened;
  try {
    opened = await openRangedPdf({ size, fetchRange });
    assert.equal(opened.overBudget(), true);
  } finally {
    if (before === undefined) delete process.env.PDF_SCAN_MEMORY_CEILING_MB;
    else process.env.PDF_SCAN_MEMORY_CEILING_MB = before;
  }
  assert.equal(opened.overBudget(), true,
    'raising the ceiling afterwards must not un-apply a brake that already fired');
  await opened.destroy();
});

test('a read reports the peak memory it reached, so a dry run can be believed', async () => {
  const { size, fetchRange } = serve(makePdf(PAGES, FAT));
  const opened = await openRangedPdf({ size, fetchRange });
  await extractPdfPages(opened.doc);
  assert.ok(opened.stats.peakRss > 0, 'peak memory must be measured, not assumed');
  assert.ok(opened.stats.ceiling > 0,
    'a peak means nothing without the ceiling it was measured against');
  await opened.destroy();
});

// ── Failure must stay contained ─────────────────────────────────────────────

test('a range fetch that fails rejects the open instead of crashing the process', async () => {
  // pdfjs calls requestDataRange fire-and-forget. A rejected promise inside it
  // is an unhandled rejection, which on a Lambda takes the whole invocation
  // down with no error a visitor could ever be shown.
  const { size } = serve(makePdf(PAGES));
  let unhandled = null;
  const catchIt = (e) => { unhandled = e; };
  process.on('unhandledRejection', catchIt);
  try {
    await assert.rejects(openRangedPdf({
      size,
      fetchRange: async () => { throw new Error('S3 said no'); },
    }));
  } finally {
    // Give any stray rejection a turn of the loop to surface before we look.
    await new Promise(r => setImmediate(r));
    process.off('unhandledRejection', catchIt);
  }
  assert.equal(unhandled, null, `an unhandled rejection escaped: ${unhandled?.message}`);
});

test('openRangedPdf refuses arguments it cannot work with', async () => {
  const fetchRange = async () => new Uint8Array(0);
  await assert.rejects(() => openRangedPdf({ size: 0, fetchRange }), /size/);
  await assert.rejects(() => openRangedPdf({ size: NaN, fetchRange }), /size/);
  await assert.rejects(() => openRangedPdf({ size: 100 }), /fetchRange/);
});
