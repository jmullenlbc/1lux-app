/**
 * Construction-schedule milestone extraction.
 *
 * These exist because of a real miss found 2026-08-19 on the Marmalade
 * schedule: the deterministic pass only understood M/D/YY dates, but most GCs
 * export from Primavera P6, which writes DD-Mon-YY. On a P6 schedule it found
 * its keyword rows, found no date on them, and returned nothing — and that
 * pass is the floor that is supposed to survive an AI timeout.
 *
 * Run: node --test scripts/tests/scheduleExtract.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keywordExtractMilestones, mergeMilestones } from '../../src/lib/scheduleExtract.js';

const byId = (ms, id) => ms.find(m => m.id === id);

test('reads Primavera P6 dates (DD-Mon-YY) — the format that used to return nothing', () => {
  const ms = keywordExtractMilestones([
    'MM2270 NTP / Start Construction 100% 0 0 27-Jan-25 A',
    'MM61860 TCO Phase #3 0% 1 1 16-Aug-27 17-Aug-27',
    'MM30785 Project Final Completion (End PHASE) 0% 0 0 26-Aug-27*',
  ].join('\n'));
  assert.equal(byId(ms, 'construction-start').date, '2025-01-27');
  assert.equal(byId(ms, 'tco-1').date,              '2027-08-17');
  assert.equal(byId(ms, 'construction-end').date,   '2027-08-26');
});

test("P6's actual marker and constraint asterisk are not part of the date", () => {
  // "27-Jan-25 A" and "26-Aug-27*" must parse as clean dates, not fail.
  const ms = keywordExtractMilestones('NTP 0% 0 0 27-Jan-25 A\nFinal Completion 0% 0 0 26-Aug-27*');
  assert.equal(byId(ms, 'construction-start').date, '2025-01-27');
  assert.equal(byId(ms, 'construction-end').date,   '2027-08-26');
});

test('still reads MS Project / Excel dates (M/D/YY)', () => {
  const ms = keywordExtractMilestones('Notice to Proceed 3/4/25 5/1/25\nSubstantial Completion 6/1/27 6/30/27');
  assert.equal(byId(ms, 'construction-start').date, '2025-03-04');
  assert.equal(byId(ms, 'construction-end').date,   '2027-06-30');
});

test('a row with both formats keeps column order — first date is the start', () => {
  const ms = keywordExtractMilestones('Mobilization 1/2/25 15-Mar-25');
  assert.equal(byId(ms, 'construction-start').date, '2025-01-02');
});

test('completion-type milestones take the FINISH date, not the start', () => {
  const ms = keywordExtractMilestones('NTP 01-Jan-25\nOwners Walk 01-Jun-27 30-Jun-27');
  assert.equal(byId(ms, 'construction-end').date, '2027-06-30');
});

test('a three-letter word that is not a month is not a date', () => {
  // "12-Bld-25" must not become 2025-??-12.
  const ms = keywordExtractMilestones('NTP / Start Construction 12-Bld-25');
  assert.equal(ms.length, 0);
});

test('years outside 2020–2040 are rejected', () => {
  assert.equal(keywordExtractMilestones('NTP 27-Jan-99').length, 0);
  assert.equal(keywordExtractMilestones('NTP 27-Jan-1999').length, 0);
});

test('rough-in rows match in either word order', () => {
  const fwd = keywordExtractMilestones('NTP 01-Jan-25\nBldg A MEP Rough-In 05-Feb-26 01-Mar-26');
  const rev = keywordExtractMilestones('NTP 01-Jan-25\nBldg A Rough-In MEP 05-Feb-26 01-Mar-26');
  assert.equal(byId(fwd, 'mep-rough-1').date, '2026-02-05');
  assert.equal(byId(rev, 'mep-rough-1').date, '2026-02-05');
});

test('bare "Electrical" is NOT a rough-in — the keyword still requires "rough"', () => {
  // These rows exist in every schedule and are not rough-ins. Matching them
  // would put procurement and trenching dates on a lighting timeline.
  const ms = keywordExtractMilestones([
    'NTP / Start Construction 01-Jan-25',
    'Trench For Electrical 10-Feb-25 20-Feb-25',
    'Submittals - Electrical Gear / Transformer / Panels 01-Mar-25 01-Apr-25',
    'Electrical - Lighting 18-Apr-25 11-Sep-25',
  ].join('\n'));
  assert.equal(ms.filter(m => m.id.startsWith('electrical-rough')).length, 0);
});

test('rough-ins before construction start are dropped as design-phase noise', () => {
  const ms = keywordExtractMilestones([
    'MEP Rough coordination 01-Jun-24 30-Jun-24',   // pre-NTP: design phase
    'NTP / Start Construction 01-Jan-25',
    'Bldg A MEP Rough-In 05-Feb-26 01-Mar-26',
  ].join('\n'));
  const roughs = ms.filter(m => m.id.startsWith('mep-rough'));
  assert.equal(roughs.length, 1);
  assert.equal(roughs[0].date, '2026-02-05');
});

test('empty or dateless input returns an empty list, never throws', () => {
  assert.deepEqual(keywordExtractMilestones(''), []);
  assert.deepEqual(keywordExtractMilestones(null), []);
  assert.deepEqual(keywordExtractMilestones('NTP / Start Construction\nTCO Phase 1'), []);
});


/**
 * mergeMilestones — the 2026-08-19 fix.
 *
 * The old code picked whichever pass returned MORE rows. The keyword scan pads
 * itself to 15 electrical + 15 MEP rough-ins, so on Mike's real Marmalade
 * schedule it returned 19 rows against the AI's 16, won on count, and threw away
 * the light-fixture and site-lighting dates — the two a lighting company plans
 * around. These lock the union behaviour in.
 */
