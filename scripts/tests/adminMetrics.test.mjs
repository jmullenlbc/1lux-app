/**
 * Tests for the backend usage dashboard's aggregation.
 *
 * Runs under plain `node --test`, which is why `collectMetrics` takes the
 * Prisma client and the ledger reader as arguments instead of importing them.
 * A module that reaches for `@/lib/db` at load time cannot be unit-tested here
 * at all, because the `@` alias is a bundler feature.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectMetrics, bucketByDay, toSnapshot, dayKey, rollupKey,
} from '../../src/lib/admin/metrics.js';

const DAY = 86400_000;
const UNTIL = new Date('2026-08-09T00:00:00.000Z');
const SINCE = new Date(UNTIL.getTime() - 7 * DAY);

function at(daysAgo) { return new Date(UNTIL.getTime() - daysAgo * DAY); }

/** A Prisma stand-in that returns whatever each model was seeded with. */
function fakePrisma(seed = {}) {
  const model = rows => ({ findMany: async () => rows || [] });
  return {
    projectFile:     model(seed.projectFile),
    drawingFile:     model(seed.drawingFile),
    pipelineUpload:  model(seed.pipelineUpload),
    projectActivity: model(seed.projectActivity),
    bugReport:       model(seed.bugReport),
    user:            model(seed.user),
  };
}

test('an empty database produces zeroes, not crashes', async () => {
  const m = await collectMetrics(fakePrisma(), { since: SINCE, until: UNTIL });
  assert.equal(m.users.activeCount, 0);
  assert.equal(m.uploads.projectFiles, 0);
  assert.equal(m.errors.bugsOpen, 0);
  assert.equal(m.ai.runs, 0);
  assert.equal(m.errors.agentErrorRate, 0, 'no runs must not divide by zero');
});

test('a day with no activity appears as a zero, not as a missing point', () => {
  const series = bucketByDay([{ createdAt: at(3) }], SINCE, UNTIL);
  assert.equal(series.length, 8, 'inclusive of both endpoints');
  assert.equal(series.filter(d => d.count === 0).length, 7);
  // A sparse series would let a chart connect across an outage and draw it flat.
  assert.ok(series.every(d => typeof d.count === 'number'));
});

test('activity rolls up per user, keeping the most recent sighting', async () => {
  const m = await collectMetrics(fakePrisma({
    projectActivity: [
      { createdAt: at(5), userId: 'u1', userName: 'Mike', userEmail: 'm@x.com', type: 'upload' },
      { createdAt: at(1), userId: 'u1', userName: 'Mike', userEmail: 'm@x.com', type: 'edit'   },
      { createdAt: at(2), userId: 'u2', userName: null,   userEmail: null,      type: 'upload' },
    ],
    user: [
      { id: 'u1', name: 'Mike', email: 'm@x.com', role: 'ILC_ADMIN', createdAt: at(90) },
      { id: 'u2', name: 'Pat',  email: 'p@x.com', role: 'USER',      createdAt: at(90) },
      { id: 'u3', name: 'Sam',  email: 's@x.com', role: 'USER',      createdAt: at(90) },
    ],
  }), { since: SINCE, until: UNTIL });

  assert.equal(m.users.activeCount, 2);
  assert.equal(m.users.registered, 3);
  assert.equal(m.users.perUser[0].userId, 'u1');
  assert.equal(m.users.perUser[0].actions, 2);
  assert.equal(m.users.perUser[0].lastSeen, at(1).toISOString(), 'newest wins');

  // Backfilled from User when the denormalised columns on ProjectActivity are null.
  const u2 = m.users.perUser.find(u => u.userId === 'u2');
  assert.equal(u2.name, 'Pat');

  assert.deepEqual(m.users.dormant.map(u => u.userId), ['u3']);
});

test('uploads total their bytes and split by tab', async () => {
  const m = await collectMetrics(fakePrisma({
    projectFile: [
      { createdAt: at(1), size: 1000, tab: 'drawings', fileType: 'pdf', uploadedById: 'u1' },
      { createdAt: at(1), size:  500, tab: 'drawings', fileType: 'pdf', uploadedById: 'u1' },
      { createdAt: at(2), size:  250, tab: 'specs',    fileType: 'pdf', uploadedById: 'u2' },
    ],
  }), { since: SINCE, until: UNTIL });

  assert.equal(m.uploads.projectFiles, 3);
  assert.equal(m.uploads.bytes, 1750);
  assert.deepEqual(m.uploads.byTab[0], { name: 'drawings', count: 2 });
  assert.equal(m.uploads.perUser[0].userId, 'u1');
  assert.equal(m.uploads.perUser[0].bytes, 1500);
  assert.equal(m.uploads.daily.find(d => d.day === dayKey(at(1))).total, 1500,
    'the byte series carries size, not just a count');
});

