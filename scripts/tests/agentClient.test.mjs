// Unit tests for the agent ledger and the client wrapper that feeds it.
// Pure node:test, no dev server, no database. Run via `npm run verify:units`.
//
// The wrapper is tested against a FAKE Anthropic client rather than a real one:
// building a real one needs the `@` alias, which is a bundler feature the test
// runner cannot resolve, and a test that makes real model calls is not a test.
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { wrapClient } from '../../src/lib/agent/client.js';
import { recordRun, readLedgerTail, summarise, resolveSink, _resetSinkForTests, _setPrismaForTests, SINK }
  from '../../src/lib/agent/ledger.js';

const LEDGER_FILE = path.join(process.cwd(), '.agent-runs', 'agent-runs.jsonl');

// A fake that records what it was called with and returns a realistic response.
function fakeClient({ throws = null, response = null } = {}) {
  const calls = [];
  return {
    calls,
    models: { list: () => 'untouched' },
    messages: {
      async create(params) {
        calls.push(params);
        if (throws) throw throws;
        return response ?? {
          model: params.model,
          stop_reason: 'end_turn',
          usage: { input_tokens: 120, output_tokens: 45 },
          content: [{ type: 'text', text: 'ok' }],
        };
      },
      stream() { return 'streaming-passthrough'; },
    },
  };
}

const tailSince = async (mark) => (await readLedgerTail(200)).filter(e => e.task?.startsWith(mark));

/**
 * Wait for a stream's ledger entry to land, then return the entries.
 *
 * The record is a floating promise by necessity, once the streamer is handed to
 * the caller there is nothing left to await it into, so a test has to wait for
 * it somehow. This used to be a single `await setImmediate`, which assumes the
 * whole record path (sink resolution, then a real file append) completes inside
 * one macrotask tick. It usually does, and under the parallel load of the full
 * `verify:units` run it sometimes does not: the suite failed here once and passed
 * on its own every time. A gate that fails one run in three teaches people to
 * re-run it rather than read it, which is worse than no gate.
 *
 * Polling asserts the same claim, the finished stream IS recorded, without
 * pinning it to a tick count. It returns as soon as the entry appears, so the
 * passing path costs a millisecond, and the timeout is a real failure.
 */
async function waitForLedger(mark, { minCount = 1, timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entries = await tailSince(mark);
    if (entries.length >= minCount) return entries;
    if (Date.now() > deadline) {
      throw new Error(`no ledger entry for "${mark}" within ${timeoutMs}ms (found ${entries.length})`);
    }
    await new Promise(r => setTimeout(r, 10));
  }
}

beforeEach(() => { _resetSinkForTests(); });

after(async () => { await fs.rm(LEDGER_FILE, { force: true }).catch(() => {}); });

// ── The wrapper is genuinely transparent ─────────────────────────────────────

test('the wrapper passes arguments through and returns the SDK response unchanged', async () => {
  const fake = fakeClient();
  const client = wrapClient(fake, 'test.passthrough');

  const params = { model: 'claude-haiku-4-5', max_tokens: 700, messages: [{ role: 'user', content: 'hi' }] };
  const res = await client.messages.create(params);

  assert.deepEqual(fake.calls[0], params, 'the wrapper altered the request');
  assert.equal(res.content[0].text, 'ok', 'the wrapper altered the response');
});

test('non-create members are passed through untouched', async () => {
  const client = wrapClient(fakeClient(), 'test.passthrough');
  // Wrapping something this file does not understand is how a wrapper breaks a
  // feature it was only meant to observe.
  assert.equal(client.messages.stream(), 'streaming-passthrough');
  assert.equal(client.models.list(), 'untouched');
});

// A fake streamer shaped like the SDK's MessageStream: an emitter that the
// caller iterates while the wrapper listens from the side.
function fakeStreamingClient() {
  const listeners = {};
  const streamer = {
    on(event, fn) { (listeners[event] ||= []).push(fn); return streamer; },
    emit(event, arg) { (listeners[event] || []).forEach(fn => fn(arg)); },
    listenerCount(event) { return (listeners[event] || []).length; },
  };
  return { streamer, client: { messages: { stream: () => streamer } } };
}

test('a stream is returned untouched: the wrapper never owns the iteration', () => {
  const { streamer, client } = fakeStreamingClient();
  const returned = wrapClient(client, 'test.stream').messages.stream({ model: 'm' });
  assert.equal(returned, streamer, 'the wrapper substituted its own object for the streamer');
});

