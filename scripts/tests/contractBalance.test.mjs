// Current Contract is one calculation behind the Change Orders tab, the dashboards
// and Pipeline (0155), so they can not disagree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentContract, contractBalance } from '../../src/lib/contractBalance.js';
import { revenueFor } from '../../src/lib/pipeline.js';

test('Current Contract is the original plus approved change orders', () => {
  assert.equal(currentContract({ contractValue: 100000, approvedCoTotal: 2500.5 }), 102500.5);
  assert.equal(currentContract({ contractValue: 100000 }), 100000);
  assert.equal(currentContract({ contractValue: null, approvedCoTotal: 500 }), 500);
  assert.equal(currentContract({ contractValue: null, approvedCoTotal: 0 }), null);
  assert.equal(currentContract(null), null);
});

test('the balance keeps approved, pending and legacy PDFs apart', () => {
  const balance = contractBalance({
    originalContract: 1000,
    cos: [
      { status: 'APPROVED', totalValue: 100.1 },
      { status: 'APPROVED', totalValue: 0.2 },
      { status: 'SENT', totalValue: 50 },
      { status: 'DRAFT', totalValue: 999 },
    ],
    legacyFiles: [{ parsedAmount: 25 }, { parsedAmount: null }],
  });
  assert.deepEqual(balance, {
    originalContract: 1000, approvedCOTotal: 100.3, pendingCOTotal: 50, legacyTotal: 25,
    approvedCoTotal: 125.3, currentContract: 1125.3,
  });
  assert.equal(contractBalance({ originalContract: null }).currentContract, 0);
});

test('Pipeline revenue reads Current Contract on the Procurement board only', () => {
  const project = { contractValue: 1000, approvedCoTotal: 250, designContractValue: 40 };
  assert.equal(revenueFor(project, 'PROCUREMENT'), 1250);
  assert.equal(revenueFor(project, 'DESIGN'), 40);
});
