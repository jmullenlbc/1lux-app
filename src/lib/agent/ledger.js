/**
 * The AgentRun ledger — one row per model call, across the whole app.
 *
 * Slice 4a of the Governed AI Layer, and deliberately only 4a: **record every
 * call.** No trust tiers, no review queue, no blocking. Those are 4b, and they
 * are unbuildable until this exists, because there is currently no way to answer
 * "how often does the follow-up drafter run, and what does it cost" — which is
 * the question that decides which calls need a reviewer at all.
 *
 * ── Why a ledger rather than logging ─────────────────────────────────────────
 * `console.log` in a Lambda answers "did this one request work". It does not
 * answer "which task burned $40 last month", "did the tone profile regress after
 * the prompt change on the 3rd", or "is any agent quietly failing 20% of the
 * time and falling back to a default nobody notices". Those are queries, so the
 * record has to be rows.
 *
 * ── The same sink problem as mcp/audit.js, and the same answer ───────────────
 * The natural home is an `AgentRun` table, and schema changes are risky here:
 * `amplify.yml` runs `prisma db push --accept-data-loss`, so a model added on
 * one side and absent on the other is permanent data loss. So the sink is
 * resolved at runtime, in this order:
 *
 *   1. `prisma.agentRun` exists → write rows. (After the model is pushed.)
 *   2. not production           → append JSONL to .agent-runs/.
 *   3. production, no table     → console.warn once, then drop.
 *
 * Step 3 differs from the MCP auditor on purpose, and the difference is the
 * point. There, no sink means REFUSE — an unlogged read API is a liability, and
 * failing closed costs nothing but an error message. Here, failing closed would
 * mean an unpushed migration silently disables contract analysis, RFI drafting
 * and schedule parsing across the app. The ledger is an observability record,
 * not an access-control boundary; it must never be load-bearing for the feature
 * it observes. It says so loudly once per process instead.
 *
 * ── What is NOT stored ───────────────────────────────────────────────────────
 * Not prompts, not completions. Those carry client names, buy prices, contract
 * terms and internal notes, and a ledger that copies them is a second, unaudited
 * store of everything sensitive the app touches — with none of the redaction the
 * rest of this layer exists to enforce. Sizes, token counts, latency, model and
 * outcome answer the operational questions without becoming that store.
 *
 * @see src/lib/agent/client.js — the wrapper that feeds this
 * @see scripts/tests/agentLedger.test.mjs
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const SINK = Object.freeze({
  PRISMA: 'prisma',
  FILE:   'file',
  NONE:   'none',
});

const LEDGER_DIR  = path.join(process.cwd(), '.agent-runs');
const LEDGER_FILE = path.join(LEDGER_DIR, 'agent-runs.jsonl');

let resolved = null;
let warned   = false;

/**
 * Which sink is active. Resolved once per process.
 *
 * `prisma` is imported lazily rather than at module load: this module is
 * unit-tested under plain `node --test`, and a top-level `@/lib/db` import would
 * drag in the Prisma client and the `@` alias with it.
 */
export function resolveSink(prismaClient = null) {
  if (resolved) return resolved;

  if (typeof prismaClient?.agentRun?.create === 'function') {
    resolved = SINK.PRISMA;
  } else if (process.env.NODE_ENV !== 'production') {
    resolved = SINK.FILE;
  } else {
    resolved = SINK.NONE;
  }
  return resolved;
}

/** Test seam: forget the memoised sink so a test can exercise another branch. */
export function _resetSinkForTests() {
  resolved  = null;
  warned    = false;
  injected  = null;
}

/**
 * Test seam: supply the Prisma client instead of importing it.
 *
 * Needed because the PRISMA branch is otherwise unreachable under `node --test` —
 * `loadPrisma()` resolves `@/lib/db`, and the `@` alias is a bundler feature the
 * test runner cannot resolve, so it always returns null. Without this, the test
 * for "a failing table write must not fail the call" silently exercised the file
 * sink instead and proved nothing.
 */
export function _setPrismaForTests(client) {
  injected = client;
}

let injected = null;

/**
 * Record one model call.
 *
 * Never throws, and never rejects. A ledger write failing must not take down the
 * feature it was observing — that would make adding observability a net
 * reliability loss, which is how observability gets removed.
 *
 * @param {object} run
 * @param {string} run.task        what this call is FOR ('rfi.draft', 'schedule.parse').
 *                                 The dimension every operational question groups by.
 * @param {string} run.model       the model id actually used
 * @param {string} [run.status]    'ok' | 'error'
 * @param {number} [run.durationMs]
 * @param {number} [run.inputTokens]
 * @param {number} [run.outputTokens]
 * @param {string} [run.stopReason]
 * @param {string} [run.projectId] scopes a run to the project it acted on
 * @param {string} [run.userId]    who triggered it; null for scheduled jobs
 * @param {string} [run.error]
 */
