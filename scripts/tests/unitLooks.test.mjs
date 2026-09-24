/**
 * Unit Selections "pick a look" — pure, browser-safe helpers in looks.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS, lookBoard, lookPicks, refinishPicks, finishFor } from '../../src/lib/unitSelections/looks.js';

const fin = (key, isDefault = false) => ({ finishKey: key, isDefault });
const o = (id, style, finishes = [fin('matte_black', true), fin('aged_brass')]) => ({ id, style, finishes });

const categories = [
  { key: 'p1', options: [o('p-mod', 'modern'), o('p-far', 'farmhouse')] },
  { key: 'v1', options: [o('v-tra', 'transitional'), o('v-mod', 'modern')] },
  { key: 'ew1', skipped: true, options: [o('e-mod', 'modern')] },
  { key: 'w1', options: [] },
  { key: 'f1', options: [o('f-mod', 'modern', [fin('white', true), fin('matte_black')])] },
];

test('looks.js imports nothing — it ships to the browser', () => {
  const src = readFileSync(new URL('../../src/lib/unitSelections/looks.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\s/m);
});

test('five looks', () => {
  assert.deepEqual(LOOKS.map(l => l.key), ['modern', 'transitional', 'traditional', 'farmhouse', 'industrial']);
});

test('a board skips fixtures not in the job and empty ones, and falls back to the nearest style', () => {
  const board = lookBoard('farmhouse', categories);
  assert.deepEqual(Object.keys(board).sort(), ['f1', 'p1', 'v1']);
  assert.equal(board.p1.option.id, 'p-far');
  assert.equal(board.p1.exact, true);
  assert.equal(board.v1.option.id, 'v-tra', 'farmhouse → transitional is nearer than modern');
  assert.equal(board.v1.exact, false);
});

test('picking a look with one finish keeps fans white', () => {
  const picks = lookPicks('modern', categories, { finishKey: 'aged_brass', fanHoldWhite: true });
  const by = Object.fromEntries(picks.map(p => [p.category, p]));
  assert.equal(by.p1.finishKey, 'aged_brass');
  assert.equal(by.f1.finishKey, 'white');
  const unheld = lookPicks('modern', categories, { finishKey: 'matte_black', fanHoldWhite: false });
  assert.equal(unheld.find(p => p.category === 'f1').finishKey, 'matte_black');
});

test('a finish a fixture does not come in falls back to its default', () => {
  assert.equal(finishFor(o('x', 'modern'), 'chrome'), 'matte_black');
});

test('re-finishing touches only picks, leaves held fans alone', () => {
  const choices = [
    { category: 'p1', optionId: 'p-mod', kind: 'PICK', finishKey: 'matte_black' },
    { category: 'v1', optionId: 'v-mod', kind: 'REJECT', finishKey: null },
    { category: 'f1', optionId: 'f-mod', kind: 'PICK', finishKey: 'white' },
  ];
  const out = refinishPicks(choices, categories, 'aged_brass', { fanHoldWhite: true });
  assert.deepEqual(out, [{ category: 'p1', optionId: 'p-mod', finishKey: 'aged_brass' }]);
});
