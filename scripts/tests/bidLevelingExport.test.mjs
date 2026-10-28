// Bid step 2 (Mike 10-26): the leveled sheet as Excel tabs, built from the same view the screen shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix, normalize, deriveFlags, buildClarifications } from '../../src/lib/bidLeveling/engine.js';
import { packagesFor } from '../../src/lib/bidLeveling/views.js';
import { leveledSheets, leveledFileName } from '../../src/lib/bidLeveling/exportSheet.js';
import { ILC_BID, FISHER_BID, SUN_VALLEY_PLACEHOLDERS, SUN_VALLEY_SETTINGS } from './_sunValleyBids.mjs';

const TODAY = new Date('2026-10-26T12:00:00');
const bids = [ILC_BID, FISHER_BID];
const matrix = buildMatrix(bids, 'fisher');
const normalized = normalize(bids, 'fisher', { ...SUN_VALLEY_SETTINGS, placeholders: SUN_VALLEY_PLACEHOLDERS }, matrix);
const view = {
  leveling: { name: 'Sun Valley Block 2', freightMode: 'RATIO', whMode: 'RATIO', taxRate: null },
  bids, matrix, normalized,
  clarifications: Object.fromEntries(bids.map((b) => [b.id, buildClarifications(b, matrix, { today: TODAY, bids })])),
  flags: Object.fromEntries(bids.map((b) => [b.id, deriveFlags(b, TODAY)])),
  packages: Object.fromEntries(bids.map((b) => [b.id, packagesFor(b)])),
  suggestions: { R1: { options: [{ propMfr: 'SECRET_SUGGEST', medianUnitCn: 12.34 }] } },
};
const tabs = leveledSheets(view, { projectName: 'Sun Valley', today: TODAY });
const tab = (name) => tabs.find((t) => t.name === name);
const rowOf = (t, label) => t.rows.find((r) => r[0] === label);

test('tabs come out in order and fit Excel names', () => {
  const names = tabs.map((t) => t.name);
  assert.deepEqual(names.slice(0, 5), ['Leveled totals', 'By type', 'Placeholders', 'What each includes', 'Questions for bidders']);
  assert.equal(names.at(-1), 'Quotes');
  for (const n of names) assert.ok(n.length <= 31, n);
});

test('leveled totals match the screen numbers', () => {
  const t = tab('Leveled totals');
  assert.deepEqual(rowOf(t, '').slice(1), bids.map((b) => b.bidderName));
  const grand = rowOf(t, 'Leveled total');
  bids.forEach((b, i) => assert.equal(grand[i + 1], normalized.perBid[b.id].grand));
  assert.equal(rowOf(t, 'Baseline (sets the quantities)')[1], FISHER_BID.bidderName);
  assert.equal(rowOf(t, 'Lowest').slice(1).filter((x) => x === 'Lowest').length, 1);
  assert.ok(t.rows[t.moneyFrom][0] === 'As quoted');
});

test('by type has one row per type, a Sage column, and six columns per bid', () => {
  const t = tab('By type');
  assert.equal(t.rows.length, matrix.types.length + 2);
  for (const r of t.rows) assert.equal(r.length, 2 + bids.length * 6);
  const r1 = t.rows.find((r) => r[0] === 'R1');
  const fi = 2 + bids.findIndex((b) => b.id === 'fisher') * 6;
  assert.equal(r1[fi], 371);
  assert.equal(r1[fi + 1], 'LF');
});

test('placeholders list every filled line', () => {
  const t = tab('Placeholders');
  const want = bids.reduce((n, b) => n + (normalized.perBid[b.id].placeholderLines?.length || 0) + (normalized.perBid[b.id].ownQtyLines?.length || 0), 0)
    + bids.reduce((n, b) => n + (normalized.extrasNotInBaseline[b.id]?.length || 0), 0);
  assert.equal(t.rows.length - 1, want || 1);
});

test('includes and questions read in plain words', () => {
  const inc = tab('What each includes');
  assert.ok(inc.rows.some((r) => r[0] === 'PRICING'));
  assert.ok(inc.rows.flat().some((x) => typeof x === 'string' && /^(Included|Excluded|Not stated)/.test(x)));
  const q = tab('Questions for bidders');
  const count = bids.reduce((n, b) => n + view.clarifications[b.id].length, 0);
  assert.equal(q.rows.length - 1, count || 1);
});

test('never carries the we suggest column or past job CN', () => {
  const all = JSON.stringify(tabs);
  assert.ok(!all.includes('SECRET_SUGGEST'));
  assert.ok(!all.includes('12.34'));
  assert.ok(!/\bDN\b|\bCN\b/.test(all));
});

test('no bids gives no tabs, file name is safe', () => {
  assert.deepEqual(leveledSheets({ bids: [], matrix: null }), []);
  assert.equal(leveledFileName('A/B: Tower', 'Round 1', TODAY), 'A B Tower, Round 1, 2026-10-26.xlsx');
});