test('a stream that finishes is recorded with its usage totals', async () => {
  const { streamer, client } = fakeStreamingClient();
  wrapClient(client, 'test.stream.ok', { userId: 'u1' }).messages.stream({ model: 'claude-haiku-4-5' });

  streamer.emit('finalMessage', {
    model: 'claude-haiku-4-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 900, output_tokens: 30 },
  });
  const [entry] = await waitForLedger('test.stream.ok');
  assert.ok(entry, 'the finished stream was never recorded');
  assert.equal(entry.status, 'ok');
  assert.equal(entry.inputTokens, 900);
  assert.equal(entry.outputTokens, 30);
  assert.equal(entry.stopReason, 'end_turn');
  assert.equal(entry.userId, 'u1');
});

test('a stream that errors is recorded as an error, exactly once', async () => {
  const { streamer, client } = fakeStreamingClient();
  wrapClient(client, 'test.stream.err').messages.stream({ model: 'claude-haiku-4-5' });

  streamer.emit('error', new Error('upstream exploded'));
  // A stream can emit both, the record must not double-count.
  streamer.emit('finalMessage', { usage: { input_tokens: 1, output_tokens: 1 } });

  await waitForLedger('test.stream.err');
  // Wait past the first entry before counting: "exactly once" is only meaningful
  // if a second write had time to show up and didn't.
  await new Promise(r => setTimeout(r, 50));

  const entries = await tailSince('test.stream.err');
  assert.equal(entries.length, 1, 'one stream produced more than one ledger entry');
  assert.equal(entries[0].status, 'error');
  assert.match(entries[0].error, /upstream exploded/);
});

test('the wrapper always attaches an error listener, so a stream failure cannot go unhandled', () => {
  const { streamer, client } = fakeStreamingClient();
  wrapClient(client, 'test.stream.unhandled').messages.stream({ model: 'm' });
  // Without a listener the SDK's emitter throws on 'error', the wrapper would
  // then crash the very request it was only meant to observe.
  assert.ok(streamer.listenerCount('error') >= 1);
});

test('an un-named task is refused rather than defaulted', () => {
  // 'unknown' in the ledger poisons every rollup it is averaged into, so this is
  // a throw at wrap time, not a fallback at record time.
  assert.throws(() => wrapClient(fakeClient(), ''), /task name is required/);
  assert.throws(() => wrapClient(fakeClient()), /task name is required/);
});

// ── It actually records ──────────────────────────────────────────────────────

test('a successful call lands in the ledger with usage and latency', async () => {
  assert.equal(resolveSink(null), SINK.FILE, 'expected the file sink outside production');

  const task = `test.ok.${process.pid}`;
  const client = wrapClient(fakeClient(), task, { projectId: 'proj_1', userId: 'user_1' });
  await client.messages.create({ model: 'claude-haiku-4-5', max_tokens: 10, messages: [] });

  const [entry] = await tailSince(task);
  assert.ok(entry, 'the call was not recorded');
  assert.equal(entry.status, 'ok');
  assert.equal(entry.model, 'claude-haiku-4-5');
  assert.equal(entry.inputTokens, 120);
  assert.equal(entry.outputTokens, 45);
  assert.equal(entry.stopReason, 'end_turn');
  assert.equal(entry.projectId, 'proj_1');
  assert.equal(entry.userId, 'user_1');
  assert.ok(Number.isFinite(entry.durationMs));
  assert.ok(entry.at, 'no timestamp');
});

test('a failed call is recorded AND rethrown unchanged', async () => {
  const task = `test.err.${process.pid}`;
  const boom = new Error('overloaded_error');
  const client = wrapClient(fakeClient({ throws: boom }), task);

  await assert.rejects(
    () => client.messages.create({ model: 'claude-haiku-4-5', messages: [] }),
    /overloaded_error/,
    'the wrapper swallowed the error. This layer observes, it does not decide',
  );

  const [entry] = await tailSince(task);
  assert.ok(entry, 'a failed call was not recorded. Errors are the interesting ones');
  assert.equal(entry.status, 'error');
  assert.match(entry.error, /overloaded_error/);
});

test('no prompt or completion text is ever written to the ledger', async () => {
  const task = `test.privacy.${process.pid}`;
  const SECRET = 'DEALER-NET-6363.63-Acme-Development-LLC';
  const client = wrapClient(fakeClient({
    response: { model: 'm', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: SECRET }] },
  }), task);

  await client.messages.create({ model: 'm', messages: [{ role: 'user', content: SECRET }] });

  // A ledger that copies prompts is a second, unaudited store of everything
  // sensitive the app touches, with none of the redaction the rest of this layer
  // exists to enforce.
  const raw = await fs.readFile(LEDGER_FILE, 'utf8');
  assert.ok(!raw.includes(SECRET), 'prompt or completion text reached the ledger');
});

