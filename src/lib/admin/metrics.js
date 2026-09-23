/**
 * Backend operations metrics — who is using the app, what they're uploading,
 * and what is breaking.
 *
 * ── Why this is one module and not three route handlers ──────────────────────
 * Two things need these numbers: the admin dashboard (`/api/admin/metrics`) and
 * the nightly rollup (`/api/cron/usage-rollup`). If each computed its own, the
 * dashboard and the trend line it sits next to would drift apart and there would
 * be no way to tell which one was wrong. One aggregation, two callers.
 *
 * ── Why no schema change ─────────────────────────────────────────────────────
 * Every number here comes from a table that already exists. A new model means a
 * numbered migration that has to run cleanly against production on the next
 * deploy, which is a risk worth taking for real data and not for a read-only
 * dashboard. (This file used to say `amplify.yml` runs `prisma db push
 * --accept-data-loss`. It runs `prisma migrate deploy`, and `db push` against
 * production would drop tables no migration has declared.) The
 * one thing that genuinely needs storage — a day-over-day snapshot, which cannot
 * be reconstructed after the fact — goes into the existing `SystemConfig` k/v
 * table under a `usage.rollup.<date>` key.
 *
 * ── Why bucketing happens in JS, not SQL ─────────────────────────────────────
 * Dev runs SQLite and production runs Postgres. `DATE_TRUNC` is Postgres-only and
 * `strftime` is SQLite-only, and `scripts/check-migrations-postgres.js` blocks
 * the second at deploy time for good reason. Pulling `createdAt` and bucketing in
 * JS is identical on both engines. The windows here are days, not years, so the
 * row counts stay small.
 *
 * ── What is NOT here ─────────────────────────────────────────────────────────
 * No file contents, no prompts, no completions, no dealer-net anything. This is
 * an operational view — counts, sizes, timings, outcomes. A dashboard that
 * displayed the artifacts would be a second copy of everything sensitive the app
 * touches, sitting behind one more page that has to be gated correctly forever.
 *
 * @see src/app/api/admin/metrics/route.js  — the dashboard's reader
 * @see src/app/api/cron/usage-rollup/route.js — the scheduled writer
 * @see scripts/tests/adminMetrics.test.mjs
 */

/** Default lookback for the dashboard. */
export const DEFAULT_WINDOW_DAYS = 30;

/** Longest window the API will honour, so a stray `?days=100000` can't table-scan. */
export const MAX_WINDOW_DAYS = 365;

/** `YYYY-MM-DD` in UTC. Used as the bucket key and as the SystemConfig key suffix. */
export function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * Bucket timestamped rows into a dense per-day series.
 *
 * Dense, not sparse: a day with zero uploads must appear as a zero, otherwise a
 * chart silently closes the gap and an outage reads as a quiet week.
 */
export function bucketByDay(rows, since, until, { field = 'createdAt', value = null } = {}) {
  const buckets = new Map();
  for (let d = new Date(dayKey(since)); d <= until; d.setUTCDate(d.getUTCDate() + 1)) {
    buckets.set(dayKey(d), { day: dayKey(d), count: 0, total: 0 });
  }
  for (const row of rows) {
    const b = buckets.get(dayKey(row[field]));
    if (!b) continue;              // outside the window; caller over-fetched
    b.count += 1;
    if (value) b.total += Number(row[value]) || 0;
  }
  return [...buckets.values()];
}

