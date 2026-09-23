/**
 * The MCP rate limiter, tested against the clock rather than with it.
 *
 * `take()` accepts an injectable `now` for exactly this reason: a sliding-window
 * test that used the real clock would either sleep for a minute or be flaky, and
 * a flaky security test gets deleted by whoever is on call.
 *
 * Run: node --test scripts/tests/mcpRateLimit.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  take, callerKey, limitPerMinute, resetRateLimits, trackedCallers,
  DEFAULT_LIMIT_PER_MINUTE, WINDOW_MS,
} from '../../src/lib/mcp/rateLimit.js';

const T0 = 1_700_000_000_000;

test.beforeEach(() => {
  resetRateLimits();
  delete process.env.MCP_RATE_LIMIT_PER_MINUTE;
});

test('a caller under the limit is never refused', () => {
  process.env.MCP_RATE_LIMIT_PER_MINUTE = '10';
  for (let i = 0; i < 10; i += 1) {
    const r = take('k', 1, T0);
    assert.equal(r.ok, true, `refused on request ${i + 1} of 10`);
    assert.equal(r.remaining, 9 - i);
  }
});

test('the request past the limit is refused, with a real Retry-After', () => {
  process.env.MCP_RATE_LIMIT_PER_MINUTE = '3';
  take('k', 3, T0);
  const r = take('k', 1, T0 + 1_000);
  assert.equal(r.ok, false);
  assert.equal(r.limit, 3);
  // The oldest of the three expires 60s after T0, i.e. 59s from now.
  assert.equal(r.retryAfterSeconds, 59);
});

test('Retry-After is never zero — a client told to retry now just gets refused again', () => {
  process.env.MCP_RATE_LIMIT_PER_MINUTE = '1';
  take('k', 1, T0);
  // One millisecond before the window closes: the true wait rounds to 0s.
  const r = take('k', 1, T0 + WINDOW_MS - 1);
  assert.equal(r.ok, false);
  assert.ok(r.retryAfterSeconds >= 1, 'a client was told to retry in zero seconds');
});

test('a refusal costs nothing — hammering cannot extend your own lockout', () => {
  // The failure this pins: if a refused request still recorded a timestamp, a
  // client retrying every second would keep pushing its own window forward and
  // never recover. That turns a one-minute overage into a permanent outage.
  process.env.MCP_RATE_LIMIT_PER_MINUTE = '2';
  take('k', 2, T0);
  for (let i = 1; i <= 30; i += 1) {
    const r = take('k', 1, T0 + i * 1_000);
    assert.equal(r.ok, false);
  }
  // 60s after the original two, the window has rolled clean regardless.
  assert.equal(take('k', 1, T0 + WINDOW_MS + 1).ok, true, 'the caller never recovered');
});

test('the window slides — old requests stop counting one at a time', () => {
  process.env.MCP_RATE_LIMIT_PER_MINUTE = '2';
  take('k', 1, T0);
  take('k', 1, T0 + 30_000);
  assert.equal(take('k', 1, T0 + 40_000).ok, false, 'a third request inside the window was allowed');

  // The first expires at T0 + 60s. Room for exactly one more, not two — this is
  // what a fixed one-minute bucket would get wrong.
  assert.equal(take('k', 1, T0 + WINDOW_MS + 1).ok, true);
  assert.equal(take('k', 1, T0 + WINDOW_MS + 2).ok, false, 'the window reset wholesale instead of sliding');
});

test('a batch is charged per message, not per HTTP request', () => {
  // Otherwise the limit is sidestepped by wrapping everything in one array.
  process.env.MCP_RATE_LIMIT_PER_MINUTE = '10';
  const r = take('k', 8, T0);
  assert.equal(r.ok, true);
  assert.equal(r.remaining, 2);
  assert.equal(take('k', 5, T0).ok, false, 'a batch was allowed to overrun the limit');
});

test('a batch bigger than the whole limit is refused, not silently clamped', () => {
  process.env.MCP_RATE_LIMIT_PER_MINUTE = '5';
  assert.equal(take('k', 50, T0).ok, false);
  // And it consumed nothing, so a reasonable follow-up still works.
  assert.equal(take('k', 5, T0).ok, true);
});

test('callers are counted separately', () => {
  process.env.MCP_RATE_LIMIT_PER_MINUTE = '2';
  take('a', 2, T0);
  assert.equal(take('a', 1, T0).ok, false);
  assert.equal(take('b', 1, T0).ok, true, 'one caller spent another caller\'s allowance');
});

test('callerKey separates two humans and survives a missing id', () => {
  assert.notEqual(
    callerKey({ kind: 'session', id: 'u1' }),
    callerKey({ kind: 'session', id: 'u2' }),
    'two logged-in users share one bucket',
  );
  assert.notEqual(
    callerKey({ kind: 'service', id: 'mcp-service' }),
    callerKey({ kind: 'session', id: 'mcp-service' }),
    'a session caller could impersonate the service bucket',
  );
  assert.equal(callerKey(null), 'anonymous');
  assert.equal(callerKey({ kind: 'session', email: 'a@b.c' }), 'session:a@b.c');
});

test('a bad or missing env value falls back instead of locking everyone out', () => {
  // The failure this pins: `MCP_RATE_LIMIT_PER_MINUTE=` in a .env file parses to
  // 0, and a literal 0 limit would refuse every request on the endpoint.
  for (const bad of ['', '0', '-5', 'abc', ' ']) {
    process.env.MCP_RATE_LIMIT_PER_MINUTE = bad;
    assert.equal(limitPerMinute(), DEFAULT_LIMIT_PER_MINUTE, `"${bad}" did not fall back`);
    assert.equal(take('k', 1, T0).ok, true, `"${bad}" refused a first request`);
    resetRateLimits();
  }
  delete process.env.MCP_RATE_LIMIT_PER_MINUTE;
  assert.equal(limitPerMinute(), DEFAULT_LIMIT_PER_MINUTE);
});

test('the default is high enough that a busy caller is never throttled', () => {
  // A limit tight enough to catch a merely busy client is a limit that pages
  // somebody for nothing. 300 calls in a minute must still be fine.
  for (let i = 0; i < 300; i += 1) {
    assert.equal(take('k', 1, T0 + i * 100).ok, true, `throttled at call ${i + 1}`);
  }
});

test('the tracking map is bounded — a spray of keys cannot grow it forever', () => {
  for (let i = 0; i < 6_000; i += 1) take(`key-${i}`, 1, T0 + i);
  assert.ok(trackedCallers() <= 5_000, `tracking ${trackedCallers()} callers`);
  // Evicting somebody's history must never deny them — it only forgets.
  assert.equal(take('key-0', 1, T0).ok, true);
});
