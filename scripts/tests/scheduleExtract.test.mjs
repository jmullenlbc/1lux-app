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
import { keywordExtractMilestones } from '../../src/lib/scheduleExtract.js';

const byId = (ms, id) => ms.find(m => m.id === id);

test('reads Primavera P6 dates (DD-Mon-YY) — the format that used to return nothing', () => {
  const ms = keywordExtractMilestones([
    'MM2270 NTP / Start Construction 100% 0 0 27-Jan-25 A',
    'MM61860 TCO Phase #3 0% 1 1 16-Aug-27 17-Aug-27',
    'MM30785 Project Final Completion (End PHASE) 0% 0 0 26-Aug-27*',
  ].join('\n'));
  assert.equal(byId(ms, 'construction-start').date, '2025-01-27');
  assert.equal(byId(ms, 'tco').date,                '2027-08-17');
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
