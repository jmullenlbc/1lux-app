import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPortalView, activeFilterCount, portalChoices } from '../../src/lib/intake/portalFilter.js';

const row = (o) => ({ id: o.id, projectName: o.p, budgetName: o.d || 'Budget', city: o.city || 'Austin', state: 'TX',
  buildingTypeLabel: o.t || 'Town Houses', unitCount: o.u ?? null, grossSf: o.sf ?? null, estimate: o.e ?? null,
  stage: { code: 'working', label: o.s || 'In progress' }, copiedFrom: o.c ? { projectName: o.c } : null,
  createdBy: o.by || 'a@x.com', createdAt: o.at || '2026-10-01', changedBy: o.by || 'a@x.com', changedAt: o.at || '2026-10-01', sentAt: o.sent || null });

const groups = [
  { key: 'g1', name: 'Lone Tree', budgets: [row({ id: 1, p: 'Lone Tree', u: 100, e: 500000 }), row({ id: 2, p: 'Lone Tree', d: '100% DD', u: 100, e: 650000, c: 'Lone Tree' })] },
  { key: 'g2', name: 'Pool Ladder', budgets: [row({ id: 3, p: 'Pool Ladder', city: 'Denver', t: 'Garden', u: 40, e: null, s: 'Sent to Logiq', sent: '2026-10-05', by: 'b@x.com' })] },
];

test('no filters keeps every group', () => {
  assert.equal(applyPortalView(groups).length, 2);
  assert.equal(activeFilterCount({}), 0);
});

test('text filter on project name, pick on location, yes/no on copies', () => {
  assert.deepEqual(applyPortalView(groups, { projectName: 'lone' }).map(g => g.key), ['g1']);
  assert.deepEqual(applyPortalView(groups, { location: 'Denver, TX' }).map(g => g.key), ['g2']);
  const copies = applyPortalView(groups, { copiedFrom: 'yes' });
  assert.deepEqual(copies[0].budgets.map(b => b.id), [2]);
  assert.deepEqual(applyPortalView(groups, { sentAt: 'yes' }).map(g => g.key), ['g2']);
  assert.equal(activeFilterCount({ projectName: 'lone', sentAt: 'yes', unitCount: { min: '', max: '' } }), 2);
});

test('range filter drops blanks and respects min/max', () => {
  assert.deepEqual(applyPortalView(groups, { estimate: { min: 600000, max: '' } })[0].budgets.map(b => b.id), [2]);
  assert.equal(applyPortalView(groups, { estimate: { min: 1, max: '' } }).length, 1);
  assert.deepEqual(applyPortalView(groups, { unitCount: { min: '', max: 50 } }).map(g => g.key), ['g2']);
});

test('sort orders budgets inside a project and projects by their first budget; blanks sink', () => {
  const desc = applyPortalView(groups, {}, { key: 'estimate', dir: 'desc' });
  assert.deepEqual(desc[0].budgets.map(b => b.id), [2, 1]);
  assert.deepEqual(desc.map(g => g.key), ['g1', 'g2']);
  const asc = applyPortalView(groups, {}, { key: 'estimate', dir: 'asc' });
  assert.deepEqual(asc.map(g => g.key), ['g1', 'g2']);
  const byUnits = applyPortalView(groups, {}, { key: 'unitCount', dir: 'asc' });
  assert.deepEqual(byUnits.map(g => g.key), ['g2', 'g1']);
});

test('choices list the distinct values seen', () => {
  const c = portalChoices(groups);
  assert.deepEqual(c.location, ['Austin, TX', 'Denver, TX']);
  assert.deepEqual(c.createdBy, ['a@x.com', 'b@x.com']);
});
