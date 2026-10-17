/**
 * Park-and-poll for the in-app AI reads, the shared wrapper both halves.
 *
 * Mike, 2026-09-18: "match the public page across all drawing uploads in the
 * system. Or else we will hit timeout errors in other places."
 *
 * Server half (runParkedJob) runs against an in-memory store and a fake clock.
 * Browser half (postParked) runs against a scripted fetch.
 *
 * Run: node --test scripts/tests/parkedJob.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runParkedJob, jobError, JOB_MAX_KICKS, JOB_INFLIGHT_MS } from '../../src/lib/parkedJob.js';
import { postParked } from '../../src/lib/parkedFetch.js';

// ── An in-memory stand-in for uploadStorage's scan-state store ──────────────
function memStore({ on = true, start = 1_000_000 } = {}) {
  const states = new Map();
  const attempts = new Map();
  let clock = start;
  let n = 0;
  const deps = {
    now: () => clock,
    log: () => {},
    putScanState:     async (state) => { if (!on) return null; const k = `scans/k${++n}.json.gz`; states.set(k, structuredClone(state)); return k; },
    putScanStateAt:   async (k, state) => { states.set(k, structuredClone(state)); return k; },
    getScanState:     async (k) => states.has(k) ? { ok: true, state: structuredClone(states.get(k)) } : { ok: false, code: 'gone', message: 'gone' },
    deleteScanState:  async (k) => states.delete(k),
    putScanAttempt:   async (k, a) => { attempts.set(k, structuredClone(a)); return true; },
    getScanAttempt:   async (k) => attempts.has(k) ? structuredClone(attempts.get(k)) : null,
    deleteScanAttempt:async (k) => attempts.delete(k),
  };
  return { deps, states, attempts, tick: (ms) => { clock += ms; } };
}

const body = async (res) => ({ status: res.status, data: res.status === 204 ? null : await res.json() });

const base = (deps, extra = {}) => ({
  kind: 'test.read', scope: 'proj1', deps, run: async (args) => ({ got: args }), ...extra,
});

test('server: with no parking store the job runs inline, same body it always sent', async () => {
  const { deps } = memStore({ on: false });
  const r = await body(await runParkedJob({ ...base(deps), body: {}, args: { fileId: 'f1' } }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { got: { fileId: 'f1' } });

  const err = await body(await runParkedJob({ ...base(deps, {
    run: async () => { throw jobError(422, { error: 'no_text', message: 'No text layer.' }); },
  }), body: {}, args: {} }));
  assert.equal(err.status, 422);
  assert.deepEqual(err.data, { error: 'no_text', message: 'No text layer.' });

  const boom = await body(await runParkedJob({ ...base(deps, { run: async () => { throw new Error('kaboom'); } }), body: {}, args: {} }));
  assert.equal(boom.status, 500);
  assert.equal(boom.data.error, 'job_failed');
  assert.equal(boom.data.message, 'kaboom');
});

test('server: start writes the job down; the first poll runs it, parks it, answers, and the sweep clears it', async () => {
  const { deps, states, attempts } = memStore();
  let ran = 0;
  const run = async (args) => { ran += 1; return { fixtures: 3, from: args.uploadKey }; };

  const start = await body(await runParkedJob({ ...base(deps, { run }), body: {}, args: { uploadKey: 'uploads/p/a.pdf' } }));
  assert.equal(start.status, 200);
  assert.equal(start.data.queued, true);
  assert.match(start.data.jobKey, /^scans\/k1\.json\.gz$/);
  assert.equal(ran, 0, 'the start request never runs the job');
  assert.equal(states.get(start.data.jobKey).status, 'queued');
  assert.deepEqual(states.get(start.data.jobKey).args, { uploadKey: 'uploads/p/a.pdf' });

  const poll = await body(await runParkedJob({ ...base(deps, { run }), body: { jobKey: start.data.jobKey } }));
  assert.equal(poll.status, 200);
  assert.deepEqual(poll.data, { fixtures: 3, from: 'uploads/p/a.pdf' });
  assert.equal(ran, 1);
  // Parked before answering, so a hung-up request still leaves the answer behind.
  assert.equal(states.get(start.data.jobKey).status, 'done');
  assert.deepEqual(states.get(start.data.jobKey).result, { fixtures: 3, from: 'uploads/p/a.pdf' });
  assert.equal(attempts.get(start.data.jobKey).stage, 'parked');

  // A later poll (the browser never saw the answer) collects it and sweeps.
  const collect = await body(await runParkedJob({ ...base(deps, { run }), body: { jobKey: start.data.jobKey } }));
  assert.equal(collect.status, 200);
  assert.deepEqual(collect.data, { fixtures: 3, from: 'uploads/p/a.pdf' });
  assert.equal(ran, 1, 'a parked answer is never re-run');
  assert.equal(states.size, 0);
  assert.equal(attempts.size, 0);

  // And once swept, the key is dead.
  const gone = await body(await runParkedJob({ ...base(deps, { run }), body: { jobKey: start.data.jobKey } }));
  assert.equal(gone.status, 410);
  assert.equal(gone.data.error, 'job_gone');
});

test('server: a parked failure comes back with the status and body the route always sent', async () => {
  const { deps, states } = memStore();
  const run = async () => { throw jobError(413, { error: 'too_large', message: 'Over the limit.' }); };
  const start = await body(await runParkedJob({ ...base(deps, { run }), body: {}, args: {} }));
  const poll  = await body(await runParkedJob({ ...base(deps, { run }), body: { jobKey: start.data.jobKey } }));
  assert.equal(poll.status, 413);
  assert.deepEqual(poll.data, { error: 'too_large', message: 'Over the limit.' });
  assert.equal(states.get(start.data.jobKey).status, 'error');
  assert.equal(states.get(start.data.jobKey).httpStatus, 413);
  // The browser hung up before the answer: the next poll collects the same failure.
  const again = await body(await runParkedJob({ ...base(deps, { run }), body: { jobKey: start.data.jobKey } }));
  assert.equal(again.status, 413);
  assert.equal(again.data.error, 'too_large');
  assert.equal(states.size, 0);
});

test('server: a poll during a live run says waiting; a stale run is started again; the cap gives an honest 504', async () => {
  const { deps, states, attempts, tick } = memStore();
  let ran = 0;
  // A run that never parks anything, the Lambda died mid-way.
  const run = async () => { ran += 1; await deps.putScanAttempt(currentKey, { stage: 'run', startedAt: deps.now(), kicks: ran }); throw new Error('simulated'); };
  let currentKey;

  const start = await body(await runParkedJob({ ...base(deps), body: {}, args: {} }));
  currentKey = start.data.jobKey;

  // Pretend a request is alive: marker fresh.
  await deps.putScanAttempt(currentKey, { stage: 'run', startedAt: deps.now(), kicks: 1 });
  tick(10_000);
  const waiting = await body(await runParkedJob({ ...base(deps, { run }), body: { jobKey: currentKey } }));
  assert.equal(waiting.status, 200);
  assert.deepEqual(waiting.data, { jobKey: currentKey, waiting: true, kicks: 1 });
  assert.equal(ran, 0);

  // The marker went stale: the poll starts the job again (kick 2 of 2).
  tick(JOB_INFLIGHT_MS + 1);
  const runFn = async () => { ran += 1; return { ok: true }; };
  const rerun = await body(await runParkedJob({ ...base(deps, { run: runFn }), body: { jobKey: currentKey } }));
  assert.equal(rerun.status, 200);
  assert.deepEqual(rerun.data, { ok: true });
  assert.equal(ran, 1);
  assert.equal(attempts.get(currentKey).stage, 'parked');
  assert.equal(states.get(currentKey).status, 'done');

  // Fresh job: two stale kicks in a row → job_timeout, and the key is swept.
  const s2 = await body(await runParkedJob({ ...base(deps), body: {}, args: {} }));
  const k2 = s2.data.jobKey;
  await deps.putScanAttempt(k2, { stage: 'run', startedAt: deps.now() - JOB_INFLIGHT_MS - 5, kicks: JOB_MAX_KICKS });
  let calls = 0;
  const capped = await body(await runParkedJob({ ...base(deps, { run: async () => { calls += 1; return {}; } }), body: { jobKey: k2 } }));
  assert.equal(capped.status, 504);
  assert.equal(capped.data.error, 'job_timeout');
  assert.match(capped.data.message, /taking longer/);
  assert.equal(calls, 0, 'no third start');
  assert.ok(!states.has(k2) && !attempts.has(k2));

  // A custom inflight window is honoured.
  const s3 = await body(await runParkedJob({ ...base(deps), body: {}, args: {} }));
  await deps.putScanAttempt(s3.data.jobKey, { stage: 'run', startedAt: deps.now() - 200_000, kicks: 1 });
  const stillWaiting = await body(await runParkedJob({ ...base(deps), body: { jobKey: s3.data.jobKey }, inflightMs: 300_000 }));
  assert.equal(stillWaiting.data.waiting, true);
});

test('server: a key cannot be replayed on another project or another kind of read; bad keys are 400; sweep is 204', async () => {
  const { deps, states, attempts } = memStore();
  const start = await body(await runParkedJob({ ...base(deps), body: {}, args: {} }));
  const k = start.data.jobKey;

  const otherProject = await body(await runParkedJob({ ...base(deps), scope: 'proj2', body: { jobKey: k } }));
  assert.equal(otherProject.status, 404);
  assert.equal(otherProject.data.error, 'job_mismatch');

  const otherKind = await body(await runParkedJob({ ...base(deps), kind: 'other.read', body: { jobKey: k } }));
  assert.equal(otherKind.status, 404);

  const bad = await body(await runParkedJob({ ...base(deps), body: { jobKey: '../../etc/passwd' } }));
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error, 'bad_job');

  const swept = await runParkedJob({ ...base(deps), body: { jobKey: k, sweep: true } });
  assert.equal(swept.status, 204);
  assert.equal(states.size, 0);
  assert.equal(attempts.size, 0);
  assert.equal(await swept.text(), '');
});

test('server: jobError shapes its payload and status', () => {
  const a = jobError(422, 'no_text');
  assert.equal(a.isJobError, true);
  assert.equal(a.status, 422);
  assert.deepEqual(a.payload, { error: 'no_text' });
  const b = jobError('oops', { error: 'x', message: 'why' });
  assert.equal(b.status, 500);
  assert.equal(b.message, 'why');
});

// ── Browser half ─────────────────────────────────────────────────────────────

/** A fetch that answers from a script: each entry is [status, body|null]. Records every call. */
function scriptedFetch(script) {
  const calls = [];
  const fetch = async (url, init) => {
    const sent = init.body instanceof FormData ? 'FORM' : JSON.parse(init.body);
    calls.push({ url, sent });
    const step = script.shift();
    if (!step) throw new Error('fetch called past the script');
    const [status, data] = step;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => data == null ? '' : JSON.stringify(data),
    };
  };
  return { fetch, calls };
}

