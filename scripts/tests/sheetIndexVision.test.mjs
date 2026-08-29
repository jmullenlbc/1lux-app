/**
 * Tests for src/lib/sheetIndexVision.js — finding the sheets that matter in a
 * set that has no text in it at all.
 * Run: node --test scripts/tests/sheetIndexVision.test.mjs
 *
 * What these protect, in order of how much they would hurt:
 *
 *   1. A wrong page number is worse than no page number. If the offset is off
 *      by two, the read opens a sheet nobody chose and reports whatever numbers
 *      happen to be on it — and it looks exactly like a successful read. Every
 *      test here about offsets and bounds is about that one failure.
 *   2. Nothing the model returns is trusted. It is reading a stranger's drawing
 *      and can return anything at all; the shape has to survive that.
 *   3. Picks that fall outside the document must be DROPPED, not clamped. A
 *      clamped pick silently becomes page 1 or the last page — see (1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_VISION_PICKS, VISION_ROLE_ORDER, MAX_INDEX_TILES,
  normalizeSheetNumber, validateLocate, padBox, indexTiles, validateIndexRead,
  mergeIndexEntries, mergePicks, rowNear, planHunt, nextTileAfterBlank,
  positionOf, offsetFromSelf, mapPicksToPages, reanchor, landedRight,
} from '../../src/lib/sheetIndexVision.js';

/** A 36x24 inch sheet, in PDF points. The size these sets are plotted at. */
const PAGE = { pageW: 36 * 72, pageH: 24 * 72 };

// A miniature drawing index, shaped like a real one: general sheets first, then
// civil, then architectural. The cover lists itself as row 1.
const ENTRIES = [
  { sheetNumber: 'G0.01', title: 'COVER SHEET AND DRAWING INDEX' },
  { sheetNumber: 'G0.02', title: 'CODE SUMMARY AND BUILDING STATISTICS' },
  { sheetNumber: 'C2.1',  title: 'SITE PLAN' },
  { sheetNumber: 'C3.1',  title: 'GRADING PLAN' },
  { sheetNumber: 'A0.10', title: 'UNIT MATRIX' },
  { sheetNumber: 'A2.01', title: 'FLOOR PLAN LEVEL 1' },
];

const PICKS = { sitePlan: 'C2.1', areaSummary: 'G0.02', unitMatrix: 'A0.10' };

// ─── normalizeSheetNumber ───────────────────────────────────────────────────

test('sheet numbers compare loosely — punctuation and case do not matter', () => {
  assert.equal(normalizeSheetNumber('A-1.00'), normalizeSheetNumber('a1.00'));
  assert.equal(normalizeSheetNumber(' C2.1 '), 'C21');
  assert.equal(normalizeSheetNumber(''), null);
  assert.equal(normalizeSheetNumber(null), null);
  assert.equal(normalizeSheetNumber('---'), null);
});

// ─── validateIndexRead ──────────────────────────────────────────────────────

test('a reply of pure junk still produces a usable shape', () => {
  for (const junk of [null, {}, { entries: 'no' }, { entries: [1, 2, 3] }, { picks: 5 }]) {
    const out = validateIndexRead(junk);
    assert.ok(Array.isArray(out.entries), 'entries must always be an array');
    for (const role of VISION_ROLE_ORDER) assert.equal(out.picks[role], null);
  }
});

test('bare sheet numbers and {sheetNumber} objects mean the same thing', () => {
  const a = validateIndexRead({ entries: ['A1.00', 'A2.00'] });
  const b = validateIndexRead({ entries: [{ sheetNumber: 'A1.00' }, { sheetNumber: 'A2.00' }] });
  assert.deepEqual(a.entries.map(e => e.sheetNumber), b.entries.map(e => e.sheetNumber));
});

test('an illegible row is KEPT, because it holds a position', () => {
  // Dropping it would shift every sheet after it by one — which is how a read
  // lands on the wrong drawing and reports its numbers as the answer.
  const out = validateIndexRead({ entries: ['A1.00', '?', 'A3.00'] });
  assert.equal(out.entries.length, 3);
  assert.equal(positionOf(out.entries, 'A3.00'), 3);
});

test('rows with nothing at all in them are dropped', () => {
  const out = validateIndexRead({
    entries: [{ sheetNumber: 'A1.00', title: 'PLAN' }, { title: 'NO NUMBER' }, { sheetNumber: '  ' }],
  });
  assert.equal(out.entries.length, 1);
  assert.equal(out.entries[0].sheetNumber, 'A1.00');
});

