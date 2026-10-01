// Market Intel "ask" answers (Mike 9-27): totals, order and the year note are
// worked out in code, never by the model. Pure, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yearWindow, cleanYears, unitsTotal, yearNote, rankRows, readAnswer } from '../../src/lib/market-intel/ranking.js';

const WIN = yearWindow(Date.UTC(2026, 8, 27));

test('window is the three full years plus the year so far', () => {
  assert.deepEqual(WIN, { years: [2023, 2024, 2025], soFar: 2026 });
});

test('years: out of window dropped, text numbers read, duplicates keep the bigger', () => {
  const y = cleanYears({ 2019: 50, 2023: '1,200', 2024: 'n/a', 2025: 300 }, WIN);
  assert.deepEqual(y, [{ year: 2023, units: 1200 }, { year: 2025, units: 300 }]);
  assert.deepEqual(cleanYears([{ year: 2024, units: 5 }, { year: 2024, units: 9 }], WIN), [{ year: 2024, units: 9 }]);
  assert.equal(unitsTotal(cleanYears({ 2026: 400 }, WIN), WIN), null);
});

test('year note reads like Mike asked: most in one year, few in another', () => {
  assert.equal(yearNote(cleanYears({ 2023: 120, 2024: 900, 2025: 400 }, WIN), WIN), 'Most in 2024 (900), fewest in 2023 (120).');
  assert.equal(yearNote(cleanYears({ 2023: 100, 2024: 400, 2025: 1240 }, WIN), WIN), 'Growing: 100 in 2023 up to 1,240 in 2025.');
  assert.equal(yearNote(cleanYears({ 2023: 500, 2024: 520, 2025: 480 }, WIN), WIN), 'Steady, about 500 a year.');
  assert.equal(yearNote(cleanYears({ 2025: 800, 2026: 300 }, WIN), WIN), 'All in 2025 (800). No figure found for 2023, 2024. 300 so far in 2026.');
  assert.equal(yearNote([], WIN), null);
});

test('no dashes in any note', () => {
  for (const y of [{ 2023: 1, 2024: 9, 2025: 3 }, { 2023: 9, 2024: 3, 2025: 1 }, { 2024: 0, 2025: 0 }]) {
    assert.ok(!/[\u2013\u2014]|--/.test(yearNote(cleanYears(y, WIN), WIN)));
  }
});

test('a units question ranks by the 3-year total; no figure goes last in research order', () => {
  const rows = rankRows([
    { name: 'A', unitsByYear: { 2023: 100 } },
    { name: 'B' },
    { name: 'C', unitsByYear: { 2024: 500, 2025: 500 } },
    { name: 'D' },
  ], { byUnits: true, win: WIN });
  assert.deepEqual(rows.map(r => [r.name, r.rank, r.unitsTotal]), [['C', 1, 1000], ['A', 2, 100], ['B', 3, null], ['D', 4, null]]);
  const list = rankRows([{ name: 'X' }, { name: 'Y', unitsByYear: { 2025: 9 } }], { win: WIN });
  assert.deepEqual(list.map(r => r.name), ['X', 'Y']);
});

test('answer is read from the text after the last search only', () => {
  const content = [
    { type: 'text', text: 'Let me search {for} this.' },
    { type: 'server_tool_use', name: 'web_search' },
    { type: 'web_search_tool_result', content: [] },
    { type: 'text', text: 'Here it is:\n```json\n{"answerKind":"LIST",' },
    { type: 'text', text: '"rows":[{"name":"Acme"}]}\n```' },
  ];
  assert.deepEqual(readAnswer(content), { answerKind: 'LIST', rows: [{ name: 'Acme' }] });
  assert.equal(readAnswer([{ type: 'text', text: 'no json here' }]), null);
});
