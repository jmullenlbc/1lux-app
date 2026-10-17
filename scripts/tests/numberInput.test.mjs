// numberInput.test.mjs, pins the one loose number reader every typed
// currency/count field goes through (Mike 9-18: commas must be fine).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLooseNumber, looseNumberOrNull, looseInteger, isUnreadableNumber, cleanNumberInput,
} from '../../src/lib/numberInput.js';

test('commas, dollars and spaces are dressing, not part of the number', () => {
  assert.equal(parseLooseNumber('1,200,000'), 1200000);
  assert.equal(parseLooseNumber('$41,200.50'), 41200.5);
  assert.equal(parseLooseNumber(' 2,500 '), 2500);
  assert.equal(parseLooseNumber('226,000 SF'), 226000);
  assert.equal(parseLooseNumber('12%'), 12);
  assert.equal(parseLooseNumber('754172'), 754172);
  assert.equal(parseLooseNumber('0'), 0);
  assert.equal(parseLooseNumber('0.18'), 0.18);
});

test('parseFloat truncation is gone: "1,200,000" is never 1', () => {
  assert.equal(parseFloat('1,200,000'), 1); // the old bug, for the record
  assert.equal(parseLooseNumber('1,200,000'), 1200000);
});

test('negatives: leading minus and accounting parentheses', () => {
  assert.equal(parseLooseNumber('-500'), -500);
  assert.equal(parseLooseNumber('(500)'), -500);
  assert.equal(parseLooseNumber('($1,250.00)'), -1250);
});

test('blank and missing are choices, not errors', () => {
  assert.equal(parseLooseNumber(undefined), undefined);
  assert.equal(parseLooseNumber(null), null);
  assert.equal(parseLooseNumber(''), null);
  assert.equal(parseLooseNumber('   '), null);
});

test('typed nonsense is refused as NaN, never read as zero', () => {
  for (const bad of ['abc', '$', '$ ', 'SF', '1.2.3', '--', true, {}, [], NaN, Infinity]) {
    assert.ok(Number.isNaN(parseLooseNumber(bad)), `expected NaN for ${JSON.stringify(bad)}`);
  }
  assert.equal(isUnreadableNumber('abc'), true);
  assert.equal(isUnreadableNumber(''), false);
  assert.equal(isUnreadableNumber(undefined), false);
  assert.equal(isUnreadableNumber('1,200'), false);
});

test('numbers pass straight through', () => {
  assert.equal(parseLooseNumber(42), 42);
  assert.equal(parseLooseNumber(0), 0);
  assert.equal(parseLooseNumber(-3.5), -3.5);
});

test('looseNumberOrNull turns the unreadable into null for bulk grids', () => {
  assert.equal(looseNumberOrNull('abc'), null);
  assert.equal(looseNumberOrNull('1,250'), 1250);
  assert.equal(looseNumberOrNull(''), null);
  assert.equal(looseNumberOrNull(undefined), undefined);
});

test('looseInteger rounds counts and keeps the blank/NaN signals', () => {
  assert.equal(looseInteger('1,250'), 1250);
  assert.equal(looseInteger('12.6'), 13);
  assert.equal(looseInteger(''), null);
  assert.equal(looseInteger(undefined), undefined);
  assert.ok(Number.isNaN(looseInteger('abc')));
});

test('cleanNumberInput: what a text box sends to the server', () => {
  assert.equal(cleanNumberInput('1,200,000'), '1200000');
  assert.equal(cleanNumberInput('$41,200.50'), '41200.5');
  assert.equal(cleanNumberInput(''), '');
  assert.equal(cleanNumberInput('   '), '');
  assert.equal(cleanNumberInput('abc'), 'abc');   // passed through so the server can refuse it
  assert.equal(cleanNumberInput(12), 12);
  assert.equal(cleanNumberInput(null), null);
  assert.equal(cleanNumberInput(undefined), undefined);
});
