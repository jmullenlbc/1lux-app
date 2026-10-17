/**
 * Which read wins, and the rule that the site read now ALWAYS runs.
 *
 * These pin the 2026-08-31 change: the vision site read used to be a fallback
 * for matrix-less sets, which meant every matrix-successful project arrived
 * with no site figures at all (no stories, no stairs, no parking) and an
 * empty quantity takeoff. needsSiteRead is now unconditional and a matrix
 * win carries siteData alongside it instead of dropping it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  needsSiteRead, combineIntakeResult, siteHasNumbers, matrixHasTypes, SITE_NUMBER_KEYS,
} from '../../src/lib/intake/combineResult.js';

test('the site read always runs, even when the matrix parsed cleanly', () => {
  assert.equal(needsSiteRead({ hasText: true, matrix: { unitTypes: [{ code: 'A1', qty: 10 }] } }), true);
  assert.equal(needsSiteRead({ hasText: true, matrix: null }), true);
  assert.equal(needsSiteRead({ hasText: false, matrix: null }), true);
  assert.equal(needsSiteRead(), true);
});

test('a matrix win carries siteData along instead of dropping it', () => {
  const matrix = { unitTypes: [{ code: 'A1', qty: 10 }], projectTotals: { statedTotalUnits: 10 } };
  const siteData = { stories: 4, egressStairwells: 2, confidence: 0.9 };
  const r = combineIntakeResult({ fileName: 'a.pdf', matrix, siteData });
  assert.equal(r.unitTypes.length, 1, 'the matrix still wins the shape');
  assert.deepEqual(r.siteData, siteData, 'site figures ride along for the takeoff');
});

test('a matrix win with no site read reports siteData as null, not undefined', () => {
  const r = combineIntakeResult({ fileName: 'a.pdf', matrix: { unitTypes: [{ code: 'A1', qty: 10 }] } });
  assert.equal(r.siteData, null);
});

test('vision still wins outright when there is no matrix but real site numbers', () => {
  const r = combineIntakeResult({ fileName: 'a.pdf', matrix: { unitTypes: [] }, siteData: { totalUnits: 324, confidence: 0.8 } });
  assert.equal(r.kind, 'site_data');
  assert.equal(r.siteData.totalUnits, 324);
});

test('the new counted and coverage fields count as "found a site number"', () => {
  for (const key of ['storiesCounted', 'egressStairwellsCounted', 'exitDoorsCounted', 'lotCoveragePct']) {
    assert.ok(SITE_NUMBER_KEYS.includes(key), `${key} missing from SITE_NUMBER_KEYS`);
    assert.ok(siteHasNumbers({ [key]: 3, confidence: 0.9 }), `${key} alone should count as numbers`);
  }
});

test('nothing found either way is a result, not an error', () => {
  const r = combineIntakeResult({ fileName: 'a.pdf' });
  assert.equal(r.kind, 'nothing_found');
  assert.deepEqual(r.unitTypes, []);
});

test('matrixHasTypes stays hostile-input safe', () => {
  assert.equal(matrixHasTypes(null), false);
  assert.equal(matrixHasTypes({}), false);
  assert.equal(matrixHasTypes({ unitTypes: 'hax' }), false);
});