/** Count occurrences of `key` across rows, returned biggest-first. */
function tally(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const k = row[key] ?? 'unknown';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Collect every metric for a window.
 *
 * @param {object} prisma  the Prisma client (injected so this is unit-testable)
 * @param {object} [opts]
 * @param {Date}   [opts.since]
 * @param {Date}   [opts.until]
 * @param {function} [opts.readLedger] async () => ledger entries; injected for the
 *                   same reason — `@/lib/agent/ledger` is an `@`-aliased import
 *                   that plain `node --test` cannot resolve.
 */
export async function collectMetrics(prisma, opts = {}) {
  const until = opts.until || new Date();
  const since = opts.since || new Date(until.getTime() - DEFAULT_WINDOW_DAYS * 86400_000);
  const window = { gte: since, lte: until };

  const [
    files, drawings, pipelineUploads, activity, bugs, users,
  ] = await Promise.all([
    prisma.projectFile.findMany({
      where:  { createdAt: window },
      select: { createdAt: true, size: true, tab: true, fileType: true, uploadedById: true },
    }),
    prisma.drawingFile.findMany({
      where:  { createdAt: window },
      select: { createdAt: true },
    }).catch(() => []),   // optional table — absent in older databases
    prisma.pipelineUpload.findMany({
      where:  { createdAt: window },
      select: { createdAt: true, rowCount: true, uploadedById: true },
    }).catch(() => []),
    prisma.projectActivity.findMany({
      where:  { createdAt: window },
      select: { createdAt: true, userId: true, userName: true, userEmail: true, type: true },
    }),
    prisma.bugReport.findMany({
      where:  { createdAt: window },
      select: { createdAt: true, status: true, severity: true, module: true },
    }),
    prisma.user.findMany({
      where:  { isActive: true },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
  ]);

  const ledger = opts.readLedger ? await opts.readLedger() : [];
  const ledgerInWindow = ledger.filter(e => {
    const t = new Date(e.at);
    return t >= since && t <= until;
  });

  return {
    window: { since: since.toISOString(), until: until.toISOString(), days: Math.round((until - since) / 86400_000) },
    users:   summariseUsers(users, activity, since, until),
    uploads: summariseUploads(files, drawings, pipelineUploads, since, until),
    errors:  summariseErrors(bugs, ledgerInWindow, since, until),
    ai:      summariseAi(ledgerInWindow, since, until),
  };
}

// ── Users ────────────────────────────────────────────────────────────────────

function summariseUsers(users, activity, since, until) {
  const byUser = new Map();
  for (const a of activity) {
    const u = byUser.get(a.userId) || {
      userId: a.userId, name: a.userName || null, email: a.userEmail || null,
      actions: 0, lastSeen: null,
    };
    u.actions += 1;
    // `name`/`email` are denormalised onto ProjectActivity and can be null on
    // older rows; keep the first non-null rather than letting a null overwrite.
    u.name  ||= a.userName  || null;
    u.email ||= a.userEmail || null;
    if (!u.lastSeen || a.createdAt > u.lastSeen) u.lastSeen = a.createdAt;
    byUser.set(a.userId, u);
  }

  // Fill in anyone the activity rows knew only by id.
  for (const u of byUser.values()) {
    if (u.name && u.email) continue;
    const known = users.find(x => x.id === u.userId);
    if (known) { u.name ||= known.name; u.email ||= known.email; }
  }

  const active = [...byUser.values()].sort((a, b) => b.actions - a.actions);

  return {
    registered:  users.length,
    activeCount: active.length,
    // Registered-but-silent is the number worth seeing: seats being paid for and
    // not used, and the first symptom of a login or permissions problem.
    dormant:     users.filter(u => !byUser.has(u.id)).map(u => ({
      userId: u.id, name: u.name, email: u.email, role: u.role,
    })),
    perUser:     active.map(u => ({ ...u, lastSeen: u.lastSeen?.toISOString?.() || u.lastSeen })),
    byAction:    tally(activity, 'type'),
    daily:       bucketByDay(activity, since, until),
  };
}

// ── Uploads ──────────────────────────────────────────────────────────────────

function summariseUploads(files, drawings, pipelineUploads, since, until) {
  const bytes = files.reduce((sum, f) => sum + (f.size || 0), 0);

  const perUser = new Map();
  for (const f of files) {
    const u = perUser.get(f.uploadedById) || { userId: f.uploadedById, files: 0, bytes: 0 };
    u.files += 1;
    u.bytes += f.size || 0;
    perUser.set(f.uploadedById, u);
  }

  return {
    projectFiles:    files.length,
    bytes,
    drawingFiles:    drawings.length,
    pipelineUploads: pipelineUploads.length,
    byTab:           tally(files, 'tab'),
    byType:          tally(files, 'fileType'),
    perUser:         [...perUser.values()].sort((a, b) => b.files - a.files),
    daily:           bucketByDay(files, since, until, { value: 'size' }),
  };
}

// ── Errors ───────────────────────────────────────────────────────────────────

function summariseErrors(bugs, ledger, since, until) {
  const agentErrors = ledger.filter(e => e.status === 'error');

  return {
    bugsReported: bugs.length,
    // Open, not total: a count that includes everything already fixed never goes
    // down, so nobody looks at it twice.
    bugsOpen:     bugs.filter(b => b.status !== 'FIXED').length,
    bugsBySeverity: tally(bugs, 'severity'),
    bugsByModule:   tally(bugs, 'module'),
    agentErrors:    agentErrors.length,
    agentErrorRate: ledger.length ? agentErrors.length / ledger.length : 0,
    agentErrorsByTask: tally(agentErrors, 'task'),
    // Deliberately capped and only ever the message — never params or output.
    recentAgentErrors: agentErrors.slice(-20).reverse().map(e => ({
      at: e.at, task: e.task, model: e.model, error: e.error,
    })),
    daily: bucketByDay(bugs, since, until),
  };
}

// ── AI usage ─────────────────────────────────────────────────────────────────

function summariseAi(ledger, since, until) {
  const byTask = new Map();
  for (const e of ledger) {
    const t = byTask.get(e.task) || {
      task: e.task, runs: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalMs: 0,
    };
    t.runs         += 1;
    t.errors       += e.status === 'error' ? 1 : 0;
    t.inputTokens  += e.inputTokens  || 0;
    t.outputTokens += e.outputTokens || 0;
    t.totalMs      += e.durationMs   || 0;
    byTask.set(e.task, t);
  }

  return {
    runs:         ledger.length,
    inputTokens:  ledger.reduce((s, e) => s + (e.inputTokens  || 0), 0),
    outputTokens: ledger.reduce((s, e) => s + (e.outputTokens || 0), 0),
    byTask: [...byTask.values()]
      .map(t => ({
        ...t,
        errorRate: t.runs ? t.errors / t.runs : 0,
        avgMs:     t.runs ? Math.round(t.totalMs / t.runs) : 0,
      }))
      .sort((a, b) => b.runs - a.runs),
    byModel: tally(ledger, 'model'),
    daily:   bucketByDay(ledger.map(e => ({ createdAt: e.at })), since, until),
  };
}

// ── Rollup snapshots ─────────────────────────────────────────────────────────

/** SystemConfig key for one day's snapshot. */
export function rollupKey(date) {
  return `usage.rollup.${dayKey(date)}`;
}

/**
 * Reduce a full metrics object to the handful of scalars worth keeping forever.
 *
 * The dashboard can always recompute detail from live tables; what it cannot do
 * is recompute *history*, because the JSONL agent ledger does not survive a
 * Lambda and rows get deleted. So the snapshot keeps totals only — small enough
 * that a year of them is a few hundred KB in `SystemConfig`, and free of anything
 * that would make it a second store of sensitive data.
 */
export function toSnapshot(metrics) {
  return {
    day:             dayKey(metrics.window.until),
    activeUsers:     metrics.users.activeCount,
    registeredUsers: metrics.users.registered,
    actions:         metrics.users.daily.reduce((s, d) => s + d.count, 0),
    uploads:         metrics.uploads.projectFiles,
    uploadBytes:     metrics.uploads.bytes,
    bugsReported:    metrics.errors.bugsReported,
    bugsOpen:        metrics.errors.bugsOpen,
    agentRuns:       metrics.ai.runs,
    agentErrors:     metrics.errors.agentErrors,
    inputTokens:     metrics.ai.inputTokens,
    outputTokens:    metrics.ai.outputTokens,
  };
}
