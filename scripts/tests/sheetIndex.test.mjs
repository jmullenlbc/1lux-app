/**
 * Tests for src/lib/sheetIndex.js — finding the four sheets that matter inside
 * a full drawing set.
 * Run: node --test scripts/tests/sheetIndex.test.mjs
 *
 * What these protect, in order of how much they would hurt:
 *
 *   1. The picker must NEVER fail. It stands between a GC's upload and an error
 *      message. A model outage, an empty set, junk input — all of them have to
 *      come back with an answer, because the alternative is telling someone his
 *      drawings failed when they did not.
 *   2. A page number the model invents must never reach the renderer. Rendering
 *      page 900 of a 442-page set throws, and by then the file is already gone.
 *   3. The deterministic scan must actually find real sheets, or the floor in
 *      (1) is a floor made of nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHEET_ROLES, MAX_PER_ROLE, sheetTitleOf, buildSheetIndex,
         scanSheetRoles, pickKeySheets, pagesToRender } from '../../src/lib/sheetIndex.js';

// A miniature drawing set, shaped like the real ones: a title page first, the
// interesting sheets buried, and plenty of pages that merely MENTION the words.
const SET = [
  { page: 1,  text: 'G0.01  COVER SHEET   SHEET INDEX   PROJECT DIRECTORY   VICINITY MAP' },
  { page: 2,  text: 'G0.02  CODE SUMMARY   BUILDING AREA   OCCUPANCY   TYPE VA' },
  { page: 3,  text: 'A0.10  UNIT MATRIX   UNIT TYPE  QTY  NSF   A1 1BR 48 720   B2 2BR 36 1050' },
  { page: 12, text: 'AS1.01  ARCHITECTURAL SITE PLAN   LOT AREA 5.62 ACRES   PARKING PROVIDED 312' },
  { page: 24, text: 'A2.01  FLOOR PLAN LEVEL 1   SEE SITE PLAN FOR GRADING   REFER TO UNIT MATRIX' },
  { page: 30, text: 'L1.01  LANDSCAPE PLAN   PLANT SCHEDULE   IRRIGATION NOTES' },
];

// ─── sheetTitleOf ───────────────────────────────────────────────────────────

test('reads a drawing title out of title-block text', () => {
  assert.match(sheetTitleOf(SET[3].text), /SITE PLAN/);
  assert.match(sheetTitleOf(SET[2].text), /UNIT MATRIX/);
});

test('ignores title-block furniture that is on every sheet', () => {
  // If SCALE / DATE / DRAWN BY won, every sheet in the set would score the same
  // and the scan would be noise.
  const t = sheetTitleOf('SCALE 1/8" = 1\'-0"   DATE 08/21/2026   DRAWN BY MJK');
  assert.ok(t == null || !/^(SCALE|DATE|DRAWN BY)/.test(t), `unexpected title: ${t}`);
});

test('returns null rather than throwing on nothing', () => {
  for (const v of [null, undefined, '', '   ', 12345]) {
    assert.doesNotThrow(() => sheetTitleOf(v));
  }
});

// ─── buildSheetIndex ────────────────────────────────────────────────────────

test('the index keeps page numbers and stays small enough to prompt with', () => {
  const index = buildSheetIndex(SET);
  assert.equal(index.length, SET.length);
  assert.deepEqual(index.map(r => r.page), [1, 2, 3, 12, 24, 30]);
  // 400 sheets x 160 chars is what has to fit in one prompt alongside the rest.
  for (const row of index) assert.ok(row.snippet.length <= 160);
});

test('buildSheetIndex survives an empty or junk page list', () => {
  assert.deepEqual(buildSheetIndex([]), []);
  assert.deepEqual(buildSheetIndex(null), []);
  assert.doesNotThrow(() => buildSheetIndex([{ page: 1 }, { page: 2, text: null }]));
});

// ─── scanSheetRoles — the never-fails floor ─────────────────────────────────

test('the scan finds the real sheets, not the ones that mention them', () => {
  const scan = scanSheetRoles(buildSheetIndex(SET));
  // Page 24 is a floor plan whose notes say "SEE SITE PLAN" and "REFER TO UNIT
  // MATRIX". It must not outrank the sheets that ARE those things.
  assert.equal(scan.sitePlan[0].page, 12, 'the site plan is page 12, not the sheet citing it');
  assert.equal(scan.unitMatrix[0].page, 3);
  assert.equal(scan.cover[0].page, 1);
});

test('the scan never hands back more candidates than a set can afford', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ page: i + 1, text: `A${i}.01 SITE PLAN` }));
  const scan = scanSheetRoles(buildSheetIndex(many));
  for (const role of SHEET_ROLES) {
    assert.ok(scan[role].length <= MAX_PER_ROLE * 3, `${role} kept ${scan[role].length}`);
  }
});

test('scanSheetRoles returns every role even when it finds nothing', () => {
  const scan = scanSheetRoles(buildSheetIndex([{ page: 1, text: 'blank' }]));
  for (const role of SHEET_ROLES) assert.ok(Array.isArray(scan[role]), `${role} missing`);
  assert.doesNotThrow(() => scanSheetRoles(null));
});

test('a combined project-information sheet (Skyline G101 shape) ranks as the area summary', () => {
  // Skyline Ridge's ONLY square footage in 294 pages was on "G101 — PROJECT
  // INFORMATION": a BUILDING DATA / PROPOSED TOTAL AREA block. Its title says
  // neither "area" nor "code summary", so before these signals existed the
  // sheet was never rendered and the whole set read as having no gross SF.
  const set = [
    ...SET,
    { page: 4, text: 'G101  PROJECT INFORMATION   BUILDING DATA - RESIDENTIAL BUILDINGS   PROPOSED TOTAL AREA   BUILDING A: 87,781 SF' },
  ];
  const scan = scanSheetRoles(buildSheetIndex(set));
  // Before the BUILDING DATA / PROPOSED TOTAL AREA / PROJECT INFORMATION
  // signals existed this page scored ZERO for the role and vanished. It must
  // now be a candidate — outranking a genuine code-summary sheet is not
  // required, being in the running is.
  assert.ok(scan.areaSummary.some(c => c.page === 4), 'the BUILDING DATA sheet must be an areaSummary candidate');
});

// ─── pickKeySheets — the part that must never fail ─────────────────────────

test('with no model at all, the scan still produces an answer', async () => {
  const r = await pickKeySheets(buildSheetIndex(SET), null);
  assert.equal(r.source, 'scan');
  // The floor carries up to MAX_PER_ROLE candidates; what matters is that the
  // real sheet is ranked first, because that is the one that gets rendered.
  assert.equal(r.picks.sitePlan[0], 12);
  assert.equal(r.picks.unitMatrix[0], 3);
});

test('a model that throws degrades to the scan instead of failing the upload', async () => {
  // This is the Anthropic-account-out-of-credit case, live-observed earlier this
  // month. A GC's upload must not depend on our billing.
  const dead = { messages: { create: async () => { throw new Error('402 insufficient credit'); } } };
  const r = await pickKeySheets(buildSheetIndex(SET), dead);
  assert.equal(r.source, 'scan');
  assert.equal(r.picks.sitePlan[0], 12);
});

test('a model that returns junk degrades to the scan', async () => {
  for (const body of ['not json at all', '{"sitePlan": ', '']) {
    const junk = { messages: { create: async () => ({ content: [{ type: 'text', text: body }] }) } };
    const r = await pickKeySheets(buildSheetIndex(SET), junk);
    assert.equal(r.source, 'scan', `body ${JSON.stringify(body)} should fall back`);
  }
});

test('a page the model invented is discarded, and the scan fills the hole', async () => {
  // The failure this prevents: rendering page 900 of a 442-page set throws, and
  // by that point the uploaded file has already been deleted.
  const liar = { messages: { create: async () => ({ content: [
    { type: 'thinking', thinking: 'the site plan is usually early' },
    { type: 'text', text: JSON.stringify({ sitePlan: [900, 12], unitMatrix: [-4], cover: [1] }) },
  ] }) } };
  const r = await pickKeySheets(buildSheetIndex(SET), liar);
  assert.equal(r.source, 'model');
  assert.deepEqual(r.picks.sitePlan, [12], 'page 900 does not exist in this set');
  assert.equal(r.picks.unitMatrix[0], 3, 'a negative page falls back to the scan');
  assert.ok(!r.picks.unitMatrix.includes(-4), 'a negative page must never survive');
});

test('the model wins the roles it answered; the scan fills the rest', async () => {
  // Page 30 is the landscape plan — the scan ranks it below the real site plan,
  // but a model reading titles may know this set puts site data there.
  const m = { messages: { create: async () => ({ content: [
    { type: 'text', text: JSON.stringify({ sitePlan: [30], confidence: 0.8, notes: 'site data is on the landscape sheet' }) },
  ] }) } };
  const r = await pickKeySheets(buildSheetIndex(SET), m);
  assert.deepEqual(r.picks.sitePlan, [30], 'the model overrides the scan where it has an opinion');
  assert.equal(r.picks.unitMatrix[0], 3, 'and the scan still covers what it left blank');
  assert.equal(r.confidence, 0.8);
});

test('picks are capped per role no matter how many the model names', async () => {
  const greedy = { messages: { create: async () => ({ content: [
    { type: 'text', text: JSON.stringify({ sitePlan: [1, 2, 3, 12, 24, 30] }) },
  ] }) } };
  const r = await pickKeySheets(buildSheetIndex(SET), greedy);
  assert.equal(r.picks.sitePlan.length, MAX_PER_ROLE);
});

test('an empty set does not reach the model at all', async () => {
  let called = false;
  const spy = { messages: { create: async () => { called = true; return { content: [] }; } } };
  const r = await pickKeySheets([], spy);
  assert.equal(called, false, 'no pages means nothing to pay for');
  assert.equal(r.source, 'scan');
});

// ─── pagesToRender ──────────────────────────────────────────────────────────

test('the render list is de-duplicated and site-plan first', () => {
  // Site plan first because it is the sheet the vision read exists for; a
  // duplicate page would otherwise be rendered — and paid for — twice.
  const pages = pagesToRender({ sitePlan: [12], areaSummary: [2, 12], unitMatrix: [3], cover: [1] });
  assert.equal(pages[0], 12);
  assert.equal(new Set(pages).size, pages.length, 'no page appears twice');
});

test('every role gets a look before any role gets a second sheet', () => {
  // The bug this exists for: with two site-plan candidates and a cap of two, a
  // role-at-a-time walk renders BOTH site plans and never opens the area
  // summary — so the read comes back with no square footage at all.
  const picks = { sitePlan: [12, 30], areaSummary: [2], unitMatrix: [3], cover: [1] };
  assert.deepEqual(pagesToRender(picks, { max: 2 }), [12, 2]);
  assert.deepEqual(pagesToRender(picks, { max: 3 }), [12, 2, 3]);
});

test('the render list honours its cap — every page is paid for by the pixel', () => {
  const picks = { sitePlan: [12, 13], areaSummary: [2, 4], unitMatrix: [3], cover: [1] };
  assert.equal(pagesToRender(picks, { max: 2 }).length, 2);
  assert.equal(pagesToRender(picks, { max: 3 }).length, 3);
});

test('pagesToRender returns an empty list rather than throwing on nothing', () => {
  assert.deepEqual(pagesToRender(null), []);
  assert.deepEqual(pagesToRender({}), []);
  assert.deepEqual(pagesToRender({ sitePlan: [] }), []);
});

// ── That the readers actually use it ────────────────────────────────────────
//
// The index was built, tested, and then wired into exactly one route. The two
// in-app readers went on rendering from the front of the file for weeks — the
// site reader opening a title page, the unit-matrix reader sampling 30,000
// characters out of two million. Nothing failed; the answers were just wrong,
// which is the expensive kind of quiet. These pin the wiring itself.

test('every PDF reader jumps to the sheet index', async () => {
  const { readFileSync } = await import('node:fs');
  const READERS = [
    'src/app/api/intake/parse/route.js',
    'src/app/api/projects/[id]/site/parse/route.js',
    'src/app/api/projects/[id]/unit-matrix/parse/route.js',
  ];
  for (const file of READERS) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /from '@\/lib\/sheetIndex'/, `${file} does not import the sheet index`);
    assert.match(src, /pickKeySheets\(/, `${file} imports the index but never asks it anything`);
  }
});

test('the threshold for paying to index a set lives in one place', async () => {
  const { readFileSync } = await import('node:fs');
  const { SET_PAGE_THRESHOLD } = await import('../../src/lib/sheetIndex.js');
  assert.equal(typeof SET_PAGE_THRESHOLD, 'number');
  for (const file of [
    'src/app/api/intake/parse/route.js',
    'src/app/api/projects/[id]/site/parse/route.js',
    'src/app/api/projects/[id]/unit-matrix/parse/route.js',
  ]) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      src,
      /const SET_PAGE_THRESHOLD\s*=/,
      `${file} keeps its own copy of the threshold — three routes drifting apart`
    );
  }
});