test('an error message is truncated, it can carry an echoed prompt', async () => {
  const task = `test.trunc.${process.pid}`;
  const client = wrapClient(fakeClient({ throws: new Error('x'.repeat(5000)) }), task);
  await assert.rejects(() => client.messages.create({ model: 'm', messages: [] }));

  const [entry] = await tailSince(task);
  assert.ok(entry.error.length <= 500, `error stored at ${entry.error.length} chars`);
});

// ── The ledger fails open, on purpose ────────────────────────────────────────

test('a table write that throws does not fail the call it was observing', async () => {
  // The MCP auditor fails CLOSED because an unlogged read API is a liability.
  // This one fails OPEN: an unpushed migration must not silently disable
  // contract analysis, RFI drafting and schedule parsing across the app.
  //
  // The client is INJECTED. Without that seam this test passed while quietly
  // exercising the file sink, because `loadPrisma()` cannot resolve the `@` alias
  // under node --test and returns null, so the throwing `create` below was never
  // reached and the assertion proved nothing.
  _resetSinkForTests();
  let attempted = false;
  const brokenPrisma = {
    agentRun: { create: async () => { attempted = true; throw new Error('no such table: AgentRun'); } },
  };
  _setPrismaForTests(brokenPrisma);
  assert.equal(resolveSink(brokenPrisma), SINK.PRISMA);

  await assert.doesNotReject(() => recordRun({ task: 'test.broken', model: 'm' }));
  assert.ok(attempted, 'the Prisma branch was never taken, this test was not testing it');

  _resetSinkForTests();
});

test('a memoised Prisma sink with no client degrades instead of dereferencing null', async () => {
  // The sink is memoised once per process; the client is resolved per call. A
  // script that reaches the PRISMA branch and then runs where `@/lib/db` will not
  // resolve used to hit `null.agentRun` and lose the entry to the catch, which
  // reads in the logs as a database fault rather than "no client here".
  _resetSinkForTests();
  assert.equal(resolveSink({ agentRun: { create: async () => {} } }), SINK.PRISMA);
  _setPrismaForTests(null);

  const task = `test.degrade.${process.pid}`;
  await assert.doesNotReject(() => recordRun({ task, model: 'm' }));
  const [entry] = await tailSince(task);
  assert.ok(entry, 'the entry was dropped rather than degrading to the file sink');
});

test('production with no AgentRun table warns once, not every call', async () => {
  _resetSinkForTests();
  const prev = process.env.NODE_ENV;
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));

  try {
    process.env.NODE_ENV = 'production';
    assert.equal(resolveSink(null), SINK.NONE);
    await recordRun({ task: 'test.none', model: 'm' });
    await recordRun({ task: 'test.none', model: 'm' });
    await recordRun({ task: 'test.none', model: 'm' });
  } finally {
    console.warn = realWarn;
    process.env.NODE_ENV = prev;
    _resetSinkForTests();
  }

  // Loud once is a signal; loud every call is noise that gets filtered, and then
  // the signal is gone.
  assert.equal(warnings.length, 1, `warned ${warnings.length} times`);
  assert.match(warnings[0], /UNRECORDED/);
});

// ── The rollup ───────────────────────────────────────────────────────────────

test('summarise rolls up by task, which is the dimension every question asks about', () => {
  const rows = summarise([
    { task: 'rfi.draft', status: 'ok',    inputTokens: 100, outputTokens: 50, durationMs: 1000 },
    { task: 'rfi.draft', status: 'error', inputTokens: 100, outputTokens: 0,  durationMs: 3000 },
    { task: 'schedule.parse', status: 'ok', inputTokens: 10, outputTokens: 5, durationMs: 500 },
  ]);

  assert.equal(rows[0].task, 'rfi.draft', 'not sorted by volume');
  assert.equal(rows[0].runs, 2);
  assert.equal(rows[0].errors, 1);
  assert.equal(rows[0].errorRate, 0.5);
  assert.equal(rows[0].inputTokens, 200);
  assert.equal(rows[0].avgMs, 2000);
  assert.equal(rows[1].task, 'schedule.parse');
});

test('summarise tolerates the nulls a real ledger contains', () => {
  // Every numeric column is nullable, a call that failed before the API
  // answered has no token counts at all.
  const [row] = summarise([{ task: 't', status: 'ok', inputTokens: null, outputTokens: null, durationMs: null }]);
  assert.equal(row.inputTokens, 0);
  assert.equal(row.avgMs, 0);
  assert.equal(row.errorRate, 0);
});