export async function recordRun(run) {
  const entry = {
    at:           new Date().toISOString(),
    task:         run.task || 'unknown',
    model:        run.model || null,
    status:       run.status || 'ok',
    durationMs:   run.durationMs ?? null,
    inputTokens:  run.inputTokens ?? null,
    outputTokens: run.outputTokens ?? null,
    stopReason:   run.stopReason || null,
    projectId:    run.projectId || null,
    userId:       run.userId || null,
    // Truncated hard: an error string can carry an echoed prompt.
    error:        run.error ? String(run.error).slice(0, 500) : null,
  };

  try {
    const prismaClient = await loadPrisma();
    let sink = resolveSink(prismaClient);

    // The sink is memoised, but the client is resolved per call — and those two
    // can disagree. A caller that reached the PRISMA branch once and then hits a
    // context where `@/lib/db` will not resolve (a script, a test) would otherwise
    // dereference null and lose the entry to the catch below, which reads in the
    // logs as a database fault rather than "no client here". Degrade explicitly.
    if (sink === SINK.PRISMA && !prismaClient) {
      sink = process.env.NODE_ENV !== 'production' ? SINK.FILE : SINK.NONE;
    }

    if (sink === SINK.PRISMA) {
      await prismaClient.agentRun.create({ data: toRow(entry) });
    } else if (sink === SINK.FILE) {
      await fs.mkdir(LEDGER_DIR, { recursive: true });
      await fs.appendFile(LEDGER_FILE, JSON.stringify(entry) + '\n', 'utf8');
    } else if (!warned) {
      warned = true;
      console.warn(
        '[agent/ledger] No AgentRun table and file logging is off in production — ' +
        'model calls are running UNRECORDED. Push the AgentRun model to restore the ledger.'
      );
    }
  } catch (err) {
    console.error('[agent/ledger] failed to record a run — the call itself still happened:', err?.message || err);
  }
}

/**
 * Translate a ledger entry into an AgentRun row.
 *
 * These two shapes were written months apart and never lined up: the entry uses
 * the JSONL names (task / durationMs / at / error), the table uses the review
 * layer's names (taskType / latencyMs / createdAt / errorMessage), and taskType
 * is REQUIRED. So every production write failed validation, got swallowed by the
 * catch above -- exactly as designed, the parse kept working -- and the ledger
 * silently recorded nothing while the dev JSONL sink looked perfectly healthy.
 * Found 2026-08-25 in the dev log of a live intake parse.
 *
 * The entry shape is left alone on purpose: the JSONL file, readLedgerTail and
 * the tests all read it, and it is the shape callers already pass.
 *
 * `stopReason` has no column and is dropped rather than smuggled into `note`,
 * which belongs to the reviewer.
 *
 * Status: a ledger row is an observation, not a proposal, so it is CLOSED (or
 * ERROR) and not reviewable. PENDING would park it in a queue nobody will ever
 * work, and AUTO_PASSED would claim auto-checks ran when none did.
 */
function toRow(entry) {
  return {
    taskType:     entry.task,
    model:        entry.model,
    status:       entry.status === 'error' ? 'ERROR' : 'CLOSED',
    reviewable:   false,
    latencyMs:    entry.durationMs,
    inputTokens:  entry.inputTokens,
    outputTokens: entry.outputTokens,
    projectId:    entry.projectId,
    userId:       entry.userId,
    errorMessage: entry.error,
  };
}

/** Lazily resolve the Prisma client; null if unavailable (tests, scripts). */
async function loadPrisma() {
  if (injected) return injected;
  try {
    const mod = await import('@/lib/db');
    return mod.prisma || null;
  } catch {
    return null;
  }
}

/** Read back recent entries. File sink only; used by the tests and by reporting. */
export async function readLedgerTail(limit = 100) {
  try {
    const raw = await fs.readFile(LEDGER_FILE, 'utf8');
    return raw.split('\n').filter(Boolean).slice(-limit)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Roll the ledger up by task — the shape every operational question wants.
 * Kept here rather than in a route so the nightly checks (Slice 5) and any
 * future dashboard read the same aggregation.
 */
export function summarise(entries) {
  const byTask = {};
  for (const e of entries) {
    const t = (byTask[e.task] ||= {
      task: e.task, runs: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalMs: 0,
    });
    t.runs        += 1;
    t.errors      += e.status === 'error' ? 1 : 0;
    t.inputTokens += e.inputTokens  || 0;
    t.outputTokens+= e.outputTokens || 0;
    t.totalMs     += e.durationMs   || 0;
  }
  return Object.values(byTask)
    .map(t => ({ ...t, errorRate: t.runs ? t.errors / t.runs : 0, avgMs: t.runs ? Math.round(t.totalMs / t.runs) : 0 }))
    .sort((a, b) => b.runs - a.runs);
}
