/**
 * Portal compare (Mike 10-17: "compare up to 3 budgets in the company budget
 * portal"): lines line up by key, a line one budget lacks reads as zero,
 * rows that differ are marked, at most three budgets.
 *
 *   node --test scripts/tests/portalCompare.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareBudgetRows, MAX_COMPARE } from '../../src/lib/intake/compareBudgets.js';
import { budgetLineItems } from '../../src/lib/budgetLineItems.js';

const SECTIONS = {
  units: { total: { product: 200000 }, base: { product: 150000 }, fans: { product: 50000 } },
  exterior: { total: { product: 30000 }, siteFeatures: { product: 30000, items: [{ type: 'pool', label: 'Pool', count: 1, product: 30000 }] } },
};
const budget = (over = {}) => ({
  totalWithControls: 500000, subtotalLightingOnly: 400000, controlsTotal: 100000,
  perSf: 2.5, perUnit: 2500, lightingTaxAmount: 0, controlsTaxAmount: 0,
  ...over,
  sections: over.sections || SECTIONS,
});
const item = (id, over = {}, answers = {}, facts = {}) => ({
  id, budget: budget(over), answers, facts: { projectName: 'Lone Tree', budgetName: id, unitCount: 200, ...facts },
});

test('every breakdown line has a key', () => {
  for (const c of budgetLineItems(budget().sections)) {
    assert.ok(c.key, c.label);
    for (const d of c.details) assert.ok(d.key, d.label);
  }
});

test('same budgets: nothing differs but the description', () => {
  const out = compareBudgetRows([item('a'), item('b')]);
  assert.deepEqual(out.ids, ['a', 'b']);
  assert.ok(out.totals.every(r => !r.differs));
  assert.ok(out.lines.every(r => !r.differs));
  assert.deepEqual(out.facts.filter(r => r.differs).map(r => r.key), ['budgetName']);
});

test('a moved total and a line only one budget has', () => {
  const b = item('b', {
    totalWithControls: 560000,
    sections: { units: { total: { product: 200000 }, base: { product: 150000 }, fans: { product: 50000 } },
      exterior: { total: { product: 60000 }, siteFeatures: { product: 60000, items: [
        { type: 'pickleball', label: 'Pickleball', count: 2, product: 30000 },
        { type: 'pool', label: 'Pool', count: 1, product: 30000 },
      ] } } },
  });
  const out = compareBudgetRows([item('a'), b]);
  const total = out.totals.find(r => r.key === 'totalWithControls');
  assert.deepEqual(total.values, [500000, 560000]);
  assert.equal(total.differs, true);
  const ext = out.lines.find(r => r.key === 'exterior');
  assert.equal(ext.differs, true);
  const pool = ext.details.find(d => d.key === 'exterior.site:pool');
  assert.deepEqual(pool.values, [30000, 30000]);
  assert.equal(pool.differs, false, 'pool lines up with pool even when listed second');
  const pb = ext.details.find(d => d.key === 'exterior.site:pickleball');
  assert.deepEqual(pb.values, [0, 30000]);
});

test('answers: union of keys, blank on the budget that lacks one', () => {
  const out = compareBudgetRows([
    item('a', {}, { ceilingFans: 'Yes', noDrawings: 'yes' }),
    item('b', {}, { ceilingFans: 'No', figureGrossSf: '80000' }),
  ]);
  const fans = out.choices.find(r => r.key === 'ceilingFans');
  assert.deepEqual(fans.values, ['Yes', 'No']);
  assert.equal(fans.differs, true);
  assert.deepEqual(out.choices.find(r => r.key === 'figureGrossSf').values, [null, '80000']);
  assert.ok(!out.choices.some(r => r.key === 'noDrawings'));
});

test('not priced yet: no totals, no lines', () => {
  const out = compareBudgetRows([{ id: 'a', budget: null, answers: {}, facts: {} }, { id: 'b', budget: null, answers: {}, facts: {} }]);
  assert.equal(out.totals.length, 0);
  assert.equal(out.lines.length, 0);
});

test('never more than three', () => {
  assert.equal(MAX_COMPARE, 3);
  const out = compareBudgetRows(['a', 'b', 'c', 'd'].map(id => item(id)));
  assert.equal(out.ids.length, 3);
});
