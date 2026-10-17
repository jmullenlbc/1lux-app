/**
 * Unit tests for area-sheet finding and net-vs-gross classification.
 * Pure logic only, no model calls, no file IO.
 * Run: node --test scripts/tests/areaSheet.test.mjs
 *
 * The fixtures are real text off BECK's Virgin Hotel Fox Park set (2026-08-18),
 * shortened but not paraphrased. That matters: this whole module keys off the
 * exact wording architects print, so a test written against invented labels
 * would pass while the real thing failed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreAreaPage, findAreaSheets, sheetNumberOf, classifyAreaBasis,
  toGross, resolveGrossSf, describeBasis, CONFIDENT_ENOUGH,
  GROSS_FROM_NET, GROSS_FROM_CODE,
  looksLikeSheetIndex, findAreaNumbers, focusAroundNumber,
} from '../../src/lib/areaSheet.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

// A-811: the program breakdown BECK issued separately. The gold standard.
const PROGRAM_SHEET = `
  LIGHTING PROGRAM AREA PLAN   PROGRAM BREAKDOWN
  GUESTROOMS 115,099   BOH 29,292   CORRIDOR/STAIRWELLS 28,378
  INTERIOR AMENITY 27,720   EXTERIOR AMENITY 11,065
  FOH CIRCULATION 11,411   FOH RESTROOMS 2,447
  BUILDING GROSS SF 233,050
  JOB NO. 176305   SHEET A-811
`;

// G0.02: what a normal set actually carries. Net, and it does not say so.
const STATS_SHEET = `
  BUILDING STATISTICS   GUESTROOM MIX
  ROOM TYPE   AVG AREA   COUNT
  STANDARD KING CHAMBER   327   142
  QUEEN/QUEEN CHAMBER     341    78
  TOTAL 105,903 SF   260 KEYS
  JOB NO. 176305   SHEET G0.02
`;

// LS0.01: the trap. Looks authoritative, runs ~5% under true gross.
const CODE_SHEET = `
  LIFE SAFETY PLAN   BUILDING CODE SUMMARY
  ALLOWABLE AREA PER TABLE 506.2
  LEVEL 01 ACTUAL AREA 24,556   LEVEL 02 ACTUAL AREA 24,556
  TOTAL ACTUAL AREA 221,022
  SHEET LS0.01
`;

const FLOOR_PLAN = `
  LEVEL 04 FLOOR PLAN   CORRIDOR   CORRIDOR   CORRIDOR
  SEE SHEET A-201 FOR ENLARGED PLANS   1/8" = 1'-0"
`;

// ── Fixtures from the four real-data failures (Fox Park DD, 2026-08-18) ──────
// Each of these produced a WRONG answer before the fix. Shortened, not invented.

// G0.01. Names every sheet in the set, so it matches every marker we look for
// and carries no number at all. Classified as a code area at 0.75, above the
// review threshold, which would have applied a 5.4% uplift silently.
const SHEET_INDEX = `
  SHEET INDEX
  G0.00 COVER SHEET          G0.01 SHEET INDEX
  G0.02 BUILDING STATISTICS  G0.03 GRAPHIC STANDARDS
  G0.06 GUESTROOM MIX        G0.07 GUESTROOM MIX
  LS0.01 LIFE SAFETY PLAN — CODE SUMMARY / ALLOWABLE AREA
  LS0.02 LIFE SAFETY PLAN    LS2.01 LIFE SAFETY LEVEL 01
  A0.01 AREA PLAN            A0.02 AREA SCHEDULE
  A-811 LIGHTING PROGRAM AREA PLAN   A-812 PROGRAM BREAKDOWN
  C-000 CIVIL COVER          E6.01 ELECTRICAL   P1.01 PLUMBING
`;

// G0.02 as it really reads: TWO tables on ONE sheet, two different bases. Judged
// as a whole page this is a coin flip; judged around the number it is not.
//
// The guestroom rows are repeated because the real sheet lists 260 of them, the
// two tables sit about 2,000 characters apart, and that distance is part of what
// the classifier reads. A fixture with two rows would be a harder page than any
// architect has ever drawn.
const MIX_ROWS = [
  'LEVEL 03   314   STANDARD QUEEN/QUEEN CHAMBER   341 SF   1',
  'LEVEL 05   528   STANDARD KING CHAMBER   327 SF   1',
  'LEVEL 06   629   GRAND KING CHAMBER   547 SF   1',
  'LEVEL 04   412   ONE BEDROOM SUITE - KING - C   612 SF   1',
].join('\n  ');
const TWO_TABLE_SHEET = `
  BUILDING STATISTICS
  GUESTROOM MIX   GUESTROOM TYPE   AVG AREA   KEYS
  ${[MIX_ROWS, MIX_ROWS, MIX_ROWS, MIX_ROWS, MIX_ROWS, MIX_ROWS, MIX_ROWS, MIX_ROWS].join('\n  ')}
  TOTAL ACCESSIBLE GUESTROOMS: 17   NET RENTABLE 105,903 SF
  GROSS BUILDING AREA   LEVEL   PROGRAM   AREA
  LEVEL 01 LOBBY / AMENITY / BOH   34,299 SF
  LEVEL 02 AMENITY / BOH   24,575 SF
  LEVEL 03 HOTEL GUESTROOMS   18,748 SF
  LEVEL 10 AMENITY / BOH   14,797 SF
  TOTAL BUILDING GSF   233,919 SF
  JOB NO. 176305   SHEET NO. G0.02
`;

// The same two tables jammed together with no rows between them. Genuinely
// ambiguous, there is no distance for the classifier to use, and it must come
// out flagged rather than confidently one way.
const TWO_TABLES_TOUCHING = `
  GUESTROOM MIX   AVG AREA   NET RENTABLE 105,903 SF
  GROSS BUILDING AREA   TOTAL BUILDING GSF   233,919 SF
`;

// The address block that produced "sheet PL100", a sheet that does not exist.
const ADDRESS_BLOCK = `
  LIGHTING PROGRAM AREA PLAN   PROGRAM BREAKDOWN   GUESTROOMS   BOH   AMENITY
  THE BECK GROUP   1001 17TH STREET SUITE PL100 DENVER, CO 80202
  SHEET   A-811
`;

// BECK's real A-811 text layer. The table is vector art; this is everything the
// PDF actually carries, Revit layer names and the title block. Zero numbers.
const VECTOR_ONLY = `
  LIGHTING PROGRAM AREA PLAN
  LIGHTING-BOH   LIGHTING-CORR-STAIR   LIGHTING-EXT-AMENITY
  LIGHTING-FOH-CIRCULATION   LIGHTING-FOH-RESTROOMS   LIGHTING-GUESTROOMS
  LIGHTING-INT-AMENITY
  VIRGIN HOTEL FOX PARK   JOB NO. 176305   SHEET   A-811
`;

// ── Finding the sheet ───────────────────────────────────────────────────────

test('the program breakdown sheet outscores everything else', () => {
  const scores = [PROGRAM_SHEET, STATS_SHEET, CODE_SHEET, FLOOR_PLAN].map(t => scoreAreaPage(t).score);
  assert.ok(scores[0] > scores[1], 'program breakdown beats the stats sheet');
  assert.ok(scores[0] > scores[2], 'program breakdown beats the code summary');
  assert.ok(scores[1] > scores[3], 'the stats sheet beats a plain floor plan');
});

test('a floor plan repeating one category word does not read as an area table', () => {
  // Guards the distinct-category rule: FLOOR_PLAN says CORRIDOR three times.
  // Counting hits rather than distinct words would have scored it like a table.
  assert.equal(scoreAreaPage(FLOOR_PLAN).categories, 0, 'no marker, so no category credit');
  assert.equal(scoreAreaPage(FLOOR_PLAN).score, 0);
});

test('empty and junk pages score zero rather than throwing', () => {
  for (const t of [null, undefined, '', '   ', 'x']) {
    assert.equal(scoreAreaPage(t).score, 0);
  }
});

test('findAreaSheets ranks candidates and carries sheet numbers', () => {
  const pages = [
    { page: 1, text: FLOOR_PLAN },
    { page: 2, text: CODE_SHEET },
    { page: 3, text: STATS_SHEET },
    { page: 4, text: PROGRAM_SHEET },
  ];
  const hits = findAreaSheets(pages, 3);
  assert.equal(hits[0].page, 4, 'program breakdown ranks first');
  assert.equal(hits[0].sheetNo, 'A-811');
  assert.ok(hits.length <= 3);
  assert.ok(!hits.some(h => h.page === 1), 'the plain floor plan is not a candidate');
});

test('findAreaSheets tolerates missing or empty page lists', () => {
  assert.deepEqual(findAreaSheets([]), []);
  assert.deepEqual(findAreaSheets(undefined), []);
});

test('sheetNumberOf prefers the token after SHEET, and gives up rather than guessing', () => {
  assert.equal(sheetNumberOf(PROGRAM_SHEET), 'A-811');
  assert.equal(sheetNumberOf(STATS_SHEET), 'G0.02');
  assert.equal(sheetNumberOf(CODE_SHEET), 'LS0.01');
  assert.equal(sheetNumberOf('no sheet number anywhere at all'), null);
  assert.equal(sheetNumberOf(''), null);
});

// ── Net vs gross: the accuracy-critical call ────────────────────────────────

test('the three Fox Park sheets classify as three different bases', () => {
  assert.equal(classifyAreaBasis(PROGRAM_SHEET).basis, 'gross');
  assert.equal(classifyAreaBasis(STATS_SHEET).basis,   'net');
  assert.equal(classifyAreaBasis(CODE_SHEET).basis,    'code');
});

test('an explicit BUILDING GROSS SF heading clears the review threshold', () => {
  const c = classifyAreaBasis(PROGRAM_SHEET);
  assert.ok(c.confidence >= CONFIDENT_ENOUGH, `expected confident, got ${c.confidence}`);
  assert.ok(c.evidence.length > 0, 'a verdict must be able to say why');
});

test('"AVG AREA" alone is enough to spot a net room schedule', () => {
  // The single most common real case: a set with no gross figure anywhere, just
  // a room mix table. Nothing on it contains the word "net".
  const c = classifyAreaBasis('ROOM TYPE   AVG AREA   COUNT\nKING 327 142');
  assert.equal(c.basis, 'net');
});

test('a page with no basis language at all returns unknown, not a guess', () => {
  const c = classifyAreaBasis(FLOOR_PLAN);
  assert.equal(c.basis, 'unknown');
  assert.equal(c.confidence, 0);
  assert.deepEqual(c.evidence, []);
});

test('mixed signals produce LOW confidence, not a confident coin-flip', () => {
  // A page carrying both a gross label and a net one is genuinely ambiguous.
  // The whole point of the confidence number is that this case scores badly.
  const mixed = 'BUILDING GROSS SF 233,050   ROOM TYPE AVG AREA 327   NET RENTABLE 105,903';
  const c = classifyAreaBasis(mixed);
  assert.ok(c.confidence < CONFIDENT_ENOUGH, `ambiguous page scored ${c.confidence}`);
});

test('confidence never claims certainty', () => {
  for (const t of [PROGRAM_SHEET, STATS_SHEET, CODE_SHEET]) {
    assert.ok(classifyAreaBasis(t).confidence <= 0.97);
  }
});

// ── The correction ──────────────────────────────────────────────────────────

test('a gross figure passes through untouched', () => {
  const r = toGross(233050, 'gross');
  assert.equal(r.value, 233050);
  assert.equal(r.adjusted, false);
  assert.equal(r.factor, 1);
});

test('a net figure is uplifted 8% for a mid-rise', () => {
  const r = toGross(105903, 'net', { buildingType: 'mid-rise hotel' });
  assert.equal(r.factor, GROSS_FROM_NET.midRise);
  assert.equal(r.value, Math.round(105903 * 1.08));
  assert.equal(r.adjusted, true);
});

test('a garden walk-up gets the smaller 5% uplift', () => {
  const r = toGross(133304, 'net', { buildingType: 'garden walk-up apartments' });
  assert.equal(r.factor, GROSS_FROM_NET.gardenWalkUp);
  // Trailhead's real check: 133,304 x 1.05 landed within 1% of footprint x 3.
  assert.equal(r.value, 139969);
});

test('the building profile can be read from the drawing text, not just the type field', () => {
  const r = toGross(100000, 'net', { sourceText: 'THREE-STORY WALK-UP RESIDENTIAL BUILDING' });
  assert.equal(r.profile, 'gardenWalkUp');
});

test('a code area is uplifted 5.4%, and Fox Park reproduces', () => {
  const r = toGross(221022, 'code');
  assert.equal(r.factor, GROSS_FROM_CODE);
  // The published gross for the same building is 233,050. Within a third of 1%.
  assert.ok(Math.abs(r.value - 233050) / 233050 < 0.005, `got ${r.value}`);
});

test('an unknown basis is left ALONE rather than silently corrected', () => {
  // The important negative case. Applying an uplift we cannot justify would turn
  // "we do not know" into a number that looks measured.
  const r = toGross(200000, 'unknown');
  assert.equal(r.value, 200000);
  assert.equal(r.adjusted, false);
  assert.match(r.note, /could not tell/i);
});

test('toGross refuses junk input without throwing', () => {
  for (const bad of [null, undefined, 0, -5, 'abc', NaN]) {
    assert.equal(toGross(bad, 'net').value, null);
  }
});

// ── End to end ──────────────────────────────────────────────────────────────

test('resolveGrossSf: gross sheet needs no review', () => {
  const r = resolveGrossSf(233050, PROGRAM_SHEET);
  assert.equal(r.basis, 'gross');
  assert.equal(r.value, 233050);
  assert.equal(r.needsReview, false);
});

test('resolveGrossSf: net room schedule is corrected AND explained', () => {
  const r = resolveGrossSf(105903, STATS_SHEET, { buildingType: 'hotel' });
  assert.equal(r.basis, 'net');
  assert.equal(r.statedValue, 105903, 'what the drawing said is preserved');
  assert.ok(r.value > 105903, 'the applied number is the uplifted one');
  assert.match(r.note, /net/i);
});

test('resolveGrossSf: unreadable basis fills the field AND flags it, Mike\'s rule', () => {
  // "fill the field, make red and give a confidence %", all three, together.
  const r = resolveGrossSf(180000, FLOOR_PLAN);
  assert.equal(r.value, 180000,   'the field is still filled');
  assert.equal(r.needsReview, true, 'and it is flagged');
  assert.equal(typeof r.confidence, 'number', 'and a confidence comes with it');
});

test('resolveGrossSf: the code-summary trap is caught and corrected', () => {
  // Left alone this is the silent 5%, a budget that looks completely normal.
  const r = resolveGrossSf(221022, CODE_SHEET);
  assert.equal(r.basis, 'code');
  assert.ok(r.value > 221022);
  assert.equal(r.adjusted, true);
});

test('resolveGrossSf survives a null square footage', () => {
  const r = resolveGrossSf(null, PROGRAM_SHEET);
  assert.equal(r.value, null);
  assert.equal(r.statedValue, null);
});

// ── The four real-data failures ─────────────────────────────────────────────

test('the drawing index is thrown out, not scored', () => {
  // THE worst failure this module can produce: G0.01 scored 70 and classified as
  // a code area at 0.75, confident enough to skip review, off a page that is
  // nothing but a list of sheet titles.
  assert.equal(looksLikeSheetIndex(SHEET_INDEX), true);
  assert.equal(scoreAreaPage(SHEET_INDEX).score, 0, 'an index must not be a candidate');

  const hits = findAreaSheets([{ page: 1, text: SHEET_INDEX }, { page: 2, text: PROGRAM_SHEET }]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].page, 2);
});

test('a real sheet that cross-references others is NOT an index', () => {
  // The first cut of this rule excluded half the set. On the real Fox Park DD
  // pages the sheet-number-shaped tokens are IBC occupancy groups (A-1, S-1,
  // R-1) and detail bubbles, not sheet numbers, 14 of them on a life-safety
  // sheet that we very much want to keep.
  const lifeSafety = CODE_SHEET + `
    OCCUPANCY A-1 A-2 A-3 S-1 S-2 R-1 CONSTRUCTION TYPE I-A II-B
    SEE L1 L2 L3 AND S-01 EL-01 A17.1 FOR DETAILS`;
  assert.equal(looksLikeSheetIndex(lifeSafety), false);
  assert.ok(scoreAreaPage(lifeSafety).score > 0);

  // "SEE SHEET INDEX" on a real drawing is a cross-reference, not an index.
  assert.equal(looksLikeSheetIndex('SEE SHEET INDEX ON G0.01 FOR THE FULL LIST'), false);
});

test('classification anchors to the table the number came from, not the page', () => {
  // One sheet, two tables, two bases. Judged whole, G0.02 is a coin flip.
  const whole = classifyAreaBasis(TWO_TABLE_SHEET);
  assert.ok(whole.confidence < CONFIDENT_ENOUGH, `whole page scored ${whole.confidence}`);

  const gross = classifyAreaBasis(TWO_TABLE_SHEET, { near: 233919 });
  assert.equal(gross.basis, 'gross');
  assert.ok(gross.confidence >= CONFIDENT_ENOUGH, `gross total scored ${gross.confidence}`);

  const net = classifyAreaBasis(TWO_TABLE_SHEET, { near: 105903 });
  assert.equal(net.basis, 'net', 'the same page reads NET around the room-schedule total');
});

test('the NEAREST label wins even when two tables touch', () => {
  // "…GROSS BUILDING AREA  TOTAL BUILDING GSF  233,919" with the net table right
  // above it. Both labels are close; only one of them is this number's heading.
  const c = classifyAreaBasis(TWO_TABLES_TOUCHING, { near: 233919 });
  assert.equal(c.basis, 'gross');
  assert.equal(classifyAreaBasis(TWO_TABLES_TOUCHING, { near: 105903 }).basis, 'net');
});

test('a number with no label beside it is flagged, however busy the page is', () => {
  // Nothing within reach to call it. The page has plenty of area language, but
  // none of it is attached to this figure, and that is a red flag not a verdict.
  const orphan = TWO_TABLE_SHEET.replace('TOTAL BUILDING GSF   233,919 SF', '198,400 SF');
  const c = classifyAreaBasis(orphan, { near: 198400 });
  assert.ok(c.confidence < CONFIDENT_ENOUGH, `unlabelled figure scored ${c.confidence}`);
});

test('a number that is not on the sheet falls back to the page AND loses confidence', () => {
  const c = classifyAreaBasis(TWO_TABLE_SHEET, { near: 999999 });
  assert.equal(c.focused, false);
  assert.ok(c.confidence < CONFIDENT_ENOUGH, 'an unanchored read must be flagged');
});

test('focusAroundNumber finds a figure written with or without commas', () => {
  assert.ok(focusAroundNumber('TOTAL BUILDING GSF 233,919 SF', 233919));
  assert.ok(focusAroundNumber('TOTAL BUILDING GSF 233919 SF', 233919));
  assert.equal(focusAroundNumber('TOTAL BUILDING GSF 233,919 SF', 12345), null);
  assert.equal(focusAroundNumber('', 233919), null);
  assert.equal(focusAroundNumber('anything', null), null);
});

test('resolveGrossSf uses the anchor end to end', () => {
  const g = resolveGrossSf(233919, TWO_TABLE_SHEET, { buildingType: 'hotel' });
  assert.equal(g.basis, 'gross');
  assert.equal(g.value, 233919, 'a gross figure is not uplifted');
  assert.equal(g.needsReview, false);

  const n = resolveGrossSf(105903, TWO_TABLE_SHEET, { buildingType: 'hotel' });
  assert.equal(n.basis, 'net');
  assert.ok(n.value > 105903, 'the net figure IS uplifted, off the same sheet');
});

test('a suite number in the address block is not reported as a sheet number', () => {
  // We reported "sheet PL100" on the real set. There is no sheet PL100.
  assert.equal(sheetNumberOf(ADDRESS_BLOCK), 'A-811');
  assert.equal(sheetNumberOf('1001 17TH STREET SUITE PL100 DENVER, CO 80202'), null);
});

test('"SHEET NO." beats a bare "SHEET" elsewhere on the page', () => {
  assert.equal(sheetNumberOf(TWO_TABLE_SHEET), 'G0.02');
  assert.equal(sheetNumberOf('SEE SHEET A-201 FOR DETAILS ... SHEET NO. G0.02'), 'G0.02');
});

test('a table that is a picture is reported as unreadable, not as an answer', () => {
  // BECK's A-811: the program breakdown is vector art. The sheet is found, it
  // scores high, but there is nothing on it to read, and pretending otherwise
  // is how a made-up number reaches a budget.
  const s = scoreAreaPage(VECTOR_ONLY);
  assert.ok(s.score > 0, 'the sheet is still found');
  assert.equal(s.readable, false);
  assert.equal(s.numbers, 0);

  assert.equal(classifyAreaBasis(VECTOR_ONLY).basis, 'unknown');
});

test('a readable sheet outranks a higher-scoring picture', () => {
  const hits = findAreaSheets([
    { page: 1, text: VECTOR_ONLY },   // scores higher on wording
    { page: 2, text: STATS_SHEET },   // but this one has numbers on it
  ]);
  assert.equal(hits[0].page, 2);
  assert.equal(hits[0].readable, true);
  assert.equal(hits[1].readable, false, 'the picture is still reported, so we can name the sheet');
});

test('findAreaNumbers keeps building areas and drops job numbers', () => {
  const found = findAreaNumbers('JOB NO. 176305   TOTAL BUILDING GSF 233,919 SF   21784 SF');
  const values = found.map(f => f.value);
  assert.ok(values.includes(233919));
  assert.ok(values.includes(21784), 'bare digits count when "SF" sits beside them');
  assert.ok(!values.includes(176305), 'a job number is not a building area');
});

test('describeBasis never leaks jargon at the reviewer', () => {
  for (const b of ['gross', 'net', 'code', 'unknown']) {
    const s = describeBasis(b, 0.8, ['says "Building Gross"']);
    assert.ok(s.length > 10);
    assert.ok(!/NRSF|GBA|basis:/i.test(s), `jargon leaked: ${s}`);
  }
});