test('browser: start → waiting → answer, and the answer is swept', async () => {
  const { fetch, calls } = scriptedFetch([
    [200, { jobKey: 'scans/k1.json.gz', queued: true }],
    [200, { jobKey: 'scans/k1.json.gz', waiting: true, kicks: 1 }],
    [200, { fixtures: 5 }],
    [204, null],   // the sweep
  ]);
  const waits = [];
  const res = await postParked('/api/x', { fileId: 'f1' }, { fetch, pollMs: 1, onWait: (i) => waits.push(i) });
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { fixtures: 5 });
  assert.deepEqual(calls[0].sent, { fileId: 'f1' });
  assert.deepEqual(calls[1].sent, { jobKey: 'scans/k1.json.gz' });
  assert.deepEqual(calls[2].sent, { jobKey: 'scans/k1.json.gz' });
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(calls[3].sent, { jobKey: 'scans/k1.json.gz', sweep: true });
  assert.equal(waits.length, 1);
  assert.equal(waits[0].waiting, true);
  assert.equal(waits[0].hangUp, false);
});

test('browser: an empty hang-up mid-poll is retried; the route\'s own error comes back with its status', async () => {
  const { fetch, calls } = scriptedFetch([
    [200, { jobKey: 'scans/k1.json.gz', queued: true }],
    [504, null],                                   // Amplify's empty 504, the server is still running
    [422, { error: 'no_text', message: 'No text layer.' }],
    [204, null],
  ]);
  const waits = [];
  const t0 = Date.now();
  const res = await postParked('/api/x', { a: 1 }, { fetch, pollMs: 1, hangupWaitMs: 40, onWait: (i) => waits.push(i) });
  assert.equal(res.ok, false);
  assert.equal(res.status, 422);
  assert.deepEqual(res.data, { error: 'no_text', message: 'No text layer.' });
  assert.equal(waits[0].hangUp, true);
  assert.ok(Date.now() - t0 >= 35, 'a hang-up waits a beat before asking again');
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(calls.at(-1).sent, { jobKey: 'scans/k1.json.gz', sweep: true });
});

