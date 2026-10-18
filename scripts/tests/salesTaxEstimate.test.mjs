// Estimated sales tax (Mike 10-17): state table prefill, exact for states with
// no local tax, zip lookup only where a free one exists, typed rates kept.

import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatedSalesTaxPct, salesTaxBasis, zipLookupState, nextTaxBox, nextTaxBoxFor } from '../../src/lib/salesTaxEstimate.js';

test('state estimate and basis', () => {
  assert.equal(estimatedSalesTaxPct('tx'), '8.2');
  assert.equal(salesTaxBasis('TX'), 'average');
  assert.equal(salesTaxBasis('MA'), 'exact');
  assert.equal(salesTaxBasis('OR'), 'exact');
  assert.equal(salesTaxBasis('ZZ'), '');
  assert.equal(zipLookupState('wa'), true);
  assert.equal(zipLookupState('CA'), false);
});

test('box follows the estimate until the user types', () => {
  assert.equal(nextTaxBox('', '', 'TX'), '8.2');
  assert.equal(nextTaxBox('8.2', '8.2', 'CO'), '7.89');
  assert.equal(nextTaxBox('9', '8.2', 'CO'), '9');
  assert.equal(nextTaxBox('8.2', '8.2', 'C'), '8.2');
  // A zip rate replaces the state estimate it placed a moment ago.
  assert.equal(nextTaxBoxFor('9.57', '9.57', '10.55'), '10.55');
  assert.equal(nextTaxBoxFor('10', '9.57', '10.55'), '10');
});
