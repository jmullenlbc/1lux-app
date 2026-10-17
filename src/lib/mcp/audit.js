/**
 * The audit sink.
 *
 * Rule this module exists to enforce: **an endpoint that can read the whole
 * database must be auditable, or it must not answer.** "Did we send The
 * Approach's budget?" is only a trustworthy answer if there is a record of who
 * asked what, and a read API with no log is a read API nobody can reason about
 * after the fact.
 *
 * The complication is that the natural home for this, an `McpQueryLog` table
 * is a schema change, and schema changes go to production only as a numbered
 * migration: `amplify.yml` runs `prisma migrate deploy`. (Never `db push`
 * against production, it would drop the ContactLegacy backup table.)
 *
 * So the sink is swappable, resolved once per process, in this order:
 *
 *   1. `prisma.mcpQueryLog` exists  → write rows. (Once its migration ships.)
 *   2. not production               → append JSONL to .mcp-audit/. Good enough
 *                                     for local development and for the tests.
 *   3. production, no table         → NO SINK. The server refuses every request
 *                                     with 503 rather than serving unlogged reads.
 *
 * Step 3 is the whole point. It would be easy to make this degrade to a
 * console.log and ship; that would mean the first production incident is
 * un-investigable.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db';

export const SINK = Object.freeze({
  PRISMA: 'prisma',
  FILE:   'file',
  NONE:   'none',
});

const AUDIT_DIR  = path.join(process.cwd(), '.mcp-audit');
const AUDIT_FILE = path.join(AUDIT_DIR, 'mcp-queries.jsonl');

let resolved = null;

/** Which sink is active. Resolved once; cheap to call repeatedly. */
export function resolveSink() {
  if (resolved) return resolved;

  if (typeof prisma?.mcpQueryLog?.create === 'function') {
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
  resolved = null;
}

/**
 * Is the server allowed to answer at all?
 * @returns {{ok: true, sink: string} | {ok: false, status: number, message: string}}
 */
export function auditReady() {
  const sink = resolveSink();
  if (sink === SINK.NONE) {
    return {
      ok: false,
      status: 503,
      message:
        'MCP is unavailable: no audit sink. The McpQueryLog table does not exist and file logging is ' +
        'disabled in production. A read API over the whole database does not run unlogged.',
    };
  }
  return { ok: true, sink };
}

/**
 * Record one tool call.
 *
 * Never throws. A failed audit write must not take down the response that was
 * already computed, but it is logged to stderr so a silently-degrading sink is
 * visible in CloudWatch rather than invisible.
 *
 * `params` is stored as a JSON string and is deliberately NOT redacted: it is
 * the question, not the answer, and knowing that someone asked to filter by
 * `dnPerUnit` is exactly what an audit log is for. Row counts are recorded
 * instead of rows, the log is a record of access, not a second copy of the data.
 */
export async function logQuery({
  caller,
  tool,
  params,
  model = null,
  rowCount = null,
  durationMs = null,
  status = 'ok',
  error = null,
}) {
  const entry = {
    at: new Date().toISOString(),
    callerKind: caller?.kind || null,
    callerId: caller?.id || null,
    callerEmail: caller?.email || null,
    callerRole: caller?.role || null,
    audience: caller?.audience || null,
    tool,
    model,
    params: safeJson(params),
    rowCount,
    durationMs,
    status,
    error: error ? String(error).slice(0, 500) : null,
  };

  try {
    const sink = resolveSink();
    if (sink === SINK.PRISMA) {
      await prisma.mcpQueryLog.create({ data: entry });
    } else if (sink === SINK.FILE) {
      await fs.mkdir(AUDIT_DIR, { recursive: true });
      await fs.appendFile(AUDIT_FILE, JSON.stringify(entry) + '\n', 'utf8');
    }
  } catch (err) {
    console.error('[mcp/audit] failed to record query, the read still happened:', err?.message || err);
  }
}

/** Read back recent entries. File sink only; used by the tests. */
export async function readFileAuditTail(limit = 50) {
  try {
    const raw = await fs.readFile(AUDIT_FILE, 'utf8');
    return raw.split('\n').filter(Boolean).slice(-limit).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null).slice(0, 4000);
  } catch {
    return '"<unserialisable>"';
  }
}
