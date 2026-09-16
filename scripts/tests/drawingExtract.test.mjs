/**
 * Unit tests for the shared drawing-extraction core.
 * Covers the pure logic only — no model calls, no file IO.
 * Run: node --test scripts/tests/drawingExtract.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileExt, pickModel, mergeProposals, extractPdfPages, extractDrawingText, attachAreaBasis, IMAGE_EXTS, ACCEPTED_EXTS } from '../../src/lib/drawingExtract.js';
import { modelFor } from '../../src/lib/aiModels.js';

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
  // 2026-08-19: the two tiers moved up and now come from src/lib/aiModels.js.
  // 2026-08-28: they landed on the SAME model -- every drawing read is Fable 5
  // now, by rule (see DRAWING_JOBS). So this no longer asserts that the two
  // differ; the JOB split still exists and still matters, because the accuracy
  // history is kept per job and a dense set is not the same task as a tidy
  // table. It asserts the split routes correctly, and aiModels.test.mjs asserts
  // where both ends of it land.
  const clean = pickModel('x'.repeat(100), 'small.pdf');
  const dense = pickModel('x'.repeat(7000), 'small.pdf');
  assert.equal(clean, modelFor('drawing.unitMatrix.clean'));
  assert.equal(dense, modelFor('drawing.unitMatrix'));
  assert.equal(pickModel('x', 'FULL SET.pdf'),          dense, '"full" escalates');
  assert.equal(pickModel('x', 'combined-drawings.pdf'), dense, '"combined" escalates');
  assert.equal(pickModel('x', 'Combined.PDF'),          dense, 'case-insensitive');
});

// ─── MERGE ──────────────────────────────────────────────────────────────────

const p = (unitTypes, totals = {}, conf = 0.9) => ({
  unitTypes, projectTotals: { grossInteriorSf: null, garageSf: null, corridorSf: null, buildingType: null, ...totals },
  overallConfidence: conf,
});

test('two files with unrelated codes and no printed total are unioned (two buildings, two matrices)', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) },
    { fileName: 'b.pdf', proposal: p([{ code: 'B1', qty: 5, confidence: 0.9 }]) },
  ]);
  assert.equal(m.unitTypes.length, 2);
  assert.equal(m.unitTypes.reduce((s, r) => s + r.qty, 0), 15);
  assert.equal(m.unitSchedule.anchored, false);
  assert.equal(m.conflicts.length, 0);
});

// Lone Tree Ranch Test v2, live, 2026-09-16 (Mike's screenshot: "# Units 188,
// drawings say 168"). GEN carries the real matrix and its printed total; ARCH
// has no matrix, so the model estimated rows at 0.4 confidence with codes
// spelled slightly differently and areas a foot or two off. Keyed on code the
// ARCH rows were ADDED: 188 units, 535 bedrooms, 38 baths from rows that only
// the estimate carried, units SF larger than the building, BOH $0.
const LONE_TREE_GEN = p([
  { code: 'Unit 2-1',        label: '2 Bedroom',        qty: 53, unitSf: 1013, bedrooms: 2, bathrooms: null, balconies: null, confidence: 1 },
  { code: 'Unit 2-1 Type A', label: '2 Bedroom Type A', qty: 3,  unitSf: 1013, bedrooms: 2, bathrooms: null, balconies: null, confidence: 1 },
  { code: 'Unit 3-1',        label: '3 Bedroom',        qty: 32, unitSf: 1218, bedrooms: 3, bathrooms: null, balconies: null, confidence: 1 },
  { code: 'Unit 3-2',        label: '3 Bedroom',        qty: 51, unitSf: 1241, bedrooms: 3, bathrooms: null, balconies: null, confidence: 1 },
  { code: 'Unit 3-2 Type A', label: '3 Bedroom Type A', qty: 5,  unitSf: 1241, bedrooms: 3, bathrooms: null, balconies: null, confidence: 1 },
  { code: 'Unit 4-1',        label: '4 Bedroom',        qty: 23, unitSf: 1386, bedrooms: 4, bathrooms: null, balconies: null, confidence: 1 },
  { code: 'Unit 4-1 Type A', label: '4 Bedroom Type A', qty: 1,  unitSf: 1386, bedrooms: 4, bathrooms: null, balconies: null, confidence: 1 },
], { statedTotalUnits: 168, buildingType: 'Occupancy R-2 (Clubhouse A-3/B), Construction Type VA, 3 stories, NFPA 13R' }, 1);
const LONE_TREE_ARCH = p([
  { code: 'Unit 2-1',          label: '2 Bedroom',                      qty: 44, unitSf: null, bedrooms: 2, bathrooms: null, balconies: null, confidence: 0.3 },
  { code: 'Unit 2-1 - Type A', label: '2 Bedroom - Type A (accessible)', qty: 4,  unitSf: null, bedrooms: 2, bathrooms: null, balconies: null, confidence: 0.3 },
  { code: 'Unit 3-1',          label: '3 Bedroom (UNIT 3-1 - OPT1)',     qty: 24, unitSf: 1219, bedrooms: 3, bathrooms: 2, balconies: 1, confidence: 0.4 },
  { code: 'Unit 3-2',          label: '3 Bedroom (UNIT 3-2 - OPT1)',     qty: 48, unitSf: 1240, bedrooms: 3, bathrooms: 2, balconies: 1, confidence: 0.4 },
  { code: 'Unit 4-1',          label: '4 Bedroom (UNIT 4-1 - OPT2)',     qty: 20, unitSf: 1388, bedrooms: 4, bathrooms: 2, balconies: 1, confidence: 0.4 },
  { code: 'Unit 4-1 - Type A', label: '4 Bedroom - Type A (accessible)', qty: 4,  unitSf: 1388, bedrooms: 4, bathrooms: 2, balconies: 1, confidence: 0.3 },
], { statedTotalUnits: null, buildingType: 'GROUP R-2; TYPE VA; NFPA 13R' }, 0.4);

test('LONE TREE v2: the file whose rows add up to its printed total is the schedule; other files only disagree', () => {
  for (const order of [[LONE_TREE_GEN, LONE_TREE_ARCH], [LONE_TREE_ARCH, LONE_TREE_GEN]]) {
    const m = mergeProposals([
      { fileName: order[0] === LONE_TREE_GEN ? 'gen.pdf' : 'arch.pdf', proposal: order[0] },
      { fileName: order[1] === LONE_TREE_GEN ? 'gen.pdf' : 'arch.pdf', proposal: order[1] },
    ]);
    assert.equal(m.unitTypes.length, 7, 'seven GEN types, nothing added from ARCH');
    assert.equal(m.unitTypes.reduce((s, r) => s + Number(r.qty), 0), 168, 'must NOT be 188');
    assert.equal(m.unitTypes.reduce((s, r) => s + Number(r.qty) * Number(r.bedrooms), 0), 472);
    assert.ok(m.unitTypes.every(r => r.bathrooms == null && r.balconies == null),
      'ARCH-only bathroom and balcony columns never leak into the counted rows');
    assert.deepEqual(m.unitSchedule, { file: 'gen.pdf', units: 168, stated: 168, complete: true, anchored: true });
    assert.equal(m.uncountedUnitTypes.length, 2, 'the two differently spelled Type A rows are set aside');
    assert.ok(m.uncountedUnitTypes.every(r => r.file === 'arch.pdf'));
    // One summary disagreement, listed FIRST, then the per-row ones.
    assert.equal(m.conflicts[0].field, 'unit types');
    assert.match(m.conflicts[0].values[0].value, /7 types \/ 168 units/);
    assert.match(m.conflicts[0].values[1].value, /2 types \/ 8 units/);
    assert.equal(m.conflicts.filter(c => c.field === 'unit type Unit 2-1 qty').length, 1);
    assert.equal(m.conflicts.filter(c => c.field === 'buildingType').length, 0,
      'free-text building type is never a disagreement (was "NaN vs NaN")');
    assert.equal(m.projectTotals.statedTotalUnits, 168);
  }
});

test('the counted schedule keeps its own quantity even when the other file is more confident row-by-row', () => {
  const m = mergeProposals([
    { fileName: 'set.pdf',  proposal: p([{ code: 'A1', qty: 10, confidence: 0.5 }, { code: 'A2', qty: 20, confidence: 0.5 }], { statedTotalUnits: 30 }, 0.5) },
    { fileName: 'est.pdf',  proposal: p([{ code: 'A1', qty: 14, confidence: 0.99 }], {}, 0.6) },
  ]);
  assert.equal(m.unitSchedule.file, 'set.pdf', 'rows add up to the printed total, so it is complete');
  assert.equal(m.unitTypes.find(r => r.code === 'A1').qty, 10);
  assert.equal(m.conflicts.length, 1);
  assert.equal(m.conflicts[0].field, 'unit type A1 qty');
});

test('a file that prints a total never gains units from a file with unrelated codes', () => {
  const m = mergeProposals([
    { fileName: 'gen.pdf',  proposal: p([{ code: 'Unit 2-1', qty: 53 }, { code: 'Unit 3-1', qty: 47 }], { statedTotalUnits: 100 }, 1) },
    { fileName: 'arch.pdf', proposal: p([{ code: '2BR', qty: 53 }, { code: '3BR', qty: 47 }], {}, 0.4) },
  ]);
  assert.equal(m.unitTypes.reduce((s, r) => s + Number(r.qty), 0), 100, 'must NOT be 200');
  assert.equal(m.uncountedUnitTypes.length, 2);
  assert.equal(m.conflicts.length, 1);
  assert.equal(m.conflicts[0].field, 'unit types');
});

test('free-text project totals never produce a disagreement', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([], { buildingType: 'Occupancy R-2, Type VA' }) },
    { fileName: 'b.pdf', proposal: p([], { buildingType: 'GROUP R-2; TYPE VA' }) },
  ]);
  assert.equal(m.projectTotals.buildingType, 'Occupancy R-2, Type VA', 'first non-null still wins');
  assert.equal(m.conflicts.length, 0);
});

test('a printed back-of-house SF survives the merge (Mike 2026-09-16)', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }], { bohSf: 1438 }) },
    { fileName: 'b.pdf', proposal: p([{ code: 'B1', qty: 5, confidence: 0.9 }]) },
  ]);
  assert.equal(m.projectTotals.bohSf, 1438);
  const none = mergeProposals([{ fileName: 'a.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) }]);
  assert.equal(none.projectTotals.bohSf, null);
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

// Lone Tree Ranch Test v1, live, 2026-09-15 (Mike's screenshots): the model
// wrote the bedroom count as the code for all seven rows, the merge keyed on
// code folded them into three, 60 units vanished and the app reported four
// "disagreements between files" from a single file.
test('LONE TREE: rows from ONE file that share a code but differ are all kept', () => {
  const m = mergeProposals([
    { fileName: 'gen.pdf', proposal: p([
      { code: '2BR', label: '2BR',                    qty: 53, unitSf: 1004, bedrooms: 2, confidence: 1 },
      { code: '2BR', label: '2BR (Type A accessible)', qty: 3,  unitSf: 1004, bedrooms: 2, confidence: 1 },
      { code: '3BR', label: '3BR',                    qty: 32, unitSf: 1120, bedrooms: 3, confidence: 1 },
      { code: '3BR', label: '3BR',                    qty: 51, unitSf: 1263, bedrooms: 3, confidence: 1 },
      { code: '3BR', label: '3BR (Type A accessible)', qty: 5,  unitSf: 1263, bedrooms: 3, confidence: 1 },
      { code: '4BR', label: '4BR',                    qty: 23, unitSf: 1440, bedrooms: 4, confidence: 1 },
      { code: '4BR', label: '4BR (Type A accessible)', qty: 1,  unitSf: 1440, bedrooms: 4, confidence: 1 },
    ]) },
  ]);
  assert.equal(m.unitTypes.length, 7, 'seven types in, seven types out');
  assert.equal(m.unitTypes.reduce((s, r) => s + Number(r.qty), 0), 168, 'all 168 units kept');
  assert.equal(m.conflicts.length, 0, 'one file cannot disagree with itself');
});

test('LONE TREE: the same bedroom-coded matrix in a second file is still counted once', () => {
  const rows = [
    { code: '3BR', label: '3BR', qty: 32, unitSf: 1120, bedrooms: 3, confidence: 1 },
    { code: '3BR', label: '3BR', qty: 51, unitSf: 1263, bedrooms: 3, confidence: 1 },
  ];
  const m = mergeProposals([
    { fileName: 'gen.pdf',  proposal: p(rows) },
    { fileName: 'arch.pdf', proposal: p(rows.map(r => ({ ...r, confidence: 0.9 }))) },
  ]);
  assert.equal(m.unitTypes.length, 2, 'two types, each seen twice');
  assert.equal(m.unitTypes.reduce((s, r) => s + Number(r.qty), 0), 83, 'never summed');
  assert.equal(m.conflicts.length, 0);
});

// REVERSED 2026-09-16. This used to assert that the same code with a different
// SF in a SECOND FILE was a second type (two rows, no disagreement). Lone Tree
// v2 showed what that really is in practice: the same type read a foot or two
// differently ("Unit 3-1" 1,218 SF in GEN, 1,219 SF in ARCH), and treating it
// as a new type is exactly how 20 units became 188. Across files the second
// row is now a disagreement about ONE type. Within one file the 2026-09-15
// rule still applies (see the LONE TREE test above).
test('same code across files with different SF is one type with a disagreement, not two types', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([{ code: 'B2', qty: 20, unitSf: 900,  confidence: 0.9 }]) },
    { fileName: 'b.pdf', proposal: p([{ code: 'B2', qty: 8,  unitSf: 1150, confidence: 0.9 }]) },
  ]);
  assert.equal(m.unitTypes.length, 1);
  assert.equal(m.unitTypes[0].qty, 20, 'ties go to the first-dropped file');
  assert.equal(m.conflicts.length, 1);
  assert.equal(m.conflicts[0].field, 'unit type B2 qty');
});

test('same code across files, same SF, different qty is STILL a real disagreement', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([{ code: 'B2', qty: 20, unitSf: 900, confidence: 0.5 }]) },
    { fileName: 'b.pdf', proposal: p([{ code: 'B2', qty: 22, unitSf: 900, confidence: 0.9 }]) },
  ]);
  assert.equal(m.unitTypes.length, 1);
  assert.equal(m.unitTypes[0].qty, 22, 'higher confidence wins');
  assert.equal(m.conflicts.length, 1);
});

// REVERSED 2026-09-15. This used to assert that a blank-code row was DROPPED
// (`length, 0`). It was written to stop blank rows landing in one bucket and
// overwriting each other — a real hazard — but dropping them solved it by
// deleting the units, which is how Lone Tree Ranch Test v1 came back with 294
// bedrooms against a hand count of 472 (Mike, 2026-09-15: "It read units wrong
// on a project I just tested ... Way off there").
//
// A blank code is a LABELLING failure: quantities.js counts a row by its qty
// and never reads its code, so the units are perfectly good. Unnamed rows are
// now keyed by their CONTENT, which closes the original bucket hazard and the
// double-count hazard in the test below without throwing any units away.
test('rows with a blank code keep their units instead of being dropped', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([
      { code: '',   qty: 10, unitSf: 700, confidence: 0.9 },
      { code: null, qty: 5,  unitSf: 950, confidence: 0.9 },
    ]) },
  ]);
  assert.equal(m.unitTypes.length, 2, 'two different unnamed types, both kept');
  assert.equal(m.unitTypes.reduce((s, r) => s + Number(r.qty), 0), 15);
});

test('the same unnamed row printed in two files is counted once, not twice', () => {
  // This is why unnamed rows are keyed by content rather than by file. Rule 1
  // of mergeProposals: the same matrix on several sheets must never be summed.
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: p([{ code: '', qty: 10, unitSf: 700, confidence: 0.9 }]) },
    { fileName: 'b.pdf', proposal: p([{ code: '', qty: 10, unitSf: 700, confidence: 0.95 }]) },
  ]);
  assert.equal(m.unitTypes.length, 1, 'one row, seen twice');
  assert.equal(Number(m.unitTypes[0].qty), 10, 'counted once, never summed');
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

// ─── PER-BUILDING TOTALS (the Skyline Ridge shape) ──────────────────────────
// Some sets print four "BUILDING n: xx,xxx SF" totals and no grand total in
// 294 pages. The model reports each printed figure verbatim; attachAreaBasis
// does the arithmetic and says so, and the basis is judged off the page the
// first ADDEND is printed on (a summed total is printed nowhere).

const SKYLINE_PAGE_4 =
  'PROJECT INFORMATION  CODE ANALYSIS  SHEET NO. G101\n' +
  'BUILDING DATA - RESIDENTIAL BUILDINGS  PROPOSED TOTAL AREA  GROSS BUILDING AREA\n' +
  'BUILDING A: 87,781 SF  BUILDING B: 87,781 SF  BUILDING C: 96,746 SF  BUILDING D: 91,721 SF\n' +
  '5 STORIES PROPOSED  TYPE IIIA CONSTRUCTION  NFPA 13 SPRINKLERED THROUGHOUT';

function skylineProposal(overrides = {}) {
  return {
    unitTypes: [],
    projectTotals: {
      grossInteriorSf: null,
      perBuildingGross: [
        { name: 'Building A', grossSf: 87781 },
        { name: 'Building B', grossSf: 87781 },
        { name: 'Building C', grossSf: 96746 },
        { name: 'Building D', grossSf: 91721 },
      ],
      grossSfLabel: 'PROPOSED TOTAL AREA',
      grossSfSheet: 'G101',
      ...overrides,
    },
  };
}

test('per-building totals sum in code when no whole-project total is printed', () => {
  const out = attachAreaBasis(skylineProposal(), { pages: [{ page: 4, text: SKYLINE_PAGE_4 }] });
  const t = out.projectTotals;
  assert.equal(t.grossSfSummed, true);
  assert.equal(t.grossSfStated, 87781 + 87781 + 96746 + 91721);   // 364,029
  // The page says GROSS BUILDING AREA right by the addends — no adjustment.
  assert.equal(t.grossInteriorSf, 364029);
  assert.match(t.grossSfSummary, /sum of the stated per-building totals/);
  assert.match(t.grossSfSummary, /Building A 87,781 \+ Building B 87,781 \+ Building C 96,746 \+ Building D 91,721 = 364,029 SF/);
});

test('a printed whole-project total always beats the per-building sum', () => {
  const out = attachAreaBasis(
    skylineProposal({ grossInteriorSf: 233050, grossSfLabel: 'BUILDING GROSS SF' }),
    { pages: [{ page: 2, text: 'AREA SUMMARY  BUILDING GROSS SF 233,050 SF  SHEET NO. A-101' }] },
  );
  const t = out.projectTotals;
  assert.equal(t.grossSfSummed, false);
  assert.equal(t.grossInteriorSf, 233050);
  assert.ok(!/per-building/.test(t.grossSfSummary));
});

test('junk per-building rows (null, zero, non-numeric) are filtered before summing', () => {
  const out = attachAreaBasis(
    skylineProposal({
      perBuildingGross: [
        { name: 'Building A', grossSf: 87781 },
        null,
        { name: 'Building B', grossSf: 0 },
        { name: 'Building C', grossSf: 'vector art' },
      ],
    }),
    { pages: [{ page: 4, text: SKYLINE_PAGE_4 }] },
  );
  assert.equal(out.projectTotals.grossSfStated, 87781, 'only the real addend counts');
});

test('per-building addends travel with the winning gross bundle through a merge', () => {
  const summed = attachAreaBasis(skylineProposal(), { pages: [{ page: 4, text: SKYLINE_PAGE_4 }] });
  const m = mergeProposals([
    { fileName: 'skyline.pdf', proposal: summed },
    { fileName: 'nogross.pdf', proposal: p([{ code: 'A1', qty: 10, confidence: 0.9 }]) },
  ]);
  assert.equal(m.projectTotals.grossInteriorSf, 364029);
  assert.equal(m.projectTotals.grossSfSummed, true);
  assert.equal(m.projectTotals.perBuildingGross.length, 4);
  assert.match(m.projectTotals.grossSfSummary, /364,029/);
});

// ─── KEPT SHEETS ────────────────────────────────────────────────────────────
// The compressed images of the pages we read. A GC can send up to five PDFs in
// one go, so the merge has to gather the kept sheets from all of them — and say
// which file each one came from, because "page 3" means nothing across five sets.

test('kept sheets are gathered from every file, labelled with the file', () => {
  const m = mergeProposals([
    { fileName: 'arch.pdf', proposal: { ...p([]), keptSheets: [{ page: 10, key: 'sheets/a.jpg', bytes: 900 }] } },
    { fileName: 'site.pdf', proposal: { ...p([]), keptSheets: [{ page: 2,  key: 'sheets/b.jpg', bytes: 800 }] } },
  ]);
  assert.equal(m.keptSheets.length, 2);
  assert.deepEqual(m.keptSheets.map(s => s.file), ['arch.pdf', 'site.pdf']);
  assert.equal(m.keptSheets[0].key, 'sheets/a.jpg');
  assert.equal(m.keptSheets[0].page, 10, 'the page number survives the merge');
});

test('a file whose sheets could not be stored does not sink the others', () => {
  // Keeping a copy is best-effort: S3 can refuse one PUT and succeed on the
  // next. The reviewer should still see whatever did land.
  const m = mergeProposals([
    { fileName: 'nostore.pdf', proposal: { ...p([]), keptSheets: null } },
    { fileName: 'stored.pdf',  proposal: { ...p([]), keptSheets: [{ page: 1, key: 'sheets/c.jpg' }] } },
  ]);
  assert.equal(m.keptSheets.length, 1);
  assert.equal(m.keptSheets[0].file, 'stored.pdf');
});

test('a sheet entry with no key is dropped, not passed on as a broken thumbnail', () => {
  const m = mergeProposals([
    { fileName: 'a.pdf', proposal: { ...p([]), keptSheets: [{ page: 1 }, null, { page: 2, key: 'sheets/d.jpg' }] } },
  ]);
  assert.deepEqual(m.keptSheets.map(s => s.key), ['sheets/d.jpg']);
});

test('no kept sheets at all comes back null, not an empty list', () => {
  // The review UI hides the panel on null; an empty array would render a
  // heading over nothing.
  const m = mergeProposals([{ fileName: 'a.pdf', proposal: p([]) }]);
  assert.equal(m.keptSheets, null);
});


// ── Reading a set in slices ──────────────────────────────────────────────────
// A real set is too big to read inside one request: Amplify's front door hangs
// up at ~30 seconds, so the scan reads for a few seconds, parks what it got,
// and is called again. These cover the two ways that loop can go wrong.

/** A stand-in pdfjs document. `delayMs` is how long each page takes to read. */
function fakeDoc(numPages, delayMs = 0) {
  return {
    numPages,
    async getPage(n) {
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
      return {
        getTextContent: async () => ({ items: [{ str: `page ${n}` }] }),
        cleanup() {},
      };
    },
  };
}