test('a runaway reply is capped rather than passed straight through', () => {
  const many = Array.from({ length: 2000 }, (_, i) => ({ sheetNumber: `A${i}`, title: 'X' }));
  assert.ok(validateIndexRead({ entries: many }).entries.length <= 600);
});

test('a non-string pick is treated as no pick at all', () => {
  const out = validateIndexRead({ picks: { sitePlan: 12, areaSummary: 'A1', unitMatrix: null } });
  assert.equal(out.picks.sitePlan, null);
  assert.equal(out.picks.areaSummary, 'A1');
});

// ─── validateLocate ─────────────────────────────────────────────────────────

test('a located box comes back clamped inside the sheet', () => {
  const out = validateLocate(
    { imageIndex: 0, box: { x: 0.6, y: -0.1, w: 0.9, h: 0.5 }, selfSheetNumber: 'G0.01' },
    { imageCount: 2 });
  assert.equal(out.imageIndex, 0);
  assert.equal(out.box.y, 0);
  assert.ok(out.box.x + out.box.w <= 1.0001);
  assert.equal(out.selfSheetNumber, 'G0.01');
});

test('a box and an image number are both-or-neither', () => {
  // Half an answer here is not half useful: a box with no image to cut it from
  // would be applied to whichever sheet happened to be first.
  assert.equal(validateLocate({ imageIndex: 0, box: null }).box, null);
  assert.equal(validateLocate({ imageIndex: null, box: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }).imageIndex, null);
  assert.equal(validateLocate({ imageIndex: 5, box: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }, { imageCount: 2 }).box, null);
});

test('a sliver of a sheet is not an index', () => {
  assert.equal(validateLocate({ imageIndex: 0, box: { x: 0.5, y: 0.5, w: 0.001, h: 0.4 } }).box, null);
});

test('the self sheet number survives even when no index was found', () => {
  // It is the anchor. Losing it because the index was missed would cost the one
  // number that is still worth something.
  const out = validateLocate({ imageIndex: null, box: null, selfSheetNumber: 'G0.01' });
  assert.equal(out.selfSheetNumber, 'G0.01');
});

// ─── padBox / indexTiles ────────────────────────────────────────────────────

