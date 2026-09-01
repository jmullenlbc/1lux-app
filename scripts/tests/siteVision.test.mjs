/**
 * Cross-check tests for vision site-data extraction.
 *
 * These encode a REAL measured failure. Reading the hand-lettered Beckett
 * Firestone SITE DATA block at 1600px, the model returned totalUnits 264 while
 * its own bed mix summed to 319 — a plausible, wrong number that would have
 * flowed straight into a budget. Raising the render to 2200px fixed the read;
 * these checks are the net for when it happens anyway.
 *
 * Run: node --test scripts/tests/siteVision.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSiteData, mergeSiteData } from '../../src/lib/siteVision.js';

const base = {
  lotAcres: null, totalUnits: null, bedMix: {},
  parkingProvided: null, parkingRequired: null, confidence: 0.9,
};
const warn = (d, field) => (validateSiteData(d).warnings || []).some(w => w.field === field);

test('clean data passes with confidence intact', () => {
  const r = validateSiteData({
    ...base, totalUnits: 324,
    bedMix: { studio: null, oneBed: 162, twoBed: 118, threeBed: 44 },
    parkingProvided: 680, parkingRequired: 675,
  });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.confidence, 0.9, 'no warnings means no downgrade');
});

test('THE REAL FAILURE: bed mix disagreeing with total units is caught', () => {
  // Verbatim from the 1600px misread.
  const r = validateSiteData({
    ...base, totalUnits: 264,
    bedMix: { studio: null, oneBed: 162, twoBed: 113, threeBed: 44 }, // sums to 319
  });
  assert.ok(warn(r, 'totalUnits'), 'must flag the arithmetic disagreement');
  assert.match(r.warnings.find(w => w.field === 'totalUnits').message, /319/);
  assert.ok(r.confidence <= 0.45, 'confidence must be downgraded');
});

test('a warning never rewrites the number — a human decides', () => {
  const r = validateSiteData({
    ...base, totalUnits: 264,
    bedMix: { oneBed: 162, twoBed: 113, threeBed: 44 },
  });
  assert.equal(r.totalUnits, 264, 'reported value is preserved as read');
  assert.equal(r.bedMix.twoBed, 113);
});

test('partial bed mix still cross-checks against the total', () => {
  const r = validateSiteData({ ...base, totalUnits: 300, bedMix: { oneBed: 100, twoBed: 100 } });
  assert.ok(warn(r, 'totalUnits'));
});

test('a bed mix of all nulls cannot trigger a false alarm', () => {
  const r = validateSiteData({
    ...base, totalUnits: 324,
    bedMix: { studio: null, oneBed: null, twoBed: null, threeBed: null },
  });
  assert.ok(!warn(r, 'totalUnits'), 'no mix data means nothing to contradict');
});

test('provided parking below required is flagged', () => {
  assert.ok(warn({ ...base, parkingProvided: 600, parkingRequired: 675 }, 'parkingProvided'));
});

test('provided at or above required is fine', () => {
  assert.ok(!warn({ ...base, parkingProvided: 680, parkingRequired: 675 }, 'parkingProvided'));
  assert.ok(!warn({ ...base, parkingProvided: 675, parkingRequired: 675 }, 'parkingProvided'));
});

test('implausible stalls-per-unit ratios are flagged in both directions', () => {
  assert.ok(warn({ ...base, parkingProvided: 68, totalUnits: 324 }, 'parkingProvided'), 'a dropped digit');
  assert.ok(warn({ ...base, parkingProvided: 6800, totalUnits: 324 }, 'parkingProvided'), 'an extra digit');
});

test('a normal parking ratio is not flagged', () => {
  for (const [prov, units] of [[680, 324], [324, 324], [500, 324]]) {
    assert.ok(!warn({ ...base, parkingProvided: prov, totalUnits: units }, 'parkingProvided'),
      `${prov}/${units} should be accepted`);
  }
});

test('acreage always carries a confirm warning', () => {
  // Misread at every resolution tested (16.56 / 16.86 / 16.56 vs a true 16.50),
  // so it is never presented as trustworthy on its own.
  assert.ok(warn({ ...base, lotAcres: 16.86 }, 'lotAcres'));
  assert.ok(!warn({ ...base, lotAcres: null }, 'lotAcres'), 'absent acreage needs no warning');
});

test('zero units cannot cause a divide-by-zero', () => {
  assert.doesNotThrow(() => validateSiteData({ ...base, totalUnits: 0, parkingProvided: 10 }));
});

test('missing bedMix entirely is safe', () => {
  assert.doesNotThrow(() => validateSiteData({ totalUnits: 324 }));
});

// ─── stitching one drawing's answer onto another's ──────────────────────────
//
// Reading two drawings in one request measured 29.4 seconds against a front
// door that hangs up at 30. So they are read one per request and merged as
// they arrive -- and a merge is a new way to be wrong: a blank on the second
// drawing must never wipe out a real number off the first.

test('the first drawing to answer a field is the one that stands', () => {
  const merged = mergeSiteData(
    { totalUnits: 250, lotAcres: null, bedMix: {}, confidence: 0.9 },
    { totalUnits: 12,  lotAcres: 14.2, bedMix: {}, confidence: 0.9 },
  );
  assert.strictEqual(merged.totalUnits, 250, 'a later sheet overwrote a real unit count');
  assert.strictEqual(merged.lotAcres, 14.2, 'a field only the later sheet had was dropped');
});

test('a blank on the second drawing never erases a number off the first', () => {
  const merged = mergeSiteData(
    { totalUnits: 250, parkingProvided: 400, bedMix: { oneBed: 132 }, confidence: 0.9 },
    { totalUnits: null, parkingProvided: null, bedMix: { oneBed: null }, confidence: 0.9 },
  );
  assert.strictEqual(merged.totalUnits, 250);
  assert.strictEqual(merged.parkingProvided, 400);
  assert.strictEqual(merged.bedMix.oneBed, 132);
});

test('the bed mix fills in field by field across drawings', () => {
  // The unit matrix carries the mix; the site plan carries the total. Neither
  // sheet has both, and the cross-checks need both together.
  const merged = mergeSiteData(
    { totalUnits: 250, bedMix: { oneBed: 132, twoBed: null }, confidence: 0.9 },
    { totalUnits: null, bedMix: { oneBed: null, twoBed: 118 }, confidence: 0.9 },
  );
  assert.strictEqual(merged.bedMix.oneBed, 132);
  assert.strictEqual(merged.bedMix.twoBed, 118);
});

test('confidence is the LOWEST of what went in, not the latest', () => {
  const a = mergeSiteData({ totalUnits: 250, bedMix: {}, confidence: 0.9 }, { bedMix: {}, confidence: 0.4 });
  assert.strictEqual(a.confidence, 0.4, 'a shaky drawing was averaged away');
  const b = mergeSiteData({ totalUnits: 250, bedMix: {}, confidence: 0.4 }, { bedMix: {}, confidence: 0.9 });
  assert.strictEqual(b.confidence, 0.4, 'a shaky first drawing was forgotten');
});

test('finding the site data block on ANY drawing counts as finding it', () => {
  const merged = mergeSiteData(
    { bedMix: {}, foundSiteDataBlock: false, confidence: 0.9 },
    { bedMix: {}, foundSiteDataBlock: true,  confidence: 0.9 },
  );
  assert.strictEqual(merged.foundSiteDataBlock, true);
});

test('the notes off each drawing are kept, labelled with the sheet they came off', () => {
  const merged = mergeSiteData(
    { bedMix: {}, notes: 'Unit total taken from the matrix.', confidence: 0.9 },
    { bedMix: {}, notes: 'No building count is printed.', confidence: 0.9 },
    7,
  );
  assert.match(merged.notes, /Unit total taken from the matrix\./);
  assert.match(merged.notes, /page 7/);
  assert.match(merged.notes, /No building count is printed\./);
});

test('the first drawing merges onto nothing without being changed', () => {
  const first = { totalUnits: 250, bedMix: { oneBed: 132 }, confidence: 0.9 };
  const merged = mergeSiteData(null, first, 3);
  assert.strictEqual(merged.totalUnits, 250);
  assert.strictEqual(merged.bedMix.oneBed, 132);
});

test('a drawing that read as nothing leaves the answer alone', () => {
  const acc = { totalUnits: 250, bedMix: { oneBed: 132 }, confidence: 0.9 };
  assert.strictEqual(mergeSiteData(acc, null), acc);
});

test('merging does not mutate the answer already in hand', () => {
  const acc = { totalUnits: 250, lotAcres: null, bedMix: { oneBed: 132, twoBed: null }, confidence: 0.9 };
  mergeSiteData(acc, { lotAcres: 14.2, bedMix: { twoBed: 118 }, confidence: 0.5 });
  assert.strictEqual(acc.lotAcres, null);
  assert.strictEqual(acc.bedMix.twoBed, null);
  assert.strictEqual(acc.confidence, 0.9);
});

test('the cross-checks run on the merged answer, not on each drawing alone', () => {
  // This is the point of merging before validating: a bed mix off the unit
  // matrix and a unit total off the site plan can only disagree once they are
  // in the same object. Apart, each sheet looks fine and the mismatch is lost.
  const merged = mergeSiteData(
    { totalUnits: 264, bedMix: {}, parkingProvided: null, parkingRequired: null, confidence: 0.9 },
    { totalUnits: null, bedMix: { oneBed: 162, twoBed: 113, threeBed: 44 }, confidence: 0.9 },
  );
  assert.ok((validateSiteData(merged).warnings || []).some(w => w.field === 'totalUnits'),
    'a unit total that disagrees with the mix on another sheet went unflagged');
});

// ─── the memory the drawing renderer gives back ─────────────────────────────
//
// A canvas keeps its pixels OUTSIDE JavaScript's memory, so the garbage
// collector -- which decides when to tidy by looking at how much JavaScript
// memory is in use -- sees a tiny handle and feels no urgency, while a
// full-size image sits there unreleased.
//
// That is not a theoretical worry. Cutting the fourteen close-ups of the index
// on Mike's 158-sheet Lowell set ran the process to 2,015 MB and the server
// died mid-read with no message at all. Freeing each one as it is finished
// with peaks at 406 MB instead. These tests hold that shut.
//
// The sheet below is blank on purpose: the leak is in the canvases, whose size
// comes from the PAPER, not from what is drawn on it. A 36x24 sheet is a 36x24
// sheet whether or not there are any lines on it.

/** The smallest thing that is legitimately a PDF: one page, no ink. */
function blankSheetPdf({ widthPt = 2592, heightPt = 1728, pages = 1 } = {}) {
  const objs = [];
  const kids = [];
  for (let i = 0; i < pages; i++) kids.push(`${4 + i} 0 R`);
  objs[1] = '<</Type/Catalog/Pages 2 0 R>>';
  objs[2] = `<</Type/Pages/Kids[${kids.join(' ')}]/Count ${pages}>>`;
  objs[3] = '<</Length 0>>\nstream\n\nendstream';
  for (let i = 0; i < pages; i++) {
    objs[4 + i] = `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${widthPt} ${heightPt}]`
      + '/Contents 3 0 R/Resources<</ProcSet[/PDF]>>>>';
  }

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${objs.length}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** Highest memory reached while fn runs, in MB above where it started. */
async function peakGrowthMb(fn) {
  const before = process.memoryUsage().rss;
  let peak = before;
  const watch = setInterval(() => {
    const r = process.memoryUsage().rss;
    if (r > peak) peak = r;
  }, 15);
  try {
    await fn();
  } finally {
    clearInterval(watch);
  }
  const after = process.memoryUsage().rss;
  return (Math.max(peak, after, before) - before) / 1e6;
}

// The real number with the bug present was ~1,600 MB of growth and ~70 MB
// without it. 600 is far enough above the healthy figure that ordinary noise
// cannot trip it, and far enough below the broken one that the bug cannot
// come back unnoticed.
const CROP_GROWTH_CEILING_MB = 600;

test('cutting a full index worth of close-ups does not eat the server', async () => {
  const { renderPdfCrops } = await import('../../src/lib/siteVision.js');
  const pdf = blankSheetPdf();

  // The same fourteen close-ups the Lowell index is cut into: two printed
  // columns, seven strips down each.
  const rects = [];
  for (let c = 0; c < 2; c++) {
    for (let r = 0; r < 7; r++) rects.push({ x: 0.05 + c * 0.19, y: 0.12 + r * 0.124, w: 0.185, h: 0.13 });
  }

  let crops;
  const grew = await peakGrowthMb(async () => { crops = await renderPdfCrops(pdf, { page: 1, rects }); });

  assert.strictEqual(crops.length, rects.length, 'a close-up went missing');
  for (const c of crops) {
    assert.ok(c.png.length > 100, 'a close-up came back empty - it was freed before it was read');
    assert.ok(c.width > 8 && c.height > 8);
  }
  assert.ok(grew < CROP_GROWTH_CEILING_MB,
    `cutting ${rects.length} close-ups grew memory by ${Math.round(grew)} MB (ceiling ${CROP_GROWTH_CEILING_MB} MB) - the canvases are not being given back`);
});

test('drawing several sheets in a row does not eat the server either', async () => {
  const { renderPdfPages } = await import('../../src/lib/siteVision.js');
  const pdf = blankSheetPdf({ pages: 6 });

  let out;
  const grew = await peakGrowthMb(async () => {
    out = await renderPdfPages(pdf, { pageNumbers: [1, 2, 3, 4, 5, 6], pages: 6, alsoJpeg: true });
  });

  assert.strictEqual(out.length, 6);
  for (const p of out) {
    assert.ok(p.png.length > 100, 'a sheet came back empty - it was freed before it was read');
    assert.ok(p.jpeg.length > 100, 'the keepable copy came back empty');
    assert.strictEqual(p.ptWidth, 2592, 'the sheet lost its paper size');
  }
  assert.ok(grew < CROP_GROWTH_CEILING_MB,
    `drawing 6 sheets grew memory by ${Math.round(grew)} MB (ceiling ${CROP_GROWTH_CEILING_MB} MB)`);
});

test('gross building SF merges like any other stated number', () => {
  // The site plan rarely states a building total; the area summary does. The
  // first sheet's blank must not block the second sheet's figure.
  const merged = mergeSiteData(
    { totalUnits: 300, grossSf: null, bedMix: {}, confidence: 0.8 },
    { grossSf: 299441, bedMix: {}, confidence: 0.7 },
  );
  assert.strictEqual(merged.grossSf, 299441, 'the area summary filled what the site plan left blank');
  assert.strictEqual(merged.totalUnits, 300);
});

// ── fitForVision: the picture must fit through the model's front desk ──────
// A plotted sheet re-encoded as PNG can exceed the API's per-image limit, and
// that rejection is deterministic — retries can't save it. These pin the fix.
import { fitForVision } from '../../src/lib/siteVision.js';
import { createCanvas } from '@napi-rs/canvas';

function noisyPng(edge) {
  // Random noise is PNG's worst case, which is exactly what a scan looks like
  // to the encoder. 2200px of it lands well over the cap.
  const canvas = createCanvas(edge, edge);
  const ctx = canvas.getContext('2d');
  const im = ctx.createImageData(edge, edge);
  let seed = 0x9e3779b9;
  for (let i = 0; i < im.data.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    im.data[i] = seed & 0xff;
  }
  ctx.putImageData(im, 0, 0);
  return canvas.toBuffer('image/png');
}

test('a small PNG passes through untouched', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex'); // tiny stand-in; size is all that matters here
  const out = await fitForVision(png);
  assert.equal(out.mediaType, 'image/png');
  assert.equal(out.data, png, 'must be the same buffer, no re-encode');
});