test('slices resume where the last one stopped and cover the set exactly once', async () => {
  const doc = fakeDoc(10, 6);
  const all = [];
  let from = 1;
  for (let guard = 0; guard < 20; guard++) {
    const r = await extractPdfPages(doc, { fromPage: from, timeBudgetMs: 20 });
    all.push(...r.pages.map(p => p.page));
    if (!r.nextPage) break;
    assert.ok(r.nextPage > from, 'a slice that does not move forward would loop forever');
    from = r.nextPage;
  }
  assert.deepEqual(all, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('a slice whose budget is already gone still reads one page', async () => {
  // Opening a 60 MB set by byte range can itself outlast the slice budget. If
  // that meant reading nothing, the browser would ask again, get nothing again,
  // and the read would never finish -- which is the bug this guards.
  const r = await extractPdfPages(fakeDoc(5, 2), { fromPage: 2, timeBudgetMs: 0 });
  assert.equal(r.pages.length, 1);
  assert.equal(r.pages[0].page, 2);
  assert.equal(r.nextPage, 3);
});

test('a read stopped by the memory brake is finished, not paused', async () => {
  // Running out of TIME is resumable. Running out of ROOM is not: the next
  // slice would re-open the same file, measure the same pressure and stop in
  // the same place, forever. The pages worth having are at the front anyway.
  const r = await extractPdfPages(fakeDoc(50), { shouldStop: () => true });
  assert.equal(r.braked, true);
  assert.equal(r.nextPage, null, 'a braked read must not ask to be resumed');
  // REVERSED 2026-09-15 (Lone Tree ARCH, 85 MB): the brake is latched and
  // measures the whole process, so it is routinely already on the moment a big
  // set is opened. Zero pages read then got judged "no text layer". The
  // mandatory first page is read regardless; the brake takes hold after it.
  assert.equal(r.pages.length, 1, 'the mandatory first page is still read');
  assert.equal(r.pages[0].page, 1);
});

test('a brake that is already on when the set is opened still stops after one page', async () => {
  let asked = 0;
  const r = await extractPdfPages(fakeDoc(50), { shouldStop: () => { asked++; return true; } });
  assert.equal(r.pages.length, 1);
  assert.equal(r.braked, true);
  assert.equal(r.nextPage, null);
  assert.equal(asked, 1, 'the brake is consulted once, before page 2, and honoured');
});

test('a brake that comes on mid-read keeps every page banked before it', async () => {
  let calls = 0;
  const r = await extractPdfPages(fakeDoc(50), { shouldStop: () => ++calls > 3 });
  assert.deepEqual(r.pages.map(p => p.page), [1, 2, 3, 4]);
  assert.equal(r.braked, true);
  assert.equal(r.nextPage, null);
});

test('a braked read that found no text is reported as too big, not as a blank scan', async () => {
  // One page of a 33-sheet set, no text on it, brake on: we do not know the
  // set has no text layer — we know we could not hold it open. The message
  // says which, and the route still sends it on to the vision read.
  const blankDoc = { ...fakeDoc(33), async getPage() { return { getTextContent: async () => ({ items: [] }), cleanup() {} }; } };
  const r = await extractDrawingText(blankDoc, 'ARCH.pdf', { shouldStop: () => true });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'too_big_to_read');
  assert.match(r.message, /1 of 33 pages/);
  assert.equal(r.scan.braked, true);
  assert.equal(r.scan.scannedPages, 1);
});

test('a blank set read in FULL is still a blank scan (no_text_layer)', async () => {
  const blankDoc = { ...fakeDoc(3), async getPage() { return { getTextContent: async () => ({ items: [] }), cleanup() {} }; } };
  const r = await extractDrawingText(blankDoc, 'scan.pdf', {});
  assert.equal(r.ok, false);
  assert.equal(r.code, 'no_text_layer');
});

test('a braked read that DID find text comes back ok, with the brake flagged on the scan', async () => {
  // fakeDoc's "page N" is under the 30-character floor; give page 1 real words.
  const wordyDoc = { ...fakeDoc(40), async getPage(n) { return { getTextContent: async () => ({ items: [{ str: `SITE PLAN SHEET ${n} — TOTAL UNITS 168, GROSS AREA 226,396 SF` }] }), cleanup() {} }; } };
  const r = await extractDrawingText(wordyDoc, 'set.pdf', { shouldStop: () => true });
  assert.equal(r.ok, true);
  assert.equal(r.scan.braked, true);
  assert.equal(r.scan.scannedPages, 1);
  assert.equal(r.scan.totalPages, 40);
});

test('finishing the set reports nothing left to read', async () => {
  const r = await extractPdfPages(fakeDoc(3), { timeBudgetMs: 5000 });
  assert.equal(r.scannedPages, 3);
  assert.equal(r.nextPage, null);
  assert.equal(r.braked, false);
});

test('the page cap ends the read rather than asking for pages that do not exist', async () => {
  const r = await extractPdfPages(fakeDoc(100), { maxPages: 4, timeBudgetMs: 5000 });
  assert.equal(r.scannedPages, 4);
  assert.equal(r.nextPage, null);
  assert.equal(r.stoppedEarly, true);
});

test('a page whose fetches never answer is raced out, not waited on forever', async () => {
  // Measured on production with the Skyline Ridge set (2026-09-02): one
  // page's range fetches sat past the front door's ~28s and the request died
  // as an empty 504 — because getPage() sat OUTSIDE the timeout race, which
  // guarded only getTextContent. The window has to cover the whole page,
  // from "ask for it" to "have its text".
  const doc = {
    numPages: 5,
    async getPage(n) {
      if (n === 3) return new Promise(() => {});   // storage never answers
      return { getTextContent: async () => ({ items: [{ str: `page ${n}` }] }), cleanup() {} };
    },
  };
  const t0 = Date.now();
  const r = await extractPdfPages(doc, { fromPage: 1, timeBudgetMs: 300 });
  assert.ok(Date.now() - t0 < 5_000, 'the hung page must be cut off by the window');
  assert.deepEqual(r.pages.map(p => p.page), [1, 2]);
  assert.equal(r.nextPage, 3, 'a page that ran out of THIS slice gets a fresh try next slice');
  assert.equal(r.stoppedEarly, true);
});
