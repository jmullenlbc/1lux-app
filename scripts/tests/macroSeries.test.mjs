// National numbers strip (migration 0128, Mike 10-8). Pure, no DB, no fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MACRO_SERIES, fredCsvUrl, parseFredCsv, latestAndYearAgo, formatMacroValue, formatMacroDelta, formatMacroDate } from '../../src/lib/market-intel/macroSeries.js';

test('catalog: nine series, each with a label, a unit and a cadence', () => {
  assert.equal(MACRO_SERIES.length, 9);
  for (const s of MACRO_SERIES) {
    assert.ok(s.id && s.label && s.blurb);
    assert.ok(['pct', 'kunits', 'index'].includes(s.unit));
    assert.ok(['daily', 'weekly', 'monthly', 'quarterly'].includes(s.cadence));
  }
  assert.equal(fredCsvUrl('HOUST5F', Date.UTC(2025, 7, 1)), 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=HOUST5F&cosd=2025-08-01');
});

test('FRED CSV: header dropped, "." rows dropped, dates at UTC midnight, sorted', () => {
  const rows = parseFredCsv('observation_date,DFF\r\n2026-10-07,3.88\r\n2026-10-06,.\r\n2026-10-05,3.90\r\n');
  assert.deepEqual(rows.map(r => r.value), [3.90, 3.88]);
  assert.equal(rows[0].date.toISOString(), '2026-10-05T00:00:00.000Z');
  assert.deepEqual(parseFredCsv(''), []);
  assert.deepEqual(parseFredCsv('<html>oops</html>'), []);
});

test('latest and a year ago: the newest row dated at or before 365 days earlier', () => {
  const d = (s) => new Date(`${s}T00:00:00.000Z`);
  const rows = [
    { date: d('2026-08-01'), value: 344 }, { date: d('2025-07-01'), value: 300 },
    { date: d('2025-08-01'), value: 407 }, { date: d('2025-09-01'), value: 471 },
  ];
  const { latest, yearAgo } = latestAndYearAgo(rows);
  assert.equal(latest.value, 344);
  assert.equal(yearAgo.value, 407);
  assert.deepEqual(latestAndYearAgo([]), { latest: null, yearAgo: null });
  assert.equal(latestAndYearAgo([{ date: d('2026-08-01'), value: 1 }]).yearAgo, null);
});

test('formatting: values, year-ago deltas and dates read as a salesperson would say them', () => {
  assert.equal(formatMacroValue('pct', 3.88), '3.88%');
  assert.equal(formatMacroValue('kunits', 344.4), '344K');
  assert.equal(formatMacroValue('index', 375.908), '375.9');
  assert.equal(formatMacroValue('count', 1234), '1,234');
  assert.equal(formatMacroValue('pct', null), '');
  assert.deepEqual(formatMacroDelta('pct', 5.28, 4.10), { text: '+1.18 pts vs a year ago', direction: 'up' });
  assert.deepEqual(formatMacroDelta('kunits', 344, 407), { text: '-15.5% vs a year ago', direction: 'down' });
  assert.deepEqual(formatMacroDelta('index', 100, 100), { text: 'unchanged', direction: 'flat' });
  assert.deepEqual(formatMacroDelta('index', 100, null), { text: '', direction: 'flat' });
  assert.equal(formatMacroDate('monthly', '2026-08-01T00:00:00.000Z'), 'Aug 2026');
  assert.equal(formatMacroDate('quarterly', '2026-04-01T00:00:00.000Z'), 'Q2 2026');
  assert.equal(formatMacroDate('daily', '2026-10-07T00:00:00.000Z'), 'Oct 7, 2026');
});