test('a located box is grown a little before it is cut up', () => {
  const p = padBox({ x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, 0.02);
  assert.ok(p.x < 0.5 && p.y < 0.5 && p.w > 0.2 && p.h > 0.2);
});

test('padding never runs off the edge of the sheet', () => {
  const p = padBox({ x: 0, y: 0, w: 1, h: 1 }, 0.05);
  assert.equal(p.x, 0);
  assert.ok(p.x + p.w <= 1.0001 && p.y + p.h <= 1.0001);
});

test('a tall index column is cut into more than one tile', () => {
  // 8 inches wide by 19 inches tall of an E-size sheet. At the resolution index
  // text needs, that cannot be one image.
  const tiles = indexTiles({ x: 0.6, y: 0.05, w: 8 / 36, h: 19 / 24 }, PAGE);
  assert.ok(tiles.length > 1, 'a 19-inch column in one tile would be unreadable');
  assert.ok(tiles.length <= MAX_INDEX_TILES);
});

test('the tile budget is never blown, however big the block is', () => {
  for (const box of [{ x: 0, y: 0, w: 1, h: 1 }, { x: 0.1, y: 0.05, w: 0.85, h: 0.9 }]) {
    assert.ok(indexTiles(box, PAGE).length <= MAX_INDEX_TILES);
  }
});

test('every tile stays on the sheet', () => {
  for (const box of [{ x: 0, y: 0, w: 1, h: 1 }, { x: 0.7, y: 0.6, w: 0.3, h: 0.4 }]) {
    for (const t of indexTiles(box, PAGE)) {
      assert.ok(t.x >= 0 && t.y >= 0, 'tile starts off the sheet');
      assert.ok(t.x + t.w <= 1.0001 && t.y + t.h <= 1.0001, 'tile runs off the sheet');
    }
  }
});

test('tiles reach the far edges of the block, so no row is missed', () => {
  const box = { x: 0.6, y: 0.05, w: 0.3, h: 0.9 };
  const tiles = indexTiles(box, PAGE);
  const bottom = Math.max(...tiles.map(t => t.y + t.h));
  const right = Math.max(...tiles.map(t => t.x + t.w));
  assert.ok(bottom >= box.y + box.h - 0.001, 'the bottom of the block is not covered');
  assert.ok(right >= box.x + box.w - 0.001, 'the right of the block is not covered');
});

test('tiles overlap, so a row split down the middle survives whole somewhere', () => {
  const tiles = indexTiles({ x: 0.6, y: 0.05, w: 8 / 36, h: 19 / 24 }, PAGE);
  const area = tiles.reduce((a, t) => a + t.w * t.h, 0);
  assert.ok(area > (8 / 36) * (19 / 24), 'tiles that only just meet can drop a row on the seam');
});

test('a small index block stays as one tile', () => {
  assert.equal(indexTiles({ x: 0.7, y: 0.1, w: 4 / 36, h: 3 / 24 }, PAGE).length, 1);
});

test('a tall index block is cut by INCHES OF PAPER, not by pixels', () => {
  // The cap is what keeps one request short enough to answer, and it is set in
  // inches because rows are printed at a size the paper decides. A block twice
  // the cap is two close-ups whatever resolution we draw it at.
  const short = indexTiles({ x: 0.7, y: 0.1, w: 4 / 36, h: 3 / 24 }, PAGE);
  const tall  = indexTiles({ x: 0.7, y: 0.1, w: 4 / 36, h: 7 / 24 }, PAGE);
  assert.equal(short.length, 1);
  assert.ok(tall.length >= 2, 'a seven-inch index block must not be read in one go');
  for (const t of tall) {
    assert.ok(t.h * 24 <= 3.5 + 0.5, `a close-up ${(t.h * 24).toFixed(1)}in tall carries too many rows`);
  }
});

test('no box, no page size, no tiles', () => {
  assert.deepEqual(indexTiles(null, PAGE), []);
  assert.deepEqual(indexTiles({ x: 0, y: 0, w: 0.5, h: 0.5 }, { pageW: 0, pageH: 0 }), []);
});

// ─── positionOf / offsetFromSelf ────────────────────────────────────────────

test('a sheet that is not in the index has no position', () => {
  assert.equal(positionOf(ENTRIES, 'Z9.99'), null);
  assert.equal(positionOf(ENTRIES, null), null);
  assert.equal(positionOf(ENTRIES, 'C2.1'), 3);
});

test('the index sheet anchors the whole mapping for free', () => {
  // The cover is row 1 of its own index and is PDF page 1: no front matter.
  assert.equal(offsetFromSelf({ entries: ENTRIES, selfSheetNumber: 'G0.01', selfPage: 1 }), 0);
  // Same set bound behind two unlisted pages: everything shifts by two.
  assert.equal(offsetFromSelf({ entries: ENTRIES, selfSheetNumber: 'G0.01', selfPage: 3 }), 2);
});

test('a cover that does not list itself gives no offset rather than a guess', () => {
  // Guessing zero here would look like success and read the wrong sheets.
  assert.equal(offsetFromSelf({ entries: ENTRIES, selfSheetNumber: null, selfPage: 1 }), null);
  assert.equal(offsetFromSelf({ entries: ENTRIES, selfSheetNumber: 'Q1.00', selfPage: 1 }), null);
});

// ─── mapPicksToPages ────────────────────────────────────────────────────────

test('picks become page numbers through the anchored offset', () => {
  const { targets } = mapPicksToPages({ entries: ENTRIES, picks: PICKS, offset: 2, totalPages: 50 });
  assert.equal(targets.length, MAX_VISION_PICKS);
  // Site plan first, because that is where the site data lives.
  assert.deepEqual(targets.map(t => t.role), ['sitePlan', 'areaSummary']);
  assert.equal(targets[0].page, 5);   // row 3 + offset 2
  assert.equal(targets[1].page, 4);   // row 2 + offset 2
});

test('no offset means no pages — never a fallback to the front of the set', () => {
  const { targets } = mapPicksToPages({ entries: ENTRIES, picks: PICKS, offset: null, totalPages: 50 });
  assert.equal(targets.length, 0);
});

test('a pick past the end of the document is dropped, not clamped', () => {
  // A progress set listing sheets it does not yet contain. Clamping would open
  // some innocent page and report its numbers as the site data.
  const { targets } = mapPicksToPages({ entries: ENTRIES, picks: PICKS, offset: 400, totalPages: 50 });
  assert.equal(targets.length, 0);
});

test('two roles landing on one page are not rendered twice', () => {
  const picks = { sitePlan: 'C2.1', areaSummary: 'C2.1', unitMatrix: 'A0.10' };
  const { targets } = mapPicksToPages({ entries: ENTRIES, picks, offset: 0, totalPages: 50 });
  assert.equal(new Set(targets.map(t => t.page)).size, targets.length);
  assert.deepEqual(targets.map(t => t.role), ['sitePlan', 'unitMatrix']);
});

test('a sheet number the model invented is skipped, and the next role fills in', () => {
  const picks = { sitePlan: 'X9.99', areaSummary: 'G0.02', unitMatrix: 'A0.10' };
  const { targets } = mapPicksToPages({ entries: ENTRIES, picks, offset: 0, totalPages: 50 });
  assert.deepEqual(targets.map(t => t.role), ['areaSummary', 'unitMatrix']);
});

test('an empty index yields nothing to open', () => {
  assert.equal(mapPicksToPages({ entries: [], picks: PICKS, offset: 0, totalPages: 50 }).targets.length, 0);
});

// ─── reanchor ───────────────────────────────────────────────────────────────

test('landing on the wrong sheet re-derives the offset from what was seen', () => {
  // Aimed at C2.1 (row 3) expecting page 3; the title block says G0.02 (row 2),
  // so the set is bound one ahead of its index and the real offset is 1.
  assert.equal(reanchor({ entries: ENTRIES, seenSheetNumber: 'G0.02', seenPage: 3 }), 1);
});

test('an unrecognised title block leaves the original mapping alone', () => {
  assert.equal(reanchor({ entries: ENTRIES, seenSheetNumber: 'ZZ9', seenPage: 3 }), null);
  assert.equal(reanchor({ entries: ENTRIES, seenSheetNumber: null, seenPage: 3 }), null);
});

test('the corrected offset actually moves the targets', () => {
  const before = mapPicksToPages({ entries: ENTRIES, picks: PICKS, offset: 0, totalPages: 50 });
  const fixed = reanchor({ entries: ENTRIES, seenSheetNumber: 'G0.02', seenPage: 3 });
  const after = mapPicksToPages({ entries: ENTRIES, picks: PICKS, offset: fixed, totalPages: 50 });
  assert.notDeepEqual(before.targets.map(t => t.page), after.targets.map(t => t.page));
  assert.equal(after.targets[0].page, 4); // C2.1 is row 3, offset 1
});

// ─── landedRight ────────────────────────────────────────────────────────────

test('a title block we could not read is not treated as a miss', () => {
  // Throwing away a good mapping because one corner was smudged would be worse
  // than the problem the check exists to catch.
  assert.equal(landedRight('C2.1', null), true);
  assert.equal(landedRight(null, 'C2.1'), true);
});

test('the same sheet written two ways still counts as landing right', () => {
  assert.equal(landedRight('C-2.1', 'c2.1'), true);
  assert.equal(landedRight('C2.1', 'C3.1'), false);
});

// ─── stitching the close-ups back together ──────────────────────────────────
//
// The index is transcribed one close-up at a time, because reading a 127-row
// index in one request took 32 seconds and the front door hangs up at 30. That
// bought us a new way to be wrong: the close-ups overlap, so the same row can
// arrive twice, and a row counted twice shifts every sheet after it onto the
// wrong page. These are about that seam.

const rows = (...ns) => ns.map(n => ({ sheetNumber: n, title: '' }));
const nums = es => es.map(e => e.sheetNumber);

test('the overlap between two close-ups is spliced out, not listed twice', () => {
  const a = rows('G0.01', 'G0.02', 'C2.1');
  const b = rows('G0.02', 'C2.1', 'A1.1', 'A1.2');
  assert.deepStrictEqual(nums(mergeIndexEntries(a, b)),
    ['G0.01', 'G0.02', 'C2.1', 'A1.1', 'A1.2']);
});

test('the LONGEST overlap wins, so a repeated sheet number does not fool it', () => {
  // A1.1 appears twice in the tail. Splicing on the short match would keep a
  // duplicate and push every later sheet one page along.
  const a = rows('A1.1', 'A2.1', 'A1.1', 'A2.2');
  const b = rows('A1.1', 'A2.2', 'A3.1');
  assert.deepStrictEqual(nums(mergeIndexEntries(a, b)), ['A1.1', 'A2.1', 'A1.1', 'A2.2', 'A3.1']);
});

test('no overlap at all just joins -- a row cut in half is dropped, not doubled', () => {
  const a = rows('G0.01', 'G0.02');
  const b = rows('C2.1', 'C3.1');
  assert.deepStrictEqual(nums(mergeIndexEntries(a, b)), ['G0.01', 'G0.02', 'C2.1', 'C3.1']);
});

test('two runs of illegible rows are not treated as an overlap', () => {
  // "?" matches "?" and always will. Lining the pieces up on nothing but
  // question marks throws away real rows on the strength of a guess.
  const a = rows('G0.01', '?', '?');
  const b = rows('?', '?', 'C2.1');
  assert.strictEqual(mergeIndexEntries(a, b).length, 6);
});

test('the same row printed differently in two close-ups still counts once', () => {
  // Spacing and case vary between reads of the same paper; the position is
  // what matters, and the position must not move.
  const a = rows('G0.01', 'a0-2.0 c');
  const b = rows('A0-2.0.C', 'C2.1');
  assert.strictEqual(mergeIndexEntries(a, b).length, 3);
});

test('an empty piece changes nothing', () => {
  const a = rows('G0.01', 'G0.02');
  assert.deepStrictEqual(nums(mergeIndexEntries(a, [])), ['G0.01', 'G0.02']);
  assert.deepStrictEqual(nums(mergeIndexEntries([], a)), ['G0.01', 'G0.02']);
  assert.deepStrictEqual(mergeIndexEntries([], []), []);
});

test('merging does not mutate what was already read', () => {
  const a = rows('G0.01');
  mergeIndexEntries(a, rows('G0.02'));
  assert.strictEqual(a.length, 1);
});

test('the first close-up to name a role is the one we keep', () => {
  // An index runs in discipline order, so the overall site plan is listed
  // before the enlarged and phased ones. Earliest answer = general drawing.
  const merged = mergePicks(
    { sitePlan: 'C2.1', areaSummary: null, unitMatrix: null },
    { sitePlan: 'C2.4', areaSummary: 'G0.02', unitMatrix: null },
  );
  assert.strictEqual(merged.sitePlan, 'C2.1', 'the enlarged site plan overwrote the real one');
  assert.strictEqual(merged.areaSummary, 'G0.02');
  assert.strictEqual(merged.unitMatrix, null);
});

test('picks merge cleanly from nothing, and always answer every role', () => {
  const merged = mergePicks(null, { sitePlan: 'C2.1' });
  assert.deepStrictEqual(Object.keys(merged).sort(), ['areaSummary', 'sitePlan', 'unitMatrix']);
  assert.strictEqual(merged.sitePlan, 'C2.1');
  assert.strictEqual(merged.unitMatrix, null);
});

test('a sheet number already read is never listed a second time', () => {
  // A loose locate box makes close-ups that cover the same rows twice. One run
  // came back with 208 rows for a 127-row index that way, and every extra row
  // pushes the sheets after it onto the wrong page.
  const a = rows('G0.01', 'G0.02', 'C2.1');
  const b = rows('X9.9', 'G0.02', 'A1.1');
  assert.deepStrictEqual(nums(mergeIndexEntries(a, b)),
    ['G0.01', 'G0.02', 'C2.1', 'X9.9', 'A1.1']);
});

test('illegible rows are exempt -- two of them are not the same sheet', () => {
  const merged = mergeIndexEntries(rows('G0.01', '?'), rows('X9.9', '?'));
  assert.strictEqual(merged.length, 4);
});

test('a close-up is capped shorter than it is wide, because height is rows', () => {
  // 6 inches wide by 24 tall: one column, several stacked close-ups. Rows are
  // seconds, and a request that runs long comes back as an empty 504.
  const tiles = indexTiles({ x: 0.7, y: 0.02, w: 6 / 36, h: 24 / 24 }, PAGE);
  assert.ok(tiles.length >= 3, 'a 24-inch column in two goes is too many rows per request');
  assert.ok(tiles.every(t => t.h < 0.4), 'each close-up must be a slice, not a half');
});

// ─── a close-up may never span two printed columns ──────────────────────────
//
// The position of a row in the transcript is what tells us which page to open.
// A horizontal strip across a two-column index shows the top of both columns,
// so the rows come back braided -- and on a real 127-row set they did, sending
// the picks two pages late. These pin the cut to the printed columns.

// Which printed column a close-up belongs to is decided by its middle: the
// pieces are allowed to graze past the gutter, just not to straddle it.
const inLeft = (t, gutter) => t.x + t.w / 2 < gutter;
const straddles = (t, gutter) => {
  const onEachSide = Math.min(gutter - t.x, t.x + t.w - gutter);
  return onEachSide > t.w * 0.15;
};

test('a two-column index is cut down the gutter, not across it', () => {
  // 8in wide, 12in tall, printed in two columns: the gutter is the middle.
  const box = { x: 0, y: 0, w: 8 / 34, h: 12 / 22 };
  const tiles = indexTiles(box, { pageW: 34 * 72, pageH: 22 * 72, columns: 2 });

  const gutter = box.x + box.w / 2;
  assert.ok(tiles.length >= 4, 'a 12-inch block should still be cut into strips');
  for (const t of tiles) {
    assert.ok(!straddles(t, gutter), `a close-up spanned the gutter: ${JSON.stringify(t)}`);
  }
});

test('the columns come out one whole column at a time, top to bottom', () => {
  // Column-major emission is the other half of it: reading all of column one
  // and then all of column two is what makes position mean printed order.
  const box = { x: 0, y: 0, w: 8 / 34, h: 12 / 22 };
  const tiles = indexTiles(box, { pageW: 34 * 72, pageH: 22 * 72, columns: 2 });
  const gutter = box.x + box.w / 2;

  const left = tiles.map(t => inLeft(t, gutter));
  const firstRight = left.indexOf(false);
  assert.ok(firstRight > 0, 'expected both columns to be covered');
  assert.ok(left.slice(0, firstRight).every(Boolean), 'the left column was interrupted');
  assert.ok(left.slice(firstRight).every(v => !v), 'the columns were interleaved');

  for (const half of [tiles.slice(0, firstRight), tiles.slice(firstRight)]) {
    for (let i = 1; i < half.length; i++) {
      assert.ok(half[i].y > half[i - 1].y, 'a column did not run top to bottom');
    }
  }
});

test('a single-column index is not split sideways for no reason', () => {
  // The fix must not cost close-ups on the ordinary case: one tall list is
  // still one column of strips.
  const box = { x: 0, y: 0, w: 5 / 34, h: 12 / 22 };
  const tiles = indexTiles(box, { pageW: 34 * 72, pageH: 22 * 72, columns: 1 });
  const xs = new Set(tiles.map(t => t.x.toFixed(4)));
  assert.strictEqual(xs.size, 1, 'a one-column index was cut sideways');
});

test('close-ups do not reach across a gutter into the next column', () => {
  // Sideways overlap saves a row cut down the middle -- but there is no row in
  // a gutter, and reaching over it drags the neighbour's first rows in, where
  // the duplicate check would keep them at the wrong position.
  const box = { x: 0.1, y: 0.1, w: 0.4, h: 0.5 };
  const tiles = indexTiles(box, { pageW: 34 * 72, pageH: 22 * 72, columns: 2 });
  const gutter = box.x + box.w / 2;
  const left = tiles.filter(t => inLeft(t, gutter));
  const bleed = Math.max(...left.map(t => t.x + t.w)) - gutter;
  assert.ok(bleed < 0.01, `close-ups reached ${bleed} of the page into the next column`);
});

test('the printed columns survive even when the tile budget is tight', () => {
  // Running out of budget may soften the close-ups; it may never put the
  // transcript back out of order.
  const box = { x: 0, y: 0, w: 0.9, h: 0.95 };
  const tiles = indexTiles(box, { pageW: 42 * 72, pageH: 30 * 72, columns: 3, maxTiles: 4 });
  const cuts = new Set(tiles.map(t => t.x.toFixed(4)));
  assert.ok(cuts.size >= 3, 'the printed columns were merged to save close-ups');
});

test('a locate answer that says nothing about columns is treated as one', () => {
  const v = validateLocate({ imageIndex: 0, box: { x: 0.1, y: 0.1, w: 0.3, h: 0.6 } });
  assert.strictEqual(v.columns, 1);
});

test('a nonsense column count is treated as one, not obeyed', () => {
  const box = { x: 0.1, y: 0.1, w: 0.3, h: 0.6 };
  for (const columns of [0, -2, 99, 2.5, null, 'two']) {
    const v = validateLocate({ imageIndex: 0, box, columns });
    assert.ok(v.columns >= 1 && v.columns <= 4, `columns came back as ${v.columns}`);
  }
  assert.strictEqual(validateLocate({ imageIndex: 0, box, columns: 2 }).columns, 2);
});

// ─── the blank bottom of a column ───────────────────────────────────────────
//
// An index fills its columns top to bottom, so the last one usually stops
// partway down. The close-ups are cut on a grid regardless, and each blank one
// costs a request and about five seconds of a stranger's wait. On Lowell that
// was five close-ups of nothing -- twenty seconds -- and these are about not
// paying it, without skipping a column that merely started blank.

const COLS = [0, 0, 0, 1, 1, 1];   // three close-ups down, two columns across

test('an empty close-up partway down a column skips the rest of that column', () => {
  // Blank at index 1, the middle of column 0: index 2 is blank paper too, so
  // the next thing worth reading is the top of column 1.
  assert.strictEqual(nextTileAfterBlank(COLS, 1), 3, 'it kept reading blank paper');
});

test('the LAST column running out ends the read', () => {
  // This is Lowell exactly: the list stops partway down the second column.
  assert.strictEqual(nextTileAfterBlank(COLS, 4), COLS.length);
  assert.strictEqual(nextTileAfterBlank(COLS, 5), COLS.length);
});

test('an empty close-up at the TOP of a column does not condemn the column', () => {
  // A located block padded a little high puts whitespace in the first piece.
  // Skipping the column on that basis throws away every sheet listed below it.
  assert.strictEqual(nextTileAfterBlank(COLS, 0), 1, 'column 0 lost to a blank header');
  assert.strictEqual(nextTileAfterBlank(COLS, 3), 4, 'column 1 lost to a blank header');
});

test('a read parked before columns were recorded just moves along', () => {
  // Older parked reads have no column list. Nothing to reason about, so read
  // the next one rather than guessing.
  assert.strictEqual(nextTileAfterBlank(undefined, 2), 3);
  assert.strictEqual(nextTileAfterBlank([], 0), 1);
});

test('every close-up says which printed column it came from, in reading order', () => {
  // The column is what makes the skip above safe, and the order is what makes
  // "the rest of this column" mean the pieces BELOW this one.
  const tiles = indexTiles({ x: 0.05, y: 0.1, w: 0.37, h: 0.86 },
    { pageW: 36 * 72, pageH: 24 * 72, columns: 2 });
  assert.ok(tiles.length >= 4);
  assert.strictEqual(tiles[0].col, 0);
  assert.strictEqual(tiles.at(-1).col, Math.max(...tiles.map(t => t.col)));
  for (let i = 1; i < tiles.length; i++) {
    assert.ok(tiles[i].col >= tiles[i - 1].col, 'the columns came back interleaved');
    if (tiles[i].col === tiles[i - 1].col) {
      assert.ok(tiles[i].y > tiles[i - 1].y, 'a column did not run top to bottom');
    }
  }
});

// ─── an index that does not list itself ─────────────────────────────────────

test('a cover that lists itself still anchors for free', () => {
  const entries = rows('A1.00', 'A1.01', 'A1.02');
  assert.strictEqual(offsetFromSelf({ entries, selfSheetNumber: 'A1.00', selfPage: 1 }), 0);
});

test('a cover that does NOT list itself gives no offset, rather than a wrong one', () => {
  // Lowell: the cover is A1.00 and the list starts at A1.01. Answering here
  // would send the read to a sheet nobody chose; the route goes and looks at a
  // real drawing instead.
  const entries = rows('A1.01', 'A1.02', 'A1.03');
  assert.strictEqual(offsetFromSelf({ entries, selfSheetNumber: 'A1.00', selfPage: 1 }), null);
});

test('reading a real sheet anchors the list the cover would not', () => {
  // Page 2 turns out to be A1.01, which is row 1. So row N is page N + 1.
  const entries = rows('A1.01', 'A1.02', 'A1.03');
  const offset = reanchor({ entries, seenSheetNumber: 'A1.01', seenPage: 2 });
  assert.strictEqual(offset, 1);
  const { targets } = mapPicksToPages({
    entries, picks: { sitePlan: 'A1.03' }, offset, totalPages: 158,
  });
  assert.deepStrictEqual(targets.map(t => t.page), [4]);
});

// ─── hunting sheets through a set the index lies about ──────────────────────
//
// Lowell: the cover lists 80 sheets, the set binds 158, and the site plan is
// plotted with no sheet number printed on it. Counting rows lands nowhere.
// These pin the hunt that replaces counting when the cover gives no anchor.

const IDX = [
  { sheetNumber: 'A1.01', title: 'SITE PLAN' },
  { sheetNumber: 'A1.03', title: 'BUILDING CODE DATA & UNIT MATRIX' },
  { sheetNumber: 'A1.04', title: 'BUILDING CODE INFORMATION' },
  { sheetNumber: 'A1.20', title: 'RATED ASSEMBLIES' },
  { sheetNumber: 'A2.00', title: 'UNIT PLAN A1' },
];

test('a listed sheet number places at its own row', () => {
  assert.strictEqual(rowNear(IDX, 'A1.03'), 2);
});

test('an unlisted number still places between its listed neighbours', () => {
  // A1.09 was added after the cover was drawn. It is not row anything, but it
  // is certainly after A1.04 and before A1.20, and that is enough to steer by.
  const r = rowNear(IDX, 'A1.09');
  assert.ok(r > 3 && r < 4, `placed at ${r}`);
});

test('a rider sheet (A1.04B) places just after its base sheet', () => {
  const r = rowNear(IDX, 'A1.04B');
  assert.ok(r > 3 && r < 4, `placed at ${r}`);
});

test('a number smaller than anything listed places before the first row', () => {
  // The cover numbers itself A1.00 and does not list itself.
  const r = rowNear(IDX, 'A1.00');
  assert.ok(r < 1, `placed at ${r}`);
});

test('a discipline the index has never heard of places nowhere', () => {
  assert.strictEqual(rowNear(IDX, 'CH.13'), null);
});

test('the hunt starts by looking in the middle of the set', () => {
  const { probePage, done } = planHunt({
    entries: IDX, picks: { sitePlan: 'A1.01' }, probes: {}, totalPages: 158,
  });
  assert.strictEqual(done, false);
  assert.ok(probePage > 1 && probePage < 158, `looked at ${probePage}`);
});

test('a corner that reads exactly the wanted sheet ends the hunt for it', () => {
  const { targets, done } = planHunt({
    entries: IDX, picks: { areaSummary: 'A1.03' }, probes: { 4: 'A1.03' }, totalPages: 158,
  });
  assert.strictEqual(done, true);
  assert.deepStrictEqual(targets.map(t => [t.sheetNumber, t.page]), [['A1.03', 4]]);
});

test('each look halves where the sheet can be', () => {
  // A corner reading A1.20 (row 4) means everything wanted at rows 1-3 is to
  // its LEFT; the next look must be left of it.
  const seen = { 80: 'A1.20' };
  const { probePage } = planHunt({
    entries: IDX, picks: { areaSummary: 'A1.03' }, probes: seen, totalPages: 158,
  });
  assert.ok(probePage < 80, `looked at ${probePage}, right of the mark`);
});

test('an UNLISTED corner still steers the hunt', () => {
  // Page 100 reads A1.09 -- not a row on the cover, but after A1.04, so a
  // sheet wanted at row 2 must be left of page 100.
  const { probePage } = planHunt({
    entries: IDX, picks: { areaSummary: 'A1.03' }, probes: { 100: 'A1.09' }, totalPages: 158,
  });
  assert.ok(probePage < 100, `looked at ${probePage}`);
});

test('a sheet bracketed down to numberless pages is the first of them', () => {
  // Lowell's site plan: page 1 reads A1.00 (before the list), page 4 reads
  // A1.03 (row 2), pages 2 and 3 have no number printed at all. The site plan
  // (row 1) is one of the mute pages, and the first is where the order puts it.
  const { targets, done } = planHunt({
    entries: IDX, picks: { sitePlan: 'A1.01' },
    probes: { 1: 'A1.00', 2: null, 3: null, 4: 'A1.03' }, totalPages: 158,
  });
  assert.strictEqual(done, true);
  assert.deepStrictEqual(targets.map(t => [t.sheetNumber, t.page]), [['A1.01', 2]]);
});

test('a sheet bracketed down to no pages at all is dropped, not guessed', () => {
  // Pages 4 and 5 read consecutive placings with nothing between them: the
  // wanted sheet simply is not bound in this set.
  const { targets, done } = planHunt({
    entries: IDX, picks: { sitePlan: 'A1.01' },
    probes: { 1: 'A1.00', 2: 'A1.03' }, totalPages: 158,
  });
  assert.strictEqual(done, true);
  assert.deepStrictEqual(targets, []);
});

test('three wanted sheets share one hunt and never claim the same page', () => {
  const { targets, done } = planHunt({
    entries: IDX,
    picks: { sitePlan: 'A1.01', areaSummary: 'A1.03', unitMatrix: 'A1.03' },
    probes: { 1: 'A1.00', 2: null, 3: null, 4: 'A1.03' }, totalPages: 158,
  });
  assert.strictEqual(done, true);
  const pages = targets.map(t => t.page);
  assert.strictEqual(new Set(pages).size, pages.length, 'two roles landed on one page');
  assert.ok(targets.some(t => t.page === 2), 'site plan lost');
  assert.ok(targets.some(t => t.page === 4), 'area summary lost');
});

test('a hunt with nothing to hunt for is over before it starts', () => {
  assert.deepStrictEqual(
    planHunt({ entries: IDX, picks: {}, probes: {}, totalPages: 158 }),
    { targets: [], probePage: null, done: true });
  assert.deepStrictEqual(
    planHunt({ entries: [], picks: { sitePlan: 'A1.01' }, probes: {}, totalPages: 158 }).done,
    true);
});

test('the hunt never asks to look at the same page twice', () => {
  // Termination is the whole game: every answer must shrink what is unknown.
  const probes = {};
  for (let i = 0; i < 200; i++) {
    const { probePage, done } = planHunt({
      entries: IDX, picks: { sitePlan: 'A1.01', areaSummary: 'A1.03' },
      probes, totalPages: 158,
    });
    if (done) break;
    assert.strictEqual(probes[probePage], undefined, `asked for page ${probePage} twice`);
    probes[probePage] = null; // worst case: every corner is mute
  }
  const { done } = planHunt({
    entries: IDX, picks: { sitePlan: 'A1.01', areaSummary: 'A1.03' },
    probes, totalPages: 158,
  });
  assert.strictEqual(done, true, 'a set of all-mute corners never converged');
});
