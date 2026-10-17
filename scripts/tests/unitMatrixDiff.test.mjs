/**
 * The auto-verdict diff, what a human changed about the model's unit matrix.
 *
 * This is what turns "Apply to Project" into an accuracy record without asking
 * anyone to review the same extraction twice, so the thing that must not happen
 * is a real edit reading as `accepted`. Most of these tests are about that.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeUnitMatrixCorrection } from '../../src/lib/agent/unitMatrixDiff.js';

const PROPOSED = [
  { code: 'STUDIO', qty: 20, unitSf: 520,  bedrooms: 0, bathrooms: 1, balconies: 0 },
  { code: '1BR-A',  qty: 60, unitSf: 720,  bedrooms: 1, bathrooms: 1, balconies: 1 },
  { code: '2BR-K',  qty: 40, unitSf: 1080, bedrooms: 2, bathrooms: 2, balconies: 1 },
];

const clone = (rows) => rows.map(r => ({ ...r }));

test('applying the extraction untouched is accepted', () => {
  const d = describeUnitMatrixCorrection(PROPOSED, clone(PROPOSED));
  assert.equal(d.changed, false);
  assert.equal(d.summary, 'Applied unchanged.');
});

test('the modal round-trip does not count as a change', () => {
  // The review modal adds a `_key` and strips it again; row order is whatever
  // the reviewer left it in. Neither is a correction.
  const committed = clone(PROPOSED).reverse().map(r => ({ ...r, source: 'EXTRACTED', confidence: 0.9 }));
  assert.equal(describeUnitMatrixCorrection(PROPOSED, committed).changed, false);
});

test('a changed quantity is a correction and says what changed', () => {
  const committed = clone(PROPOSED);
  committed[2].qty = 44;
  const d = describeUnitMatrixCorrection(PROPOSED, committed);
  assert.equal(d.changed, true);
  assert.equal(d.counts.edited, 1);
  assert.match(d.summary, /2BR-K: qty 40→44/);
});

test('several fields on one row are reported together', () => {
  const committed = clone(PROPOSED);
  committed[1].qty = 58;
  committed[1].unitSf = 745;
  const d = describeUnitMatrixCorrection(PROPOSED, committed);
  assert.match(d.summary, /1BR-A: qty 60→58, unit SF 720→745/);
});

test('a deleted row is reported as removed', () => {
  const committed = clone(PROPOSED).filter(r => r.code !== 'STUDIO');
  const d = describeUnitMatrixCorrection(PROPOSED, committed);
  assert.equal(d.counts.removed, 1);
  assert.match(d.summary, /Removed: studio/);
});

test('a row the reviewer typed in is reported as added', () => {
  const committed = [...clone(PROPOSED), { code: '3BR-B', qty: 8, unitSf: 1420, bedrooms: 3 }];
  const d = describeUnitMatrixCorrection(PROPOSED, committed);
  assert.equal(d.counts.added, 1);
  assert.match(d.summary, /Added: 3br-b/);
});

test('a hand-added row with no type code is still counted, not dropped', () => {
  // Rows with no code cannot be keyed, and a silently-dropped addition would be
  // exactly the correction most worth learning from.
  const committed = [...clone(PROPOSED), { code: '', qty: 6, unitSf: 900 }];
  const d = describeUnitMatrixCorrection(PROPOSED, committed);
  assert.equal(d.changed, true);
  assert.equal(d.counts.added, 1);
  assert.match(d.summary, /no type code/);
});

test('filling in a field the model left null is a correction', () => {
  const proposed = [{ code: '1BR-A', qty: 60, unitSf: null, bedrooms: 1 }];
  const d = describeUnitMatrixCorrection(proposed, [{ code: '1BR-A', qty: 60, unitSf: 715, bedrooms: 1 }]);
  assert.equal(d.changed, true);
  assert.match(d.summary, /unit SF —→715/);
});

test('null, undefined and empty string are the same "not set"', () => {
  const proposed  = [{ code: 'A', qty: 1, unitSf: null,      bedrooms: undefined }];
  const committed = [{ code: 'A', qty: 1, unitSf: undefined, bedrooms: '' }];
  assert.equal(describeUnitMatrixCorrection(proposed, committed).changed, false);
});

test('"60" and 60 are the same number', () => {
  // EditCell hands back strings from a text input; a re-typed identical value
  // must not register as a correction.
  const committed = clone(PROPOSED);
  committed[1].qty = '60';
  assert.equal(describeUnitMatrixCorrection(PROPOSED, committed).changed, false);
});

test('codes match case-insensitively and ignore surrounding space', () => {
  const committed = clone(PROPOSED).map(r => ({ ...r, code: ` ${r.code.toLowerCase()} ` }));
  assert.equal(describeUnitMatrixCorrection(PROPOSED, committed).changed, false);
});

test('a missing stored proposal treats everything applied as added', () => {
  // The store can fail; the commit must not. With nothing to diff against, the
  // honest description is "all of this is new", not "accepted".
  const d = describeUnitMatrixCorrection(null, clone(PROPOSED));
  assert.equal(d.changed, true);
  assert.equal(d.counts.added, 3);
});

test('clearing the matrix entirely is a correction, not an acceptance', () => {
  const d = describeUnitMatrixCorrection(PROPOSED, []);
  assert.equal(d.changed, true);
  assert.equal(d.counts.removed, 3);
});

test('long edit lists are truncated but say how many were dropped', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ code: `T${i}`, qty: 10 }));
  const edited = many.map(r => ({ ...r, qty: 11 }));
  const d = describeUnitMatrixCorrection(many, edited);
  assert.equal(d.counts.edited, 12);
  assert.match(d.summary, /\+4 more/);
});