const ai = (id, date, label = id) => ({ id, label, date });

test("the AI's answer is never discarded just because the keyword scan is longer", () => {
  const smartButShort = [ai('construction-start', '2025-01-27'), ai('light-fixtures', '2026-06-18')];
  const dumbButLong   = [
    ai('construction-start', '2025-01-27'),
    ai('electrical-rough-1', '2026-01-15'), ai('electrical-rough-2', '2026-02-13'),
    ai('electrical-rough-3', '2026-03-06'), ai('tco', '2027-08-18'),
  ];
  const out = mergeMilestones(smartButShort, dumbButLong);
  assert.ok(out.find(m => m.id === 'light-fixtures'), 'light-fixtures survived the merge');
  assert.ok(out.find(m => m.id === 'tco'),            'keyword-only tco filled the gap');
  assert.equal(out.length, 6);
});

test('the AI wins on any id both passes found', () => {
  const out = mergeMilestones(
    [ai('tco', '2027-08-18', 'TCO — Building C (Phase 3, Final)')],
    [ai('tco', '2027-01-06', 'TCO')],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].date,  '2027-08-18');
  assert.equal(out[0].label, 'TCO — Building C (Phase 3, Final)');
});

test('rough-ins merge by family, so two numbering schemes never interleave', () => {
  // The AI numbers per building (A, B, C). The keyword scan numbers by whatever
  // order dates appeared and always pads out further. Filling gaps id-by-id
  // would graft rough-ins 4..15 onto a 3-building job and invent buildings.
  const smart = [ai('electrical-rough-1', '2025-12-12'), ai('electrical-rough-2', '2026-01-13'),
                 ai('electrical-rough-3', '2026-04-20')];
  const dumb  = Array.from({ length: 15 }, (_, i) =>
    ai(`electrical-rough-${i + 1}`, `2026-0${(i % 9) + 1}-01`));
  const out = mergeMilestones(smart, dumb);
  assert.equal(out.filter(m => m.id.startsWith('electrical-rough')).length, 3);
});

test('a family the AI missed entirely is still taken from the keyword scan', () => {
  const out = mergeMilestones(
    [ai('electrical-rough-1', '2025-12-12')],
    [ai('mep-rough-1', '2025-10-24'), ai('mep-rough-2', '2026-01-06')],
  );
  assert.equal(out.filter(m => m.id.startsWith('mep-rough')).length, 2);
});

test('either side being empty is not an error', () => {
  assert.equal(mergeMilestones([], [ai('tco', '2027-08-18')]).length, 1);
  assert.equal(mergeMilestones([ai('tco', '2027-08-18')], []).length, 1);
  assert.deepEqual(mergeMilestones([], []), []);
  assert.deepEqual(mergeMilestones(), []);
});

test('output is in job order, with rough-ins ascending inside their block', () => {
  const out = mergeMilestones([
    ai('construction-end',   '2027-08-26'),
    ai('electrical-rough-2', '2026-01-13'),
    ai('light-fixtures',     '2026-02-26'),
    ai('electrical-rough-1', '2025-12-12'),
    ai('mep-rough-1',        '2025-10-24'),
    ai('construction-start', '2025-01-27'),
  ], []);
  assert.deepEqual(out.map(m => m.id), [
    'construction-start', 'mep-rough-1', 'electrical-rough-1', 'electrical-rough-2',
    'light-fixtures', 'construction-end',
  ]);
});


/**
 * Per-building light fixtures, final inspection and TCO — 2026-08-19.
 *
 * Mike: "yes do it 1 per bldg. that is a big deal. do final inspection or tco
 * per bldg too." On a four-building job the fixtures go in six months apart, so
 * a single project-level fixture date is wrong for three of the four buildings —
 * and that date is when material has to be on site.
 *
 * The AI does the labelling ("Light Fixtures — Bldg B"); these lock down the
 * deterministic floor, which has to hold up when the AI call times out.
 */

