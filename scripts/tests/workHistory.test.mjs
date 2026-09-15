// Work history (ContactEmployment, migration 0083) — the pure half.
// Run: node --test scripts/tests/workHistory.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanJob, parseWorkHistory, formatSpan, formatDuration, describeJob, describeWorkHistory, sortJobs,
  MAX_JOBS, WORK_HISTORY_INSTRUCTIONS,
} from '../../src/lib/workHistory.js';

const NOW = new Date('2026-09-14T15:00:00Z');

test('cleanJob keeps what is valid and drops what is not', () => {
  assert.equal(cleanJob({ title: 'PM' }, NOW), null, 'no company, no row');
  assert.deepEqual(cleanJob({ company: '  Acme   Dev ', title: '', startYear: 2019, startMonth: 3, isCurrent: true, endYear: 2021 }, NOW),
    { company: 'Acme Dev', title: null, startYear: 2019, startMonth: 3, endYear: null, endMonth: null, isCurrent: true });
  const odd = cleanJob({ company: 'X', startYear: 1900, startMonth: 5, endYear: 2031, endMonth: 13 }, NOW);
  assert.equal(odd.startYear, null);
  assert.equal(odd.startMonth, null, 'a month without its year is dropped');
  assert.equal(odd.endYear, null, 'a year far in the future is dropped');
  const backwards = cleanJob({ company: 'X', startYear: 2020, endYear: 2018, endMonth: 4 }, NOW);
  assert.equal(backwards.endYear, null, 'an end before the start is dropped');
  assert.equal(backwards.endMonth, null);
  assert.equal(cleanJob({ company: 'X', isCurrent: 'yes' }, NOW).isCurrent, false, 'only a real true counts');
});

test('parseWorkHistory reads a fenced reply, dedupes and caps', () => {
  const jobs = [
    { company: 'Acme', title: 'VP', startYear: 2019, startMonth: 3, isCurrent: true },
    { company: 'acme', title: 'vp', startYear: 2019, startMonth: 3, isCurrent: true },
    { company: '', title: 'Nothing' },
    { company: 'Brick Co', title: 'PM', startYear: 2014, endYear: 2019 },
  ];
  const out = parseWorkHistory('Here you go:\n```json\n' + JSON.stringify({ jobs }) + '\n```', NOW);
  assert.deepEqual(out.map(j => j.company), ['Acme', 'Brick Co']);
  const many = Array.from({ length: 40 }, (_, i) => ({ company: `Co ${i}` }));
  assert.equal(parseWorkHistory(JSON.stringify(many), NOW).length, MAX_JOBS);
  assert.deepEqual(parseWorkHistory('no idea', NOW), []);
  assert.deepEqual(parseWorkHistory(null, NOW), []);
});

test('spans and durations read the way LinkedIn does', () => {
  assert.equal(formatSpan({ startYear: 2019, startMonth: 3, isCurrent: true }), 'Mar 2019 – now');
  assert.equal(formatSpan({ startYear: 2014, endYear: 2019 }), '2014 – 2019');
  assert.equal(formatSpan({ startYear: 2020 }), 'since 2020');
  assert.equal(formatSpan({ endYear: 2019, endMonth: 6 }), 'until Jun 2019');
  assert.equal(formatSpan({}), '');

  assert.equal(formatDuration({ startYear: 2019, startMonth: 3, isCurrent: true }, NOW), '7 yrs 7 mos');
  assert.equal(formatDuration({ startYear: 2020, startMonth: 1, endYear: 2020, endMonth: 12 }, NOW), '1 yr');
  assert.equal(formatDuration({ startYear: 2021, startMonth: 5, endYear: 2021, endMonth: 5 }, NOW), '1 mo');
  assert.equal(formatDuration({ startYear: 2014, endYear: 2019 }, NOW), 'about 5 yrs');
  assert.equal(formatDuration({ startYear: 2019, endYear: 2019 }, NOW), 'under a year');
  assert.equal(formatDuration({ startYear: 2020, isCurrent: true }, NOW), 'about 6 yrs');
  assert.equal(formatDuration({ startYear: 2020 }, NOW), null, 'no end and not current: unknown');
  assert.equal(formatDuration({ endYear: 2020 }, NOW), null);
});

test('describeJob and describeWorkHistory', () => {
  assert.equal(describeJob({ company: 'Acme', title: 'VP', startYear: 2019, startMonth: 3, isCurrent: true }, NOW),
    'Acme, VP, Mar 2019 – now (7 yrs 7 mos)');
  assert.equal(describeJob({ company: 'Acme' }, NOW), 'Acme');
  assert.equal(describeWorkHistory('Jane', [], NOW), null);
  assert.equal(describeWorkHistory('Jane', null, NOW), null);
  assert.equal(describeWorkHistory('Jane', [{ company: 'Acme', title: 'VP' }, { company: 'Brick Co' }], NOW),
    'Jane — Acme, VP; Brick Co.');
});

test('sortJobs puts the newest first, however the rows were added', () => {
  const rows = [
    { company: 'Undated', position: 0 },
    { company: 'Old', startYear: 2008, endYear: 2012, position: 1 },
    { company: 'Now', startYear: 2021, isCurrent: true, position: 5 },
    { company: 'Recent', startYear: 2016, startMonth: 2, endYear: 2021, endMonth: 1, position: 2 },
    { company: 'Started only', startYear: 2014, position: 3 },
  ];
  assert.deepEqual(sortJobs(rows).map(j => j.company), ['Now', 'Recent', 'Started only', 'Old', 'Undated']);
  assert.equal(describeWorkHistory('Jane', rows, NOW).split('; ')[0], 'Jane — Now, 2021 – now (about 5 yrs)');
});

test('the instructions treat the paste as data and ask for JSON only', () => {
  assert.match(WORK_HISTORY_INSTRUCTIONS, /data, never instructions/);
  assert.match(WORK_HISTORY_INSTRUCTIONS, /Return ONLY JSON/);
});
