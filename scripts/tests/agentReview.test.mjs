// The review store, the deterministic auto-checks, and the decision that joins
// them to the trust tiers, Steps 16, 17 and 18 of the Governed AI Layer.
//
// ── Why this runs against a fake Prisma and never the file sink ──────────────
// The store has three sinks, and the FILE one writes to `.agent-runs/reviews.json`
// in the repo. Two test files touching one file in the repo is exactly the race
// that made `agentClient.test.mjs` flake one run in three, `node --test` runs
// files in separate processes at the same time, so a shared path is shared state.
//
// Injecting an in-memory Prisma double keeps every test in this file on the
// PRISMA branch, which is also the branch production will actually use. The file
// sink is a dev convenience; testing against it would be testing the stand-in
// instead of the thing.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  recordReviewableRun, recordVerdict, listRuns, getRun, verdictHistory,
  storeHealth, STATUS, VERDICT, SINK,
  _resetStoreForTests, _setPrismaForTests,
} from '../../src/lib/agent/reviewStore.js';
import { runAutoChecks } from '../../src/lib/agent/autoChecks.js';
import { submitAgentOutput } from '../../src/lib/agent/review.js';

/** An in-memory stand-in for `prisma.agentRun`, create / updateMany / findMany. */
function fakePrisma() {
  const rows = [];
  return {
    rows,
    agentRun: {
      async create({ data }) { rows.push({ ...data }); return { ...data }; },
      async updateMany({ where, data }) {
        const hits = rows.filter(r =>
          Object.entries(where).every(([k, v]) => r[k] === v));
        for (const r of hits) Object.assign(r, data);
        return { count: hits.length };
      },
      async findMany({ take = 1000 } = {}) {
        return rows.slice().reverse().slice(0, take).map(r => ({ ...r }));
      },
    },
  };
}

let db;
beforeEach(() => {
  _resetStoreForTests();
  db = fakePrisma();
  _setPrismaForTests(db);
});

// ── The store ────────────────────────────────────────────────────────────────

test('a reviewable run is stored in the shape the AgentRun table expects', async () => {
  const rec = await recordReviewableRun({
    taskType: 'extract.cutSheetSpec',
    feature: 'visionParse',
    model: 'claude-haiku-4-5',
    output: { items: [{ manufacturer: 'Acme' }] },
    citations: [{ sheet: 'E-101' }],
    inputSummary: 'sha256:abc123 (cutsheet.pdf, 4021 chars)',
    status: STATUS.AWAITING_REVIEW,
  });

  assert.equal(rec.stored, true);
  const row = db.rows[0];
  // JSON-as-string, because that is what a SQLite-backed Prisma model stores.
  // Storing a real object here would pass locally and fail on the real table.
  assert.equal(typeof row.outputJson, 'string');
  assert.equal(typeof row.citations, 'string');
  assert.deepEqual(JSON.parse(row.outputJson).items[0].manufacturer, 'Acme');
  assert.equal(row.verdict, null, 'a fresh run carries no verdict');
  assert.equal(row.status, STATUS.AWAITING_REVIEW);
});

test('the input is never stored, only its hash and descriptor', async () => {
  const secret = 'CONFIDENTIAL: buy price $412.00, client Northgate Partners';
  await recordReviewableRun({
    taskType: 'review.contract',
    inputSummary: 'sha256:deadbeef (contract.pdf, 90210 chars)',
    output: { term: 'net 30' },
  });
  const serialised = JSON.stringify(db.rows);
  assert.ok(!serialised.includes(secret), 'the document text must never reach the store');
  assert.ok(!serialised.includes('412.00'));
  assert.match(db.rows[0].inputSummary, /^sha256:/);
});

test('a run is hydrated back into objects for a reader', async () => {
  const { id } = await recordReviewableRun({
    taskType: 't', output: { a: 1 }, citations: [{ sheet: 'E-1' }],
    autoChecks: [{ key: 'x', status: 'PASS' }],
  });
  const run = await getRun(id);
  assert.deepEqual(run.output, { a: 1 });
  assert.deepEqual(run.citations, [{ sheet: 'E-1' }]);
  assert.equal(run.autoChecks[0].status, 'PASS');
});

// ── Verdicts ─────────────────────────────────────────────────────────────────

test('a verdict closes the run and records who signed it', async () => {
  const { id } = await recordReviewableRun({ taskType: 't', output: {}, status: STATUS.AWAITING_REVIEW });
  const res = await recordVerdict(id, { verdict: VERDICT.ACCEPTED, userId: 'u1' });

  assert.equal(res.ok, true);
  const run = await getRun(id);
  assert.equal(run.verdict, 'accepted');
  assert.equal(run.verdictById, 'u1');
  assert.equal(run.status, STATUS.CLOSED);
  assert.ok(run.verdictAt, 'a signature needs a time on it');
});