test('browser: an inline answer (no store) and a plain 4xx pass straight through, nothing polled', async () => {
  const inline = scriptedFetch([[200, { fixtures: 2 }]]);
  const r1 = await postParked('/api/x', {}, { fetch: inline.fetch });
  assert.equal(r1.ok, true);
  assert.deepEqual(await r1.json(), { fixtures: 2 });
  assert.equal(inline.calls.length, 1);

  const denied = scriptedFetch([[403, { error: 'Forbidden' }]]);
  const r2 = await postParked('/api/x', {}, { fetch: denied.fetch });
  assert.equal(r2.status, 403);
  assert.deepEqual(r2.data, { error: 'Forbidden' });
  assert.equal(denied.calls.length, 1);

  // A hang-up on the START is not survivable, nothing was written down.
  const dead = scriptedFetch([[504, null]]);
  const r3 = await postParked('/api/x', {}, { fetch: dead.fetch });
  assert.equal(r3.status, 504);
  assert.equal(r3.data.error, 'hang_up');
  assert.equal(await r3.text(), JSON.stringify(r3.data));
});

test('browser: a FormData start goes as-is; the polls are JSON', async () => {
  const { fetch, calls } = scriptedFetch([
    [200, { jobKey: 'scans/k9.json.gz', queued: true }],
    [200, { importedCount: 4 }],
    [204, null],
  ]);
  const form = new FormData();
  form.append('fileName', 'a.pdf');
  const res = await postParked('/api/x', form, { fetch });
  assert.equal(calls[0].sent, 'FORM');
  assert.deepEqual(calls[1].sent, { jobKey: 'scans/k9.json.gz' });
  assert.deepEqual(await res.json(), { importedCount: 4 });
});

test('browser: the overall wait has a ceiling', async () => {
  const { fetch } = scriptedFetch([
    [200, { jobKey: 'scans/k1.json.gz', queued: true }],
    [200, { jobKey: 'scans/k1.json.gz', waiting: true }],
    [200, { jobKey: 'scans/k1.json.gz', waiting: true }],
  ]);
  const res = await postParked('/api/x', {}, { fetch, pollMs: 20, maxWaitMs: 30 });
  assert.equal(res.status, 504);
  assert.equal(res.data.error, 'job_timeout');
});
