// Conceptual budgets become projects + the number ladder (migration 0116).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  budgetLadder, currentBudgetAmount, cleanAmount, recordBudgetAmount, conceptualAccuracy, MIN_JOBS_TO_SUGGEST,
} from '../../src/lib/budgetAmounts.js';
import { unfinishedDraftWhere, draftAnswers, draftAsRequest, UNFINISHED_LOOKBACK_MS } from '../../src/lib/intake/unfinishedDrafts.js';
import { ABANDONED_AFTER_MS } from '../../src/lib/intake/drafts.js';

const row = (tier, amount, day, extra = {}) => ({ tier, amount, createdAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`, archivedAt: null, ...extra });

test('ladder: Signed PO beats Budget beats Conceptual; archived rows never count', () => {
  const rows = [row('conceptual', 100000, 1), row('budget', 120000, 2), row('po', 130000, 3, { archivedAt: '2026-10-04' })];
  assert.equal(currentBudgetAmount(rows).tier, 'budget');
  assert.equal(currentBudgetAmount([...rows, row('po', 125000, 5)]).amount, 125000);
  assert.equal(currentBudgetAmount([row('conceptual', 90000, 1)]).tier, 'conceptual');
  assert.equal(currentBudgetAmount([]), null);
  assert.equal(currentBudgetAmount(null), null);
});

test('ladder: newest live row on a step wins', () => {
  const l = budgetLadder([row('budget', 1, 1), row('budget', 2, 9), row('budget', 3, 5)]);
  assert.equal(l.budget.amount, 2);
});

test('cleanAmount reads typed dollars and refuses junk', () => {
  assert.equal(cleanAmount('$1,234.567'), 1234.57);
  assert.equal(cleanAmount(500), 500);
  for (const bad of ['', 'abc', 0, -5, null, undefined]) assert.equal(cleanAmount(bad), null);
});

test('recordBudgetAmount archives the live row on the same step, then writes', async () => {
  const calls = [];
  const db = { projectBudgetAmount: {
    updateMany: async a => { calls.push(['archive', a]); return { count: 1 }; },
    create: async a => { calls.push(['create', a]); return { id: 'n', ...a.data }; },
  } };
  const now = new Date('2026-10-03T00:00:00Z');
  const out = await recordBudgetAmount(db, { projectId: 'p1', tier: 'po', amount: '$200,000', source: 'po-file', fileId: 'f1', now });
  assert.deepEqual(calls[0][1].where, { projectId: 'p1', tier: 'po', archivedAt: null });
  assert.equal(calls[0][1].data.archivedAt, now);
  assert.equal(out.amount, 200000);
  assert.equal(out.fileId, 'f1');
  const odd = await recordBudgetAmount(db, { projectId: 'p1', tier: 'budget', amount: 5, source: 'made-up' });
  assert.equal(odd.source, 'manual');
});

test('recordBudgetAmount writes nothing for a bad step or amount', async () => {
  let touched = false;
  const db = { projectBudgetAmount: { updateMany: async () => { touched = true; }, create: async () => { touched = true; } } };
  assert.equal(await recordBudgetAmount(db, { projectId: 'p1', tier: 'guess', amount: 5 }), null);
  assert.equal(await recordBudgetAmount(db, { projectId: 'p1', tier: 'po', amount: 0 }), null);
  assert.equal(await recordBudgetAmount(db, { projectId: '', tier: 'po', amount: 5 }), null);
  assert.equal(touched, false);
});

const job = (id, type, guess, real, tier = 'budget') => ({
  id, name: id, buildingType: type, amounts: [row('conceptual', guess, 1), row(tier, real, 2)],
});

test('accuracy: only jobs with both numbers; plus means real came in higher', () => {
  const a = conceptualAccuracy([job('a', 'multifamily', 100, 110), { id: 'b', buildingType: 'multifamily', amounts: [row('conceptual', 100, 1)] }]);
  assert.equal(a.jobs.length, 1);
  assert.ok(Math.abs(a.jobs[0].diffPct - 0.1) < 1e-9);
  assert.equal(a.types[0].enough, false);
  assert.equal(a.types[0].suggestion, null);
});

test('accuracy: a suggestion only with enough jobs and a real gap', () => {
  const low = Array.from({ length: MIN_JOBS_TO_SUGGEST }, (_, i) => job(`l${i}`, 'hotel', 100, 112, i % 2 ? 'po' : 'budget'));
  const close = Array.from({ length: MIN_JOBS_TO_SUGGEST }, (_, i) => job(`c${i}`, 'office', 100, 102));
  const { types } = conceptualAccuracy([...low, ...close]);
  const hotel = types.find(t => t.buildingType === 'hotel');
  const office = types.find(t => t.buildingType === 'office');
  assert.match(hotel.suggestion, /12% low/);
  assert.equal(office.enough, true);
  assert.equal(office.suggestion, null);
  assert.ok(!/[–—]|--/.test(hotel.suggestion));
});

test('sweep window: over a day old, under 30 days, never sent or picked up', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  const w = unfinishedDraftWhere(now);
  assert.equal(w.submissionId, null);
  assert.equal(w.projectId, null);
  assert.equal(w.abandonedAlertedAt, null);
  assert.equal(w.archivedAt, null);
  assert.equal(w.lastSavedAt.lt.getTime(), now.getTime() - ABANDONED_AFTER_MS);
  assert.equal(w.lastSavedAt.gte.getTime(), now.getTime() - UNFINISHED_LOOKBACK_MS);
});

test('draftAnswers builds what the public page would have sent', () => {
  const out = draftAnswers({
    answers: { units: '200' }, figures: { parkingSpaces: ' 150 ', blank: '' },
    corrections: { totalUnits: '210' }, haveDrawings: 'no', hasClubhouse: 'yes',
  });
  assert.deepEqual(out, { units: '200', parkingSpaces: '150', correctTotalUnits: '210', noDrawings: 'yes', hasClubhouse: 'yes' });
  assert.deepEqual(draftAnswers({ answers: { a: 1 }, haveDrawings: 'yes', hasClubhouse: 'yes' }), { a: 1 });
  assert.deepEqual(draftAnswers(null), {});
});

test('draftAsRequest gives the duplicate check what it reads', () => {
  const r = draftAsRequest({ projectName: 'Elm', city: 'Austin', state: 'TX', email: 'a@b.com', emailDomain: 'b.com' });
  assert.deepEqual(r, { proposedName: 'Elm', city: 'Austin', state: 'TX', submitterEmail: 'a@b.com', submitterDomain: 'b.com', clientId: null });
});

test('migration 0116 is additive and the schema carries it', () => {
  const sql = readFileSync(new URL('../../prisma/migrations/0116_conceptual_projects/migration.sql', import.meta.url), 'utf8');
  assert.ok(!/\bDROP\b/i.test(sql), 'no DROP in 0116');
  assert.match(sql, /CREATE TABLE "ProjectBudgetAmount"/);
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /model ProjectBudgetAmount \{/);
  assert.match(schema, /abandonedAlertedAt\s+DateTime\?/);
  const archive = readFileSync(new URL('../../src/lib/archive.js', import.meta.url), 'utf8');
  assert.match(archive, /'projectBudgetAmount'/);
});

test('a typed Signed PO also sets the supply contract total', () => {
  const src = readFileSync(new URL('../../src/app/api/projects/[id]/budget-amounts/route.js', import.meta.url), 'utf8');
  assert.match(src, /body\.tier === 'po'[\s\S]*contractValue: amount/);
});