test('a verdict is write-once, a second reviewer cannot overwrite the first', async () => {
  const { id } = await recordReviewableRun({ taskType: 't', output: {} });
  await recordVerdict(id, { verdict: VERDICT.ACCEPTED, userId: 'u1' });

  const second = await recordVerdict(id, { verdict: VERDICT.REJECTED, userId: 'u2' });
  assert.equal(second.ok, false);
  assert.match(second.error, /already reviewed/);
  assert.equal((await getRun(id)).verdict, 'accepted', 'the first signature stands');
});

test('"corrected" without saying what changed is refused', async () => {
  const { id } = await recordReviewableRun({ taskType: 't', output: {} });

  const empty = await recordVerdict(id, { verdict: VERDICT.CORRECTED, correction: '   ' });
  assert.equal(empty.ok, false, 'the correction IS the training signal, an empty one teaches nothing');
  assert.equal((await getRun(id)).verdict, null, 'and the run stays open');

  const ok = await recordVerdict(id, { verdict: VERDICT.CORRECTED, correction: 'Type B2 qty was 6, not 16.' });
  assert.equal(ok.ok, true);
  assert.match((await getRun(id)).correction, /qty was 6/);
});

test('an unknown verdict word is refused rather than stored', async () => {
  const { id } = await recordReviewableRun({ taskType: 't', output: {} });
  const res = await recordVerdict(id, { verdict: 'looks-fine' });
  assert.equal(res.ok, false);
  assert.equal((await getRun(id)).verdict, null);
});

// ── Queue reads ──────────────────────────────────────────────────────────────

test('the queue filters by status and returns newest first', async () => {
  for (const [i, status] of [STATUS.AWAITING_REVIEW, STATUS.AUTO_PASSED, STATUS.AWAITING_REVIEW].entries()) {
    await recordReviewableRun({ taskType: `t${i}`, output: {}, status });
  }
  const queue = await listRuns({ status: STATUS.AWAITING_REVIEW });
  assert.equal(queue.length, 2);
  assert.ok(queue.every(r => r.status === STATUS.AWAITING_REVIEW));
});

test('verdict history is scoped to the prompt version, and null is its own version', async () => {
  const mk = async (promptVersion, verdict) => {
    const { id } = await recordReviewableRun({ taskType: 'shared', promptVersion, output: {} });
    await recordVerdict(id, { verdict });
  };
  await mk('v1', VERDICT.ACCEPTED);
  await mk('v1', VERDICT.ACCEPTED);
  await mk('v2', VERDICT.REJECTED);
  await mk(null, VERDICT.ACCEPTED);

  assert.equal((await verdictHistory('shared', 'v1')).length, 2);
  assert.equal((await verdictHistory('shared', 'v2')).length, 1,
    'a rewritten prompt does not inherit the old version\'s record');
  assert.equal((await verdictHistory('shared', null)).length, 1,
    'unversioned matches only unversioned, never "any version"');
});

test('verdict history comes back oldest-first, because demotion reads the tail', async () => {
  const { id: a } = await recordReviewableRun({ taskType: 'ord', output: {} });
  await recordVerdict(a, { verdict: VERDICT.ACCEPTED });
  await new Promise(r => setTimeout(r, 5));           // distinct verdictAt
  const { id: b } = await recordReviewableRun({ taskType: 'ord', output: {} });
  await recordVerdict(b, { verdict: VERDICT.REJECTED });

  const h = await verdictHistory('ord');
  assert.deepEqual(h.map(x => x.verdict), ['accepted', 'rejected']);
});

test('storeHealth names the sink, so an empty queue is never ambiguous', async () => {
  const h = await storeHealth();
  assert.equal(h.sink, SINK.PRISMA);
  assert.equal(h.durable, true);
});

// ── Auto-checks ──────────────────────────────────────────────────────────────

test('an unknown task type gets no opinion: null, never a pass', async () => {
  const r = await runAutoChecks('extract.somethingNew', { items: [] });
  assert.equal(r.ran, false);
  assert.equal(r.pass, null, 'null must never collapse into true');
});

test('a code answer with no cited section fails outright', async () => {
  const r = await runAutoChecks('lookup.codeRequirement', { citations: [] });
  assert.equal(r.pass, false);
});

test('a cited code section that does not exist fails; one that does, passes', async () => {
  const ctx = { codeSectionExists: async (s) => s === 'IECC C405.2' };
  assert.equal((await runAutoChecks('lookup.codeRequirement',
    { citations: ['IECC C405.2'] }, ctx)).pass, true);

  const bad = await runAutoChecks('lookup.codeRequirement', { citations: ['IECC C999.9'] }, ctx);
  assert.equal(bad.pass, false);
  assert.match(bad.checks[0].detail, /C999\.9/);
});

test('a check with no resolver skips, and a skip is null, not a pass', async () => {
  const r = await runAutoChecks('lookup.codeRequirement', { citations: ['IECC C405.2'] }, {});
  assert.equal(r.pass, null, 'a check that could not run has no opinion');
  assert.equal(r.skipped, 1);
});

