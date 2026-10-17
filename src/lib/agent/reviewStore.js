/**
 * The reviewable-run store, Steps 16 to 18 of the Governed AI Layer, Slice 4b.
 *
 * ── Why this exists separately from ledger.js ────────────────────────────────
 * `ledger.js` records EVERY model call and deliberately stores **no prompts and
 * no completions**, that record must not become a second, unredacted copy of
 * every contract the app touches.
 *
 * A review queue cannot work that way. A human being asked "is this extraction
 * right?" has to see the extraction. So a reviewable run stores `outputJson` and
 * `citations` on purpose, and the narrowness is the mitigation: only runs a
 * feature explicitly opens for review are stored this way, never the whole
 * firehose, and the INPUT is still only ever a hash plus a descriptor
 * (`summariseInput()` from untrusted.js), never the third-party document text.
 *
 * So the rule is: **outputs are reviewable, inputs are never stored.** A wrong
 * extraction is visible without the contract it came from being copied here.
 *
 * ── The stand-in, and why it is not a mock ───────────────────────────────────
 * The `AgentRun` table does not exist yet. Mike's call was to build Steps 16, 17
 * and 18 now against a local stand-in so the whole path is written and tested and
 * lights up the moment the table lands.
 *
 * That only works if the stand-in is *behaviourally* the same as the table in
 * every way a caller can observe: same field names, same status transitions,
 * same "verdict is write-once" rule, same ordering. Where it differs it must
 * differ loudly. It is a second implementation of one contract, not a fake
 * a fake would let a bug hide until the day the schema arrives, which is exactly
 * the day nobody wants to be debugging this.
 *
 * Sink resolution mirrors ledger.js, with one deliberate difference:
 *
 *   1. `prisma.agentRun` exists → rows. (After the model is pushed.)
 *   2. not production           → a JSON map in .agent-runs/reviews.json
 *   3. production, no table     → warn once, keep in memory for the process
 *
 * Step 3 differs from the ledger's "drop it". A dropped telemetry row costs a
 * gap in a chart. A dropped *reviewable* run means a human was told something was
 * queued for their sign-off and it silently was not, the queue would show empty
 * and read as "nothing to review" rather than "the store is broken". In-memory
 * keeps the current process honest, and `storeHealth()` lets the UI say so out
 * loud rather than showing a comforting empty list.
 *
 * ── Why a JSON map and not JSONL ─────────────────────────────────────────────
 * The ledger appends; nothing ever changes an entry. A review row is *mutated*
 * it opens as AWAITING_REVIEW and later carries a verdict. Append-only would need
 * a compaction pass to answer "what is this row now", and a compaction pass is a
 * thing to get wrong. A keyed map is the honest shape for mutable rows.
 *
 * @see src/lib/agent/autoChecks.js, Step 16, what gates AUTO_PASSED
 * @see src/lib/agentTrust.js, Step 18, what decides whether review is needed
 * @see scripts/tests/reviewStore.test.mjs
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const STATUS = Object.freeze({
  PENDING:         'PENDING',
  AUTO_PASSED:     'AUTO_PASSED',
  AWAITING_REVIEW: 'AWAITING_REVIEW',
  CLOSED:          'CLOSED',
  ERROR:           'ERROR',
});

export const VERDICT = Object.freeze({
  ACCEPTED:  'accepted',
  CORRECTED: 'corrected',
  REJECTED:  'rejected',
});

export const SINK = Object.freeze({ PRISMA: 'prisma', FILE: 'file', MEMORY: 'memory' });

const STORE_DIR  = path.join(process.cwd(), '.agent-runs');
const STORE_FILE = path.join(STORE_DIR, 'reviews.json');

let resolved  = null;
let warned    = false;
let injected  = null;
const memory  = new Map();

/** Test seam, forget the memoised sink and drop in-memory rows. */
export function _resetStoreForTests() {
  resolved = null;
  warned   = false;
  injected = null;
  memory.clear();
}

/** Test seam, supply the Prisma client rather than importing it. */
export function _setPrismaForTests(client) { injected = client; }

async function loadPrisma() {
  if (injected) return injected;
  try {
    const mod = await import('@/lib/db');
    return mod.prisma || null;
  } catch {
    return null;
  }
}

function resolveSink(prismaClient) {
  if (resolved) return resolved;
  if (typeof prismaClient?.agentRun?.create === 'function') resolved = SINK.PRISMA;
  else if (process.env.NODE_ENV !== 'production')           resolved = SINK.FILE;
  else                                                       resolved = SINK.MEMORY;
  return resolved;
}

/**
 * What the store is actually running on, for the UI to state plainly.
 *
 * The review queue showing an empty list means one of two very different things:
 * nothing needs review, or the store is a stand-in that lost everything on the
 * last deploy. A queue that cannot tell those apart is worse than no queue,
 * because it is quietly reassuring in exactly the case where it should not be.
 */
