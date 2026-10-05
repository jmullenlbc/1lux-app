/**
 * A project's number ladder (migration 0116). Mike, 2026-10-03: "A conceptual
 * budget gets overwritten by a budget which gets overwritten by a signed PO."
 *
 * One row per number we were given, never deleted. A newer number on the same
 * step archives the older one, so the history stays. The project's current
 * number is the highest step that has a live row.
 *
 * Pure: safe in the browser. The writer takes the database client as an
 * argument so it can be tested without one.
 */

export const BUDGET_TIERS = ['conceptual', 'budget', 'po'];
export const BUDGET_TIER_LABELS = { conceptual: 'Conceptual', budget: 'Budget', po: 'Signed PO' };
export const BUDGET_SOURCES = ['web-request', 'unfinished-draft', 'budget-file', 'po-file', 'manual'];
export const BUDGET_SOURCE_LABELS = {
  'web-request': 'Web budget request',
  'unfinished-draft': 'Unfinished web budget',
  'budget-file': 'Budget file upload',
  'po-file': 'Signed contract upload',
  manual: 'Typed in',
};

// The guess accuracy card says nothing about a building type until this many
// jobs have both a conceptual and a final number. Nothing ever auto-applies.
export const MIN_JOBS_TO_SUGGEST = 5;

const live = r => r && !r.archivedAt && Number.isFinite(Number(r.amount)) && Number(r.amount) > 0;
const time = r => new Date(r?.createdAt || 0).getTime() || 0;

/** The live row on each step, newest first wins. */
export function budgetLadder(rows) {
  const out = { conceptual: null, budget: null, po: null };
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!live(r) || !BUDGET_TIERS.includes(r.tier)) continue;
    if (!out[r.tier] || time(r) > time(out[r.tier])) out[r.tier] = r;
  }
  return out;
}

/** The number that counts now: Signed PO, else Budget, else Conceptual. */
export function currentBudgetAmount(rows) {
  const ladder = budgetLadder(rows);
  for (const tier of [...BUDGET_TIERS].reverse()) {
    if (ladder[tier]) return { tier, amount: Number(ladder[tier].amount), row: ladder[tier] };
  }
  return null;
}

/** Reads a typed or parsed amount. Null when it is not a positive dollar figure. */
export function cleanAmount(v) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Records one number. Archives the live row on the same step first, so there
 * is only ever one live number per step. Returns the new row, or null when the
 * amount or step is not usable (never throws for bad input).
 */
export async function recordBudgetAmount(db, { projectId, tier, amount, source, fileId = null, note = null, recordedById = null, now = new Date() }) {
  const value = cleanAmount(amount);
  if (!projectId || !BUDGET_TIERS.includes(tier) || value == null) return null;
  await db.projectBudgetAmount.updateMany({
    where: { projectId, tier, archivedAt: null },
    data: { archivedAt: now },
  });
  return db.projectBudgetAmount.create({
    data: {
      projectId, tier, amount: value,
      source: BUDGET_SOURCES.includes(source) ? source : 'manual',
      fileId: fileId || null,
      note: note ? String(note).slice(0, 500) : null,
      recordedById: recordedById || null,
    },
  });
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * How good were our conceptual numbers? One entry per building type, from
 * projects that have a live conceptual number AND a later one (budget or PO).
 * `diffPct` is (final / conceptual - 1): +0.10 means the real number came in
 * 10% above our guess.
 *
 * @param projects [{id, name, buildingType, amounts: [rows]}]
 */
export function conceptualAccuracy(projects) {
  const jobs = [];
  for (const p of Array.isArray(projects) ? projects : []) {
    const ladder = budgetLadder(p?.amounts);
    const final = ladder.po || ladder.budget;
    if (!ladder.conceptual || !final) continue;
    const guess = Number(ladder.conceptual.amount);
    const real = Number(final.amount);
    jobs.push({
      id: p.id, name: p.name, buildingType: p.buildingType || 'unknown',
      conceptual: guess, final: real, finalTier: final.tier,
      diffPct: real / guess - 1,
    });
  }
  const byType = new Map();
  for (const j of jobs) {
    if (!byType.has(j.buildingType)) byType.set(j.buildingType, []);
    byType.get(j.buildingType).push(j);
  }
  const types = [...byType.entries()].map(([buildingType, list]) => {
    const diffs = list.map(j => j.diffPct);
    const enough = list.length >= MIN_JOBS_TO_SUGGEST;
    const mid = median(diffs);
    return {
      buildingType,
      jobs: list.length,
      medianDiffPct: mid,
      avgMissPct: diffs.reduce((s, d) => s + Math.abs(d), 0) / diffs.length,
      enough,
      // A suggestion for a person to look at, never applied by itself.
      suggestion: enough && Math.abs(mid) >= 0.05
        ? `Our conceptual numbers run ${Math.round(Math.abs(mid) * 100)}% ${mid > 0 ? 'low' : 'high'} on this type. Worth a look at the guesses.`
        : null,
    };
  }).sort((a, b) => b.jobs - a.jobs);
  return { jobs: jobs.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct)), types };
}