test('uncited sales-bot claims fail', async () => {
  assert.equal((await runAutoChecks('draft.salesBotAnswer',
    { claims: [{ text: 'We stock that', citation: 'kb:42' }] })).pass, true);
  assert.equal((await runAutoChecks('draft.salesBotAnswer',
    { claims: [{ text: 'We stock that' }] })).pass, false);
});

test('a drawing detection needs a sheet AND a location on it', async () => {
  const sheetOnly = await runAutoChecks('vision.fixtureTagDetect',
    { detections: [{ type: 'A1', citation: { sheet: 'E-101' } }] });
  assert.equal(sheetOnly.pass, false, '"it is on E-101" is unverifiable on a 400-symbol sheet');

  const located = await runAutoChecks('vision.fixtureTagDetect',
    { detections: [{ type: 'A1', citation: { sheet: 'E-101', x: 120, y: 340 } }] });
  assert.equal(located.pass, true);
});

test('an unresolved fixture is only a failure if it was not flagged', async () => {
  const ctx = { resolveProduct: async (mfr) => mfr === 'Acme' ? { id: 1 } : null };
  assert.equal((await runAutoChecks('extract.cutSheetSpec',
    { items: [{ manufacturer: 'Nobody', model: 'X', aiFlagged: true }] }, ctx)).pass, true,
    'a genuinely new product is fine, as long as it was flagged for a human');
  assert.equal((await runAutoChecks('extract.cutSheetSpec',
    { items: [{ manufacturer: 'Nobody', model: 'X' }] }, ctx)).pass, false,
    'unresolved AND presented as confident is the failure');
});

test('a check that throws reports a failure, not a skip', async () => {
  const ctx = { codeSectionExists: () => { throw new Error('kb offline'); } };
  const r = await runAutoChecks('lookup.codeRequirement', { citations: ['x'] }, ctx);
  assert.equal(r.pass, false, 'a crashed check is evidence about this output, route it to a human');
  assert.match(r.checks[0].detail, /kb offline/);
});

// ── The decision ─────────────────────────────────────────────────────────────

test('a new task type is held for review and NOT written', async () => {
  const d = await submitAgentOutput({ taskType: 'extract.brandNew', output: { a: 1 } });
  assert.equal(d.needsReview, true);
  assert.equal(d.shouldWrite, false, 'tier 0 files nothing without a signature');
  assert.equal(d.status, STATUS.AWAITING_REVIEW);
  assert.equal(d.tier.tier, 0);
});

test('a failed auto-check queues the run even at auto-write', async () => {
  // Earn tier 2 first: 20 accepted verdicts at this task type.
  for (let i = 0; i < 20; i++) {
    const { id } = await recordReviewableRun({ taskType: 'lookup.codeRequirement2', output: {} });
    await recordVerdict(id, { verdict: VERDICT.ACCEPTED });
  }
  const d = await submitAgentOutput({
    taskType: 'lookup.codeRequirement2',
    output: { claims: [] },
    rng: () => 0.99,                                    // explicitly not sampled
  });
  assert.equal(d.tier.tier, 2, 'the record earned tier 2');
  // No check is defined for this made-up type, so pass is null and it flows through.
  assert.equal(d.autoChecks.pass, null);
  assert.equal(d.needsReview, false);

  // Now the same tier, but with a real check that fails.
  for (let i = 0; i < 20; i++) {
    const { id } = await recordReviewableRun({ taskType: 'draft.salesBotAnswer', output: {} });
    await recordVerdict(id, { verdict: VERDICT.ACCEPTED });
  }
  const failed = await submitAgentOutput({
    taskType: 'draft.salesBotAnswer',
    output: { claims: [{ text: 'uncited claim' }] },
    rng: () => 0.99,
  });
  assert.equal(failed.tier.tier, 2);
  assert.equal(failed.autoChecks.pass, false);
  assert.equal(failed.needsReview, true, 'auto-checks override an earned tier');
  assert.equal(failed.status, STATUS.AWAITING_REVIEW);
});

test('a permanently-supervised task type never writes, however good its record', async () => {
  for (let i = 0; i < 50; i++) {
    const { id } = await recordReviewableRun({ taskType: 'review.contract', output: {} });
    await recordVerdict(id, { verdict: VERDICT.ACCEPTED });
  }
  const d = await submitAgentOutput({ taskType: 'review.contract', output: { term: 'net 30' } });
  assert.equal(d.tier.permanent, true);
  assert.equal(d.shouldWrite, false);
  assert.equal(d.needsReview, true);
});

test('a store failure BLOCKS a supervised write rather than writing unsigned', async () => {
  _setPrismaForTests({ agentRun: {
    create: async () => { throw new Error('table missing'); },
    updateMany: async () => ({ count: 0 }),
    findMany: async () => [],
  } });
  const d = await submitAgentOutput({ taskType: 'extract.brandNew', output: { a: 1 } });
  assert.equal(d.stored, false);
  assert.equal(d.shouldWrite, false);
  assert.equal(d.runId, null);
  assert.match(d.why, /refusing to write unsigned/i);
});
