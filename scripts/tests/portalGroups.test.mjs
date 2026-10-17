/**
 * GC portal grouping (Mike 10-16): "lone tree ranch" vs "lone ranch" asks,
 * "phase 1" vs "phase 2" never asks, an answered pair is never asked again,
 * only the newer budget's maker is asked.
 *
 *   node --test scripts/tests/portalGroups.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareNames, groupBudgets, portalStage } from '../../src/lib/intake/portalGroups.js';

test('near names ask, identical names are the same', () => {
  assert.equal(compareNames('Lone Tree Ranch', 'Lone Ranch').verdict, 'ask');
  assert.equal(compareNames('Lone Tree Ranch Apartments', 'The Lone Tree Ranch').verdict, 'same');
  assert.equal(compareNames('Lone Tree Ranch', 'Riverbend Lofts').verdict, 'different');
});

test('phase and building numbers split a project, a bare name next to a numbered one asks', () => {
  assert.equal(compareNames('Lone Tree Ranch Phase 1', 'Lone Tree Ranch Phase 2').verdict, 'different');
  assert.equal(compareNames('Lone Tree Ranch Bldg 3', 'Lone Tree Ranch Building 4').verdict, 'different');
  assert.equal(compareNames('Lone Tree Ranch', 'Lone Tree Ranch Phase 2').verdict, 'ask');
  assert.equal(compareNames('Lone Tree Ranch Phase II', 'Lone Tree Ranch Phase 2').verdict, 'same');
});

const rows = [
  { id: 'a', projectName: 'Lone Tree Ranch',   city: 'Denver', state: 'CO', email: 'sam@gc.com', createdAt: '2026-10-01' },
  { id: 'b', projectName: 'Lone Ranch',        city: 'Denver', state: 'CO', email: 'pat@gc.com', createdAt: '2026-10-05' },
  { id: 'c', projectName: 'Lone Tree Ranch Phase 2', city: 'Denver', state: 'CO', email: 'pat@gc.com', createdAt: '2026-10-06' },
  { id: 'd', projectName: 'The Lone Tree Ranch Apartments', city: 'Denver', state: 'CO', email: 'sam@gc.com', createdAt: '2026-10-07' },
  { id: 'e', projectName: 'Lone Ranch', city: 'Austin', state: 'TX', email: 'lee@gc.com', createdAt: '2026-10-08' },
];

test('groups by cleaned name, asks the newer maker once per other project', () => {
  const { groups, asks } = groupBudgets(rows, []);
  // a and d are one project (same cleaned name); b, c, e stand alone until answered.
  const of = id => groups.find(g => g.budgets.some(b => b.id === id));
  assert.equal(of('a'), of('d'));
  assert.notEqual(of('a'), of('b'));
  // b (newer, pat) is asked about a's project exactly once, not once for a and once for d.
  const forB = asks.filter(x => x.draftId === 'b');
  assert.equal(forB.length, 1);
  assert.equal(forB[0].askEmail, 'pat@gc.com');
  assert.equal(forB[0].otherDraftId, 'a');
  // e is in Austin: never asked about Denver's Lone Tree Ranch.
  assert.equal(asks.some(x => x.draftId === 'e' && x.otherDraftId === 'a'), false);
  // nobody is asked about a, it is the oldest.
  assert.equal(asks.some(x => x.draftId === 'a'), false);
});

test('a Yes merges, a No keeps apart, neither is asked again', () => {
  const yes = groupBudgets(rows, [{ draftId: 'b', otherDraftId: 'a', same: true }]);
  const ofY = id => yes.groups.find(g => g.budgets.some(b => b.id === id));
  assert.equal(ofY('b'), ofY('a'));
  assert.equal(yes.asks.some(x => x.draftId === 'b'), false);

  const no = groupBudgets(rows, [{ draftId: 'b', otherDraftId: 'a', same: false }]);
  const ofN = id => no.groups.find(g => g.budgets.some(b => b.id === id));
  assert.notEqual(ofN('b'), ofN('a'));
  // d joined a's project by name; the No covers the whole project.
  assert.equal(no.asks.some(x => x.draftId === 'b' && (x.otherDraftId === 'a' || x.otherDraftId === 'd')), false);
});

test('stage words', () => {
  assert.equal(portalStage({ projectId: 'p' }).label, 'Being reviewed by ILC');
  assert.equal(portalStage({ submissionId: 's' }).label, 'Sent to ILC');
  assert.equal(portalStage({}, () => ({ step: 3, of: 9 })).label, 'In progress, step 3 of 9');
});

test('a copy is its source project without a question (Mike 10-16)', () => {
  const withCopy = [
    ...rows,
    { id: 'f', projectName: 'Lone Tree Ranch', budgetName: 'Copy of 100% DD', city: 'Denver', state: 'CO', email: 'pat@gc.com', createdAt: '2026-10-09', copiedFrom: { id: 'b' } },
  ];
  const { groups, asks } = groupBudgets(withCopy, []);
  const of = id => groups.find(g => g.budgets.some(x => x.id === id));
  // f names the project "Lone Tree Ranch" (a's words) but was copied from b: it stays with b.
  assert.equal(of('f'), of('b'));
  assert.equal(asks.some(x => x.draftId === 'f' && x.otherDraftId === 'b'), false);
});
