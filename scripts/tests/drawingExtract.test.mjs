/**
 * Unit tests for the shared drawing-extraction core.
 * Covers the pure logic only — no model calls, no file IO.
 * Run: node --test scripts/tests/drawingExtract.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileExt, pickModel, mergeProposals, IMAGE_EXTS, ACCEPTED_EXTS } from '../../src/lib/drawingExtract.js';

test('fileExt is case-insensitive and handles dotted names', () => {
  assert.equal(fileExt('matrix.PDF'), 'pdf');
  assert.equal(fileExt('A1.02 - Unit Matrix.xlsx'), 'xlsx');
  assert.equal(fileExt('noextension'), 'noextension');
  assert.equal(fileExt(''), '');
  assert.equal(fileExt(null), '');
});

test('accepted and image extension lists do not overlap', () => {
  for (const e of ACCEPTED_EXTS) assert.ok(!IMAGE_EXTS.includes(e), `${e} in both lists`);
});

test('pickModel escalates on size and on telling filenames', () => {
  assert.match(pickModel('x'.repeat(100), 'small.pdf'), /haiku/);
  assert.match(pickModel('x'.repeat(7000), 'small.pdf'), /sonnet/, 'long text escalates');
  assert.match(pickModel('x', 'FULL SET.pdf'), /sonnet/, '"full" escalates');
  assert.match(pickModel('x', 'combined-drawings.pdf'), /sonnet/, '"combined" escalates');
  assert.match(pickModel('x', 'Combined.PDF'), /sonnet/, 'case-insensitive');
});

// ─── MERGE ──────────────────────────────────────────────────────────────────

const p = (unitTypes, totals = {}, conf = 0.9) => ({
  unitTypes, projectTotals: { grossInteriorSf: null, garageSf: null, corridorSf: null, buildingType: null, ...totals },
  overallConfidence: conf,
});

test('merging distinct unit types unions them', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) },
    { fileName: 'b.pdf', proposal: p([{ code: 'B1', qty: 5, confidence: 0.9 }]) },
  ]);
  assert.equal(m.unitTypes.length, 2);
  assert.equal(m.unitTypes.reduce((s, r) => s + r.qty, 0), 15);
});

test('THE IMPORTANT ONE: a repeated matrix does not double-count units', () => {
  // Same sheet appearing in two uploads is the common real case. Summing would
  // silently report 20 units where there are 10.
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) },
    { fileName: 'b.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) },
  ]);
  assert.equal(m.unitTypes.length, 1);
  assert.equal(m.unitTypes[0].qty, 10, 'must NOT be 20');
});

test('same code with different qty keeps the higher-confidence read and records a conflict', () => {
  const m = mergeProposals([
    { fileName: 'low.pdf',  proposal: p([{ code: 'A1', qty: 10, confidence: 0.4 }]) },
    { fileName: 'high.pdf', proposal: p([{ code: 'A1', qty: 12, confidence: 0.95 }]) },
  ]);
  assert.equal(m.unitTypes.length, 1);
  assert.equal(m.unitTypes[0].qty, 12, 'higher confidence wins');
  assert.equal(m.conflicts.length, 1);
  assert.match(m.conflicts[0].field, /A1/);
});

test('confidence order does not change the outcome', () => {
  const rows = [
    { fileName: 'high.pdf', proposal: p([{ code: 'A1', qty: 12, confidence: 0.95 }]) },
    { fileName: 'low.pdf',  proposal: p([{ code: 'A1', qty: 10, confidence: 0.4 }]) },
  ];
  assert.equal(mergeProposals(rows)[0]?.qty ?? mergeProposals(rows).unitTypes[0].qty, 12);
});

test('unit codes match case-insensitively', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([{ code: 'a1', qty: 10, confidence: 0.9 }]) },
    { fileName: 'b.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) },
  ]);
  assert.equal(m.unitTypes.length, 1, 'a1 and A1 are the same type');
});

test('rows with a blank code are skipped rather than merged into one bucket', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([{ code: '', qty: 10, confidence: 0.9 }, { code: null, qty: 5, confidence: 0.9 }]) },
  ]);
  assert.equal(m.unitTypes.length, 0);
});

test('project totals take the first non-null and flag disagreement', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([], { grossInteriorSf: null }) },
    { fileName: 'b.pdf', proposal: p([], { grossInteriorSf: 164000 }) },
    { fileName: 'c.pdf', proposal: p([], { grossInteriorSf: 170000 }) },
  ]);
  assert.equal(m.projectTotals.grossInteriorSf, 164000, 'first non-null wins');
  assert.equal(m.conflicts.filter(c => c.field === 'grossInteriorSf').length, 1);
});

test('agreeing totals produce no conflict', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([], { grossInteriorSf: 164000 }) },
    { fileName: 'b.pdf', proposal: p([], { grossInteriorSf: 164000 }) },
  ]);
  assert.equal(m.conflicts.length, 0);
});

test('every merged row records which files it came from', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) },
    { fileName: 'b.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) },
  ]);
  assert.deepEqual(m.unitTypes[0].sources, ['a.pdf', 'b.pdf']);
});

test('overall confidence averages across files', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([], {}, 0.8) },
    { fileName: 'b.pdf', proposal: p([], {}, 1.0) },
  ]);
  assert.ok(Math.abs(m.overallConfidence - 0.9) < 1e-9);
});

// ─── SITE DATA IN THE MERGE ─────────────────────────────────────────────────
// A vision-read site plan arrives as { kind: 'site_data', siteData, unitTypes: [] }.
// Before 2026-08-16 the merge silently dropped siteData — the visitor was told
// their site plan was read while its numbers went nowhere.

const site = (fields, conf = 0.9) => ({
  kind: 'site_data', unitTypes: [],
  siteData: { confidence: conf, notes: '', ...fields },
});

test('a site-plan read survives the merge', () => {
  const m = mergeProposals([
    { fileName: 'site.pdf', proposal: site({ lotSf: 435600, surfaceParking: 96, buildingCount: 7 }) },
  ]);
  assert.equal(m.siteData.lotSf, 435600);
  assert.equal(m.siteData.surfaceParking, 96);
  assert.equal(m.siteData.buildingCount, 7);
  assert.deepEqual(m.siteData.sources, ['site.pdf']);
});

test('site plan + unit matrix merge into one proposal carrying both', () => {
  const m = mergeProposals([
    { fileName: 'matrix.xlsx', proposal: p([{ code: 'A1', qty: 240, confidence: 0.9 }]) },
    { fileName: 'site.pdf',    proposal: site({ lotSf: 435600 }) },
  ]);
  assert.equal(m.unitTypes[0].qty, 240);
  assert.equal(m.siteData.lotSf, 435600);
  assert.deepEqual(m.sources, ['matrix.xlsx', 'site.pdf']);
});

test('disagreeing site reads keep the first and record a conflict', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: site({ surfaceParking: 96 }) },
    { fileName: 'b.pdf', proposal: site({ surfaceParking: 102 }) },
  ]);
  assert.equal(m.siteData.surfaceParking, 96, 'first non-null wins');
  assert.equal(m.conflicts.filter(c => c.field === 'site surfaceParking').length, 1);
});

test('no site plan uploaded → siteData is null, not an empty object', () => {
  const m = mergeProposals([
    { fileName: 'matrix.xlsx', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) },
  ]);
  assert.equal(m.siteData, null);
});

test('site-only uploads still produce an overall confidence', () => {
  const m = mergeProposals([
    { fileName: 'site.pdf', proposal: site({ lotSf: 1000 }, 0.8) },
  ]);
  assert.equal(m.overallConfidence, 0.8);
});

test('empty input and null proposals are safe', () => {
  const empty = mergeProposals([]);
  assert.deepEqual(empty.unitTypes, []);
  assert.equal(empty.overallConfidence, null);

  const withNull = mergeProposals([{ fileName: 'x.pdf', proposal: null }]);
  assert.deepEqual(withNull.unitTypes, []);
  assert.deepEqual(withNull.sources, []);
});

// ─── GROSS SF TRAVELS AS A BUNDLE ───────────────────────────────────────────
// The number and the verdict about what the number MEANS have to stay attached.
// Merging them field-by-field would pair one file's square footage with another
// file's basis — a number and an explanation of a different number.

const withGross = (sf, basis, conf, extra = {}) => ({
  unitTypes: [],
  projectTotals: {
    grossInteriorSf: sf, grossSfBasis: basis, grossSfConfidence: conf,
    grossSfStated: sf, grossSfAdjusted: false, grossSfNeedsReview: conf < 0.75,
    grossSfSummary: `${basis} @ ${conf}`, garageSf: null, corridorSf: null,
    statedTotalUnits: null, buildingType: null, ...extra,
  },
  overallConfidence: 0.9,
});

test('gross SF: the higher-confidence read wins, not the first one', () => {
  const m = mergeProposals([
    { fileName: 'bigset.pdf',  proposal: withGross(221022, 'code',  0.55) },
    { fileName: 'areaplan.pdf', proposal: withGross(233050, 'gross', 0.95) },
  ]);
  assert.equal(m.projectTotals.grossInteriorSf, 233050, 'the confident sheet wins');
  assert.equal(m.projectTotals.grossSfFile, 'areaplan.pdf');
});

test('gross SF: the whole verdict moves together with the value', () => {
  const m = mergeProposals([
    { fileName: 'bigset.pdf',   proposal: withGross(221022, 'code',  0.55) },
    { fileName: 'areaplan.pdf', proposal: withGross(233050, 'gross', 0.95) },
  ]);
  // Every metadata field must describe the WINNING file, never a mix.
  assert.equal(m.projectTotals.grossSfBasis, 'gross');
  assert.equal(m.projectTotals.grossSfConfidence, 0.95);
  assert.equal(m.projectTotals.grossSfNeedsReview, false);
  assert.equal(m.projectTotals.grossSfSummary, 'gross @ 0.95');
});

test('gross SF: disagreement is still recorded as a conflict', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: withGross(221022, 'code',  0.55) },
    { fileName: 'b.pdf', proposal: withGross(233050, 'gross', 0.95) },
  ]);
  assert.equal(m.conflicts.filter(c => c.field === 'grossInteriorSf').length, 1);
});

test('gross SF: agreeing files raise no conflict', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: withGross(233050, 'gross', 0.9) },
    { fileName: 'b.pdf', proposal: withGross(233050, 'gross', 0.8) },
  ]);
  assert.equal(m.conflicts.filter(c => c.field === 'grossInteriorSf').length, 0);
  assert.equal(m.projectTotals.grossInteriorSf, 233050);
});

test('gross SF: a low-confidence lone read still fills the field and stays flagged', () => {
  const m = mergeProposals([
    { fileName: 'only.pdf', proposal: withGross(180000, 'unknown', 0.2) },
  ]);
  assert.equal(m.projectTotals.grossInteriorSf, 180000, 'filled');
  assert.equal(m.projectTotals.grossSfNeedsReview, true, 'and flagged');
});

test('gross SF: files without it do not clobber the file that has it', () => {
  const m = mergeProposals([
    { fileName: 'nogross.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) },
    { fileName: 'gross.pdf',   proposal: withGross(233050, 'gross', 0.9) },
  ]);
  assert.equal(m.projectTotals.grossInteriorSf, 233050);
  assert.equal(m.projectTotals.grossSfBasis, 'gross');
});
