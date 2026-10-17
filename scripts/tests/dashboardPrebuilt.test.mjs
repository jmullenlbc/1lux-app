// Prebuilt dashboard cards: taking one off has to stick.
//
// Mike, 2026-09-11: "Make it stick." Before DashboardHiddenWidget (migration
// 0074), removing Things Needing a Look from a dashboard lasted until the next
// load, because the load re-adds every prebuilt card that is missing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prebuiltKey, missingPrebuilt, hiddenCards } from '../../src/lib/dashboards/prebuilt.js';

const TEMPLATES = [
  { name: 'Things Needing a Look', dataSpec: { kind: 'verification' } },
  { name: 'Pricing Calibration: Rate Drift', dataSpec: { kind: 'calibration', report: 'rateDrift' } },
  { name: 'Drift by Building Type', dataSpec: { kind: 'calibration', report: 'modelVsActualByBuilding' } },
  { name: 'Won deals by month', dataSpec: { terms: [{ field: 'x', agg: 'sum' }] } },
];

const widget = (name, dataSpec) => ({ name, dataSpec: JSON.stringify(dataSpec) });

test('a card is known by what it is, not by its title', () => {
  assert.equal(prebuiltKey({ kind: 'verification' }), 'verification');
  assert.equal(prebuiltKey({ kind: 'calibration', report: 'rateDrift' }), 'calibration:rateDrift');
  assert.equal(prebuiltKey('{"kind":"verification"}'), 'verification');
});

test('an ordinary chart, a blank spec and junk are not prebuilt', () => {
  assert.equal(prebuiltKey({ terms: [] }), null);
  assert.equal(prebuiltKey(null), null);
  assert.equal(prebuiltKey('not json'), null);
});

test('a missing prebuilt card is added, an ordinary chart never is', () => {
  const add = missingPrebuilt(TEMPLATES, [], []);
  assert.deepEqual(add.map(t => t.name), [
    'Things Needing a Look', 'Pricing Calibration: Rate Drift', 'Drift by Building Type',
  ]);
});

test('a card somebody took off stays off', () => {
  const add = missingPrebuilt(TEMPLATES, [], ['verification']);
  assert.ok(!add.some(t => t.name === 'Things Needing a Look'));
  assert.equal(add.length, 2);
});

test('taking off one calibration report leaves the others alone', () => {
  const add = missingPrebuilt(TEMPLATES, [], ['calibration:rateDrift']);
  assert.deepEqual(add.map(t => t.name), ['Things Needing a Look', 'Drift by Building Type']);
});

test('a renamed card counts as present, so no second copy appears', () => {
  const have = [widget('Weekly checks', { kind: 'verification' })];
  const add = missingPrebuilt(TEMPLATES, have, []);
  assert.ok(!add.some(t => t.name === 'Things Needing a Look'));
});

test('the hidden list names the cards that can be put back', () => {
  assert.deepEqual(hiddenCards(TEMPLATES, ['verification', 'retired:card']), [
    { key: 'verification', name: 'Things Needing a Look' },
  ]);
});

// The wiring, read from source so it cannot quietly come apart.
const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('the load skips hidden cards', () => {
  const src = read('src/app/api/dashboards/route.js');
  assert.match(src, /dashboardHiddenWidget\.findMany/);
  assert.match(src, /missingPrebuilt\(/);
});

test('removing a prebuilt card records that it was removed', () => {
  const src = read('src/app/api/dashboards/[id]/widgets/[widgetId]/route.js');
  assert.match(src, /dashboardHiddenWidget\.upsert/);
  assert.doesNotMatch(src, /skipDuplicates/); // Postgres-only; throws on the SQLite dev database
});

test('a personal copy keeps the cards the default had taken off', () => {
  assert.match(read('src/app/api/dashboards/[id]/fork/route.js'), /hiddenWidgets/);
});