test('light fixtures come back one per install date, not one per project', () => {
  const ms = keywordExtractMilestones([
    'MM100 NTP / Start Construction 06-Jan-25',
    'MM200 Set Light Fixtures - Bldg A 02-Jun-25 01-Jul-25',
    'MM300 Install Light Fixtures Bldg B 02-Sep-25 01-Oct-25',
  ].join('\n'));
  assert.equal(byId(ms, 'light-fixtures-1').date, '2025-06-02');
  assert.equal(byId(ms, 'light-fixtures-2').date, '2025-09-02');
});

test('fixture rows that are not an install do not become fixture milestones', () => {
  // Every one of these appears on a real schedule months before a fixture is
  // hung, or belongs to site lighting instead.
  const ms = keywordExtractMilestones([
    'MM100 NTP / Start Construction 06-Jan-25',
    'MM110 Light Fixture Submittals 02-Jan-25 09-Jan-25',
    'MM120 Procure Light Fixtures 02-Feb-25 09-Feb-25',
    'MM130 Deliver Light Fixtures 02-Mar-25 09-Mar-25',
    'MM140 Set Site Light Poles 01-Aug-25 09-Aug-25',
  ].join('\n'));
  assert.equal(ms.filter(m => m.id.startsWith('light-fixtures')).length, 0);
});

test('final inspection is per building, and a rough inspection is not one', () => {
  const ms = keywordExtractMilestones([
    'MM100 NTP / Start Construction 06-Jan-25',
    'MM200 Rough Inspection 04-Mar-25 05-Mar-25',
    'MM300 Final Electrical Inspection Bldg A 15-Jul-25 16-Jul-25',
    'MM400 Final Inspection Bldg B 15-Oct-25 16-Oct-25',
  ].join('\n'));
  assert.equal(byId(ms, 'final-inspection-1').date, '2025-07-16'); // finish date
  assert.equal(byId(ms, 'final-inspection-2').date, '2025-10-16');
  assert.equal(ms.filter(m => m.id.startsWith('final-inspection')).length, 2);
});

test('every building gets its own TCO instead of only the last one', () => {
  const ms = keywordExtractMilestones([
    'MM100 NTP / Start Construction 06-Jan-25',
    'MM200 TCO Bldg A 20-Jul-25 21-Jul-25',
    'MM300 TCO Bldg B 20-Oct-25 21-Oct-25',
    'MM400 TCO Bldg C 20-Jan-26 21-Jan-26',
  ].join('\n'));
  assert.deepEqual(
    ms.filter(m => m.id.startsWith('tco')).map(m => m.date),
    ['2025-07-21', '2025-10-21', '2026-01-21'],
  );
});

test('site lighting and final completion stay single — one site, one handover', () => {
  const ms = keywordExtractMilestones([
    'MM100 NTP / Start Construction 06-Jan-25',
    'MM200 Turnover Keys Bldg A 01-Nov-25 05-Nov-25',
    'MM300 Turnover Keys Bldg B 01-Dec-25 05-Dec-25',
  ].join('\n'));
  assert.equal(ms.filter(m => m.id.startsWith('construction-end')).length, 1);
  assert.equal(byId(ms, 'construction-end').date, '2025-12-05'); // the latest
});

test('the AI owns a whole per-building family, so the two numberings never mix', () => {
  // AI read three buildings and named them; the keyword floor found five dates
  // it cannot attribute. Taking the extra two would invent Bldg D and E.
  const out = mergeMilestones(
    [ai('light-fixtures-1', '2026-02-26', 'Light Fixtures — Bldg A'),
     ai('light-fixtures-2', '2026-05-14', 'Light Fixtures — Bldg B'),
     ai('light-fixtures-3', '2026-09-02', 'Light Fixtures — Bldg C')],
    [ai('light-fixtures-1', '2026-01-05'), ai('light-fixtures-2', '2026-02-26'),
     ai('light-fixtures-3', '2026-05-14'), ai('light-fixtures-4', '2026-09-02'),
     ai('light-fixtures-5', '2026-11-30')],
  );
  assert.equal(out.length, 3);
  assert.deepEqual(out.map(m => m.label),
    ['Light Fixtures — Bldg A', 'Light Fixtures — Bldg B', 'Light Fixtures — Bldg C']);
});

test('a bare "tco" from a schedule parsed before today still merges and sorts', () => {
  // Older projects stored un-suffixed ids. They must keep working, and a bare
  // id still counts as its family so nothing doubles up.
  const out = mergeMilestones([ai('tco', '2027-08-18')], [ai('tco-1', '2027-01-01')]);
  assert.deepEqual(out.map(m => m.id), ['tco']);
});

test('final inspection sorts before TCO, which sorts before final completion', () => {
  const out = mergeMilestones([
    ai('construction-end',    '2027-08-26'),
    ai('tco-1',               '2027-06-01'),
    ai('final-inspection-1',  '2027-05-01'),
    ai('light-fixtures-1',    '2026-02-26'),
    ai('construction-start',  '2025-01-27'),
  ], []);
  assert.deepEqual(out.map(m => m.id), [
    'construction-start', 'light-fixtures-1', 'final-inspection-1', 'tco-1',
    'construction-end',
  ]);
});