export async function storeHealth() {
  const sink = resolveSink(await loadPrisma());
  return {
    sink,
    durable: sink === SINK.PRISMA,
    note: {
      [SINK.PRISMA]: 'AgentRun table, durable.',
      [SINK.FILE]:   'Local stand-in (.agent-runs/reviews.json). Dev only; not shared between machines and not deployed.',
      [SINK.MEMORY]: 'NO STORE: the AgentRun table is missing in production. Verdicts live only in this process and are lost on restart.',
    }[sink],
  };
}

// ── File sink ────────────────────────────────────────────────────────────────
// Read-modify-write on a single JSON file. Safe enough for the dev stand-in
// (one process, one developer) and NOT safe for concurrent writers, which is
// among the reasons this is a stand-in and not the destination.

async function readFileMap() {
  try {
    return JSON.parse(await fs.readFile(STORE_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

async function writeFileMap(map) {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(map, null, 2), 'utf8');
}

// ── Shape ────────────────────────────────────────────────────────────────────

/**
 * Build a row in the exact shape of the planned `AgentRun` model.
 *
 * JSON-as-string for `outputJson`, `citations` and `autoChecks` looks redundant
 * in a JSON file, and it is, but it is what the Prisma model stores (SQLite has
 * no JSON column), and the stand-in exists to behave like the table. Storing a
 * real object here would let a caller write something Prisma later rejects.
 */
function buildRow(input) {
  const now = new Date().toISOString();
  return {
    id:            input.id || randomUUID(),
    taskType:      input.taskType,
    feature:       input.feature || null,
    model:         input.model || null,
    promptVersion: input.promptVersion || null,
    via:           input.via || 'app',

    projectId:     input.projectId || null,
    clientId:      input.clientId || null,
    userId:        input.userId || null,
    sourceFileId:  input.sourceFileId || null,

    inputTokens:   input.inputTokens ?? null,
    outputTokens:  input.outputTokens ?? null,
    cachedTokens:  input.cachedTokens ?? null,
    costUsd:       input.costUsd ?? null,
    latencyMs:     input.latencyMs ?? null,

    // Hash + descriptor only. Never the document.
    inputSummary:  input.inputSummary || null,
    outputJson:    input.output == null ? null : JSON.stringify(input.output),
    confidence:    input.confidence ?? null,
    citations:     input.citations == null ? null : JSON.stringify(input.citations),

    reviewable:    input.reviewable !== false,
    autoChecks:    input.autoChecks == null ? null : JSON.stringify(input.autoChecks),
    autoCheckPass: input.autoCheckPass ?? null,

    verdict:       null,
    verdictById:   null,
    verdictAt:     null,
    correction:    null,
    note:          null,

    status:        input.status || STATUS.PENDING,
    errorMessage:  input.errorMessage || null,

    createdAt:     now,
    updatedAt:     now,
  };
}

/** Parse the JSON-as-string columns back out, for a reader that wants objects. */
export function hydrate(row) {
  if (!row) return null;
  const parse = (s) => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };
  return {
    ...row,
    output:     parse(row.outputJson),
    citations:  parse(row.citations),
    autoChecks: parse(row.autoChecks),
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Record a reviewable run.
 *
 * Never throws. A store failure must not take down the feature that produced the
 * output, but unlike the ledger, it does not fail *silently* either: it returns
 * `{ stored: false }` so a caller that genuinely needs the run to be reviewable
 * (a Tier 0 task, where the output must not be written without a signature) can
 * see that it was not and refuse to write.
 */
export async function recordReviewableRun(input) {
  const row = buildRow(input);
  try {
    const prismaClient = await loadPrisma();
    let sink = resolveSink(prismaClient);
    if (sink === SINK.PRISMA && !prismaClient) {
      sink = process.env.NODE_ENV !== 'production' ? SINK.FILE : SINK.MEMORY;
    }

    if (sink === SINK.PRISMA) {
      await prismaClient.agentRun.create({ data: row });
    } else if (sink === SINK.FILE) {
      const map = await readFileMap();
      map[row.id] = row;
      await writeFileMap(map);
    } else {
      if (!warned) {
        warned = true;
        console.warn(
          '[agent/reviewStore] No AgentRun table in production, reviewable runs are ' +
          'being kept in memory only and will be LOST on restart. The review queue is ' +
          'not trustworthy until the AgentRun model is pushed.'
        );
      }
      memory.set(row.id, row);
    }
    return { stored: true, id: row.id, row };
  } catch (err) {
    console.error('[agent/reviewStore] failed to record a reviewable run:', err?.message || err);
    return { stored: false, id: row.id, row, error: String(err?.message || err) };
  }
}

/**
 * Attach a human verdict. **Write-once**, a verdict is a signature.
 *
 * Re-verdicting would let a second reviewer quietly overwrite the first, and
 * since Step 18 computes trust from these rows, that is a path to editing an
 * accuracy record after the fact. A correction to a verdict is a new
 * conversation, not an UPDATE.
 */
export async function recordVerdict(id, { verdict, correction = null, note = null, userId = null }) {
  if (!Object.values(VERDICT).includes(verdict)) {
    return { ok: false, error: `unknown verdict "${verdict}"` };
  }
  // The whole point of the queue is the corrections it captures, "corrected"
  // with nothing recorded about WHAT changed is the one outcome that teaches
  // nothing, and it is also the easiest button to click by reflex.
  if (verdict === VERDICT.CORRECTED && !String(correction || '').trim()) {
    return { ok: false, error: 'a corrected verdict must say what changed' };
  }

  const patch = {
    verdict,
    verdictById: userId || null,
    verdictAt:   new Date().toISOString(),
    correction:  correction ? String(correction).slice(0, 4000) : null,
    note:        note ? String(note).slice(0, 2000) : null,
    status:      STATUS.CLOSED,
    updatedAt:   new Date().toISOString(),
  };

  try {
    const prismaClient = await loadPrisma();
    let sink = resolveSink(prismaClient);
    if (sink === SINK.PRISMA && !prismaClient) {
      sink = process.env.NODE_ENV !== 'production' ? SINK.FILE : SINK.MEMORY;
    }

    if (sink === SINK.PRISMA) {
      // The `verdict: null` guard is the write-once rule expressed where it is
      // actually enforceable, in the WHERE clause, so two reviewers racing
      // produce one winner and one explicit refusal rather than a last-write-wins
      // silent overwrite.
      const res = await prismaClient.agentRun.updateMany({
        where: { id, verdict: null }, data: patch,
      });
      if (!res.count) return { ok: false, error: 'already reviewed, or no such run' };
      return { ok: true, id };
    }

    const bucket = sink === SINK.FILE ? await readFileMap() : Object.fromEntries(memory);
    const row = bucket[id];
    if (!row) return { ok: false, error: 'no such run' };
    if (row.verdict) return { ok: false, error: 'already reviewed' };

    Object.assign(row, patch);
    if (sink === SINK.FILE) await writeFileMap(bucket);
    else memory.set(id, row);
    return { ok: true, id };
  } catch (err) {
    console.error('[agent/reviewStore] failed to record a verdict:', err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** One run, hydrated. */
export async function getRun(id) {
  const rows = await allRows();
  return hydrate(rows.find(r => r.id === id) || null);
}

/**
 * The queue. Newest first, a reviewer working a backlog wants the freshest
 * extraction, because a stale one has usually been superseded by a re-parse.
 */
export async function listRuns({ status = null, taskType = null, verdict = null, limit = 100 } = {}) {
  let rows = await allRows();
  if (status)   rows = rows.filter(r => r.status === status);
  if (taskType) rows = rows.filter(r => r.taskType === taskType);
  if (verdict)  rows = rows.filter(r => r.verdict === verdict);
  return rows
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map(hydrate);
}

/**
 * Verdict history for one task type at one prompt version, the input to Step 18.
 *
 * Oldest → newest, because "the last 5 runs" and "the last 50 verdicts" are both
 * questions about the END of this list, and a caller that has to remember to
 * reverse it first will eventually forget.
 */
export async function verdictHistory(taskType, promptVersion = null, limit = 50) {
  const rows = (await allRows())
    .filter(r => r.taskType === taskType && r.verdict)
    // `null` promptVersion means "unversioned", which is a real value and must
    // match only other unversioned rows, not "any version".
    .filter(r => (r.promptVersion || null) === (promptVersion || null))
    .sort((a, b) => String(a.verdictAt).localeCompare(String(b.verdictAt)));
  return rows.slice(-limit).map(r => ({
    id: r.id, verdict: r.verdict, verdictAt: r.verdictAt, autoCheckPass: r.autoCheckPass,
  }));
}

async function allRows() {
  try {
    const prismaClient = await loadPrisma();
    let sink = resolveSink(prismaClient);
    if (sink === SINK.PRISMA && !prismaClient) {
      sink = process.env.NODE_ENV !== 'production' ? SINK.FILE : SINK.MEMORY;
    }
    if (sink === SINK.PRISMA) {
      const rows = await prismaClient.agentRun.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
      // Prisma hands back Date objects; the file sink holds ISO strings. Every
      // comparison downstream is a string compare, so normalise here rather than
      // making each caller remember which sink it is talking to.
      return rows.map(r => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
        verdictAt: r.verdictAt instanceof Date ? r.verdictAt.toISOString() : r.verdictAt,
      }));
    }
    if (sink === SINK.FILE) return Object.values(await readFileMap());
    return [...memory.values()];
  } catch (err) {
    console.error('[agent/reviewStore] read failed:', err?.message || err);
    return [];
  }
}
