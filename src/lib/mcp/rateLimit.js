/**
 * A per-caller ceiling on how often the Librarian will answer.
 *
 * ── What this is honestly worth ─────────────────────────────────────────────
 * The counter lives in this process's memory. In production the app runs on
 * Lambda, so there is one counter per warm container and the real ceiling is
 * roughly `limit × however many containers are warm`. **This is not a global
 * quota and must never be described as one.** A shared counter needs Redis or a
 * database row per window, and a database write on every read request is a
 * worse trade than the thing it prevents.
 *
 * What it does buy, which is the actual failure mode worth guarding:
 *
 *   • A looping agent. An LLM that gets a bad answer and retries in a tight
 *     loop is the single most likely way this endpoint ever gets hammered, and
 *     a loop keeps hitting whichever container it is already talking to. That
 *     is exactly the case a per-container counter catches.
 *   • A stolen token used from one place. Same reasoning.
 *   • An honest 429 with Retry-After instead of a timeout, so a well-behaved
 *     client backs off instead of hammering harder.
 *
 * What it does NOT buy: protection from a distributed flood. That is the front
 * door's job, not ours.
 *
 * ── Cost, not calls ─────────────────────────────────────────────────────────
 * A JSON-RPC batch is one HTTP request carrying many tool calls, so the limiter
 * charges the number of messages, not one. Otherwise the limit is trivially
 * sidestepped by sending an array.
 *
 * ── Sliding window, not fixed buckets ───────────────────────────────────────
 * A fixed one-minute bucket lets a caller spend the whole allowance at 11:59:59
 * and the whole allowance again at 12:00:00, double the limit across two
 * seconds, which is precisely the burst this exists to stop. Keeping the
 * timestamps costs a few hundred bytes per caller and is exact.
 */

/**
 * Requests per minute per caller, when nothing is configured.
 *
 * Set deliberately high. The thing being stopped is a runaway loop, which fires
 * thousands of calls a minute and trips this in under a second, and the thing
 * being protected is a normal caller, who must never be throttled for working
 * quickly. An agent working hard through a research question makes tens of
 * calls; the acceptance suite fires a few hundred as fast as the network
 * allows, and it should pass. 600 a minute is ten a second sustained: far above
 * any honest use, far below a loop.
 *
 * Lower it per environment with MCP_RATE_LIMIT_PER_MINUTE if a real caller ever
 * abuses it, but a limit tight enough to catch a merely busy client is a limit
 * that will page somebody at 2am for no reason.
 */
export const DEFAULT_LIMIT_PER_MINUTE = 600;

/** The window every limit is expressed over. */
export const WINDOW_MS = 60_000;

/**
 * How many distinct callers we will track at once.
 *
 * Bounded on purpose: the key comes from the caller's identity, and a caller
 * who has not authenticated never reaches this code, but a bug or a future
 * keying change that let unauthenticated identities in would otherwise grow
 * this map without limit. When it is full the oldest-touched entry is dropped,
 * which costs that caller their history and never denies them wrongly.
 */
const MAX_TRACKED = 5_000;

/** key → array of request timestamps inside the window, oldest first. */
const hits = new Map();

/**
 * The configured ceiling, read per call rather than cached.
 *
 * Read fresh so a test can change it without reloading the module, and because
 * an env value captured at import time is one more thing to get wrong on a
 * platform that inlines env vars at build time. A value that is missing, zero,
 * negative or not a number falls back to the default, a limiter that silently
 * becomes "zero requests allowed" because somebody typed `MCP_RATE_LIMIT_PER_MINUTE=`
 * would take the whole endpoint down.
 */
export function limitPerMinute() {
  const raw = Number(process.env.MCP_RATE_LIMIT_PER_MINUTE);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_LIMIT_PER_MINUTE;
}

/**
 * The identity a limit is counted against.
 *
 * A session caller is counted per user, so two people sharing the office do not
 * throttle each other. The bearer service token is one identity by design today
 * when per-user MCP keys land, each key resolves to its own user id and this
 * function keeps working unchanged.
 */
export function callerKey(caller) {
  if (!caller) return 'anonymous';
  return `${caller.kind || 'unknown'}:${caller.id || caller.email || 'unknown'}`;
}

/**
 * Charge `cost` requests to `key` and say whether they are allowed.
 *
 * Nothing is charged when the answer is a refusal: a caller who is already over
 * cannot push their own retry-after further out by retrying, which would turn a
 * brief overage into a lockout that never ends.
 *
 * @param {string} key
 * @param {number} [cost]  how many requests this HTTP call represents
 * @param {number} [now]   injectable clock, for tests
 * @returns {{ok: boolean, limit: number, remaining: number, retryAfterSeconds: number}}
 */
export function take(key, cost = 1, now = Date.now()) {
  const limit = limitPerMinute();
  const charge = Math.max(1, Math.floor(Number(cost) || 1));
  const cutoff = now - WINDOW_MS;

  let stamps = hits.get(key);
  if (!stamps) {
    if (hits.size >= MAX_TRACKED) {
      // Map iteration is insertion-ordered, and every touch re-inserts, so the
      // first key is the least recently seen.
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }
    stamps = [];
  } else {
    hits.delete(key);                       // re-insert below, to keep LRU order
    let drop = 0;
    while (drop < stamps.length && stamps[drop] <= cutoff) drop += 1;
    if (drop) stamps = stamps.slice(drop);
  }

  if (stamps.length + charge > limit) {
    hits.set(key, stamps);
    // When the oldest request in the window expires, room opens up. Round up:
    // telling a client to retry in 0 seconds invites an immediate re-refusal.
    const oldest = stamps[0] ?? now;
    const waitMs = Math.max(0, oldest + WINDOW_MS - now);
    return {
      ok: false,
      limit,
      remaining: Math.max(0, limit - stamps.length),
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }

  for (let i = 0; i < charge; i += 1) stamps.push(now);
  hits.set(key, stamps);
  return { ok: true, limit, remaining: Math.max(0, limit - stamps.length), retryAfterSeconds: 0 };
}

/** Drop all counters. Tests only, there is no reason to call this at runtime. */
export function resetRateLimits() {
  hits.clear();
}

/** How many callers are being tracked right now. Diagnostics and tests. */
export function trackedCallers() {
  return hits.size;
}