test('an oversized PNG comes back as a JPEG under the cap', async () => {
  const png = noisyPng(2200);
  assert.ok(png.length > 3.5 * 1024 * 1024, `test premise: noise PNG must exceed the cap (got ${png.length})`);
  const out = await fitForVision(png);
  assert.equal(out.mediaType, 'image/jpeg');
  assert.ok(out.data.length <= 3.5 * 1024 * 1024, `JPEG must fit under the cap (got ${out.data.length})`);
});

test('a stated figure disagreeing with its counted twin is warned, never rewritten', () => {
  const r = validateSiteData({
    ...base, totalUnits: 200,
    stories: 4, storiesCounted: 5,
    egressStairwells: 2, egressStairwellsCounted: 3,
    exitDoors: 6, exitDoorsCounted: 6,
  });
  assert.ok(warn(r, 'stories'), 'stories disagreement must warn');
  assert.ok(warn(r, 'egressStairwells'), 'stairwell disagreement must warn');
  assert.ok(!warn(r, 'exitDoors'), 'agreeing counts must NOT warn');
  assert.equal(r.stories, 4, 'stated value preserved');
  assert.equal(r.storiesCounted, 5, 'counted value preserved');
});

test('a counted figure with no stated twin cannot trigger a disagreement warning', () => {
  const r = validateSiteData({ ...base, totalUnits: 200, storiesCounted: 5, egressStairwellsCounted: 2 });
  assert.ok(!warn(r, 'stories'));
  assert.ok(!warn(r, 'egressStairwells'));
});