test('open bugs exclude the ones already fixed', async () => {
  const m = await collectMetrics(fakePrisma({
    bugReport: [
      { createdAt: at(1), status: 'NEW',   severity: 'MAJOR',   module: 'budget' },
      { createdAt: at(2), status: 'FIXED', severity: 'MINOR',   module: 'budget' },
      { createdAt: at(3), status: 'IN_PROGRESS', severity: 'BLOCKER', module: 'rfi' },
    ],
  }), { since: SINCE, until: UNTIL });

  assert.equal(m.errors.bugsReported, 3);
  assert.equal(m.errors.bugsOpen, 2, 'a count that includes fixed bugs never goes down');
  assert.equal(m.errors.bugsByModule[0].name, 'budget');
});

test('ledger entries outside the window are excluded from every AI total', async () => {
  const readLedger = async () => [
    { at: at(2).toISOString(),  task: 'rfi.draft', model: 'x', status: 'ok',    inputTokens: 100, outputTokens: 50, durationMs: 900 },
    { at: at(30).toISOString(), task: 'rfi.draft', model: 'x', status: 'ok',    inputTokens: 999, outputTokens: 999, durationMs: 100 },
    { at: at(1).toISOString(),  task: 'rfi.draft', model: 'x', status: 'error', error: 'boom' },
  ];
  const m = await collectMetrics(fakePrisma(), { since: SINCE, until: UNTIL, readLedger });

  assert.equal(m.ai.runs, 2, 'the 30-day-old entry is outside a 7-day window');
  assert.equal(m.ai.inputTokens, 100);
  assert.equal(m.errors.agentErrors, 1);
  assert.equal(m.errors.agentErrorRate, 0.5);
  assert.equal(m.ai.byTask[0].avgMs, 450, 'averaged over runs including the untimed error');
});

test('recent AI errors carry the message and nothing else', async () => {
  const readLedger = async () => [{
    at: at(1).toISOString(), task: 'rfi.draft', model: 'x', status: 'error',
    error: 'rate limited', inputTokens: 5, projectId: 'p1', userId: 'u1',
  }];
  const m = await collectMetrics(fakePrisma(), { since: SINCE, until: UNTIL, readLedger });

  const [e] = m.errors.recentAgentErrors;
  assert.deepEqual(Object.keys(e).sort(), ['at', 'error', 'model', 'task']);
  assert.equal(e.error, 'rate limited');
});

test('a snapshot is scalars only, small enough to keep a year of', async () => {
  const m = await collectMetrics(fakePrisma({
    projectFile: [{ createdAt: at(1), size: 10, tab: 'x', fileType: 'pdf', uploadedById: 'u1' }],
    user:        [{ id: 'u1', name: 'A', email: 'a@x.com', role: 'USER', createdAt: at(90) }],
  }), { since: SINCE, until: UNTIL });

  const snap = toSnapshot(m);
  assert.equal(snap.uploads, 1);
  assert.equal(snap.uploadBytes, 10);
  assert.equal(snap.registeredUsers, 1);
  assert.ok(Object.values(snap).every(v => typeof v === 'number' || typeof v === 'string'),
    'a nested object here would grow without bound in SystemConfig');
});

test('the rollup key is stable for a day and distinct across days', () => {
  assert.equal(rollupKey(new Date('2026-08-09T23:59:59Z')), 'usage.rollup.2026-08-09');
  assert.equal(rollupKey(new Date('2026-08-09T00:00:00Z')), 'usage.rollup.2026-08-09');
  assert.notEqual(rollupKey(at(0)), rollupKey(at(1)));
});

test('a missing optional table degrades to zero rather than failing the page', async () => {
  const prisma = fakePrisma();
  prisma.drawingFile = { findMany: async () => { throw new Error('no such table'); } };
  const m = await collectMetrics(prisma, { since: SINCE, until: UNTIL });
  assert.equal(m.uploads.drawingFiles, 0);
});
