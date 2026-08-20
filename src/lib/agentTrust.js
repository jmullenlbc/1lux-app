/**
 * Trust tiers — Step 18 of the Governed AI Layer, Slice 4b.
 *
 * How much autonomy has a given task type actually EARNED, measured from human
 * verdicts rather than asserted in a config file.
 *
 *   Tier 0 — Supervised. Output goes to a human before it is written to a
 *            project record. The default for every new task type.
 *   Tier 1 — Auto-edit.  Written, flagged `aiFlagged`, surfaced for review.
 *            Earned at ≥10 verdicts and ≥90% accepted.
 *   Tier 2 — Auto-write. Written silently — but a 10% random sample still goes
 *            to review, forever. Earned at ≥20 verdicts and ≥95% accepted.
 *
 * ── Three rules that matter more than the thresholds ─────────────────────────
 *
 * **Trust goes down.** Two non-accepted verdicts in the last five runs drops the
 * type one tier. Trust that cannot fall isn't trust — it's a permission somebody
 * forgot to revoke. The demotion window is short (5) on purpose: a type that has
 * built up 200 clean verdicts should still lose autonomy the week it starts
 * getting things wrong, not once the long-run average finally sags.
 *
 * **Some things never earn it.** `lookup.codeRequirement` and `review.contract`
 * are permanently Tier 0 no matter how good the numbers get. Code compliance and
 * contract language carry legal exposure; a human signs those forever. This is a
 * policy decision, not a measurement, so it is not overridable by data.
 *
 * **A rewritten prompt starts over.** Accuracy history is keyed to
 * `promptVersion`. Bump the version and the history for the new version is
 * empty, so the type is Tier 0 again. It is strict and it will be annoying. It is
 * also the only thing stopping a rewritten prompt from inheriting an accuracy
 * record it never earned.
 *
 * ── Why the sampling is here and not at the call site ────────────────────────
 * Tier 2's 10% sample is the only thing that keeps a fully-autonomous task type
 * measurable. Left to each caller it would be implemented three different ways
 * and dropped in the fourth, and its absence is invisible — a task with no
 * samples looks exactly like a task that is doing fine.
 *
 * @see src/lib/agent/reviewStore.js — where verdicts come from
 * @see scripts/tests/agentTrust.test.mjs
 */
// Relative, not `@/lib/...`, on purpose: scripts/tests/agentTrust.test.mjs imports
// this file under plain Node, which does not know the `@/` alias.
//
// This makes the module server-only — reviewStore reaches node:crypto — so the
// review-queue UI takes tier labels as plain props rather than importing TIER_LABEL.
// A client component importing this file fails the webpack build outright.
import { verdictHistory } from './agent/reviewStore.js';

export const TIER = Object.freeze({
  SUPERVISED: 0,
  AUTO_EDIT:  1,
  AUTO_WRITE: 2,
});

export const TIER_LABEL = Object.freeze({
  0: 'Supervised',
  1: 'Auto-edit',
  2: 'Auto-write',
});

/** Legal exposure, not accuracy. No verdict record promotes these. */
export const PERMANENT_TIER_0 = Object.freeze([
  'lookup.codeRequirement',
  'review.contract',
]);

const PROMOTION = [
  { tier: TIER.AUTO_WRITE, minVerdicts: 20, minAcceptRate: 0.95 },
  { tier: TIER.AUTO_EDIT,  minVerdicts: 10, minAcceptRate: 0.90 },
];

const DEMOTION_WINDOW    = 5;
const DEMOTION_THRESHOLD = 2;
export const TIER_2_SAMPLE_RATE = 0.10;

/**
 * Compute the tier from a verdict history. Pure — no store, no clock, no IO.
 *
 * @param {string} taskType
 * @param {Array<{verdict: string}>} history oldest → newest, already filtered to
 *        the current promptVersion. Order matters: demotion reads the tail.
 * @returns {{tier: number, label: string, reason: string, verdicts: number,
 *           acceptRate: number, demoted: boolean, permanent: boolean}}
 */
export function computeTier(taskType, history = []) {
  const verdicts = history.filter(h => h?.verdict);
  const accepted = verdicts.filter(h => h.verdict === 'accepted').length;
  const acceptRate = verdicts.length ? accepted / verdicts.length : 0;

  const base = {
    verdicts: verdicts.length,
    acceptRate,
    demoted: false,
    permanent: false,
  };

  if (PERMANENT_TIER_0.includes(taskType)) {
    return {
      ...base, tier: TIER.SUPERVISED, label: TIER_LABEL[0], permanent: true,
      reason: 'Permanently supervised — legal exposure. A human signs this one regardless of accuracy.',
    };
  }

  let tier = TIER.SUPERVISED;
  let reason = verdicts.length
    ? `${verdicts.length} verdict${verdicts.length === 1 ? '' : 's'} at ${pct(acceptRate)} accepted — not yet ${PROMOTION[1].minVerdicts} verdicts at ${pct(PROMOTION[1].minAcceptRate)}.`
    : 'No verdicts yet at this prompt version. Every new task type starts supervised.';

  for (const rule of PROMOTION) {
    if (verdicts.length >= rule.minVerdicts && acceptRate >= rule.minAcceptRate) {
      tier = rule.tier;
      reason = `${verdicts.length} verdicts at ${pct(acceptRate)} accepted — clears ${rule.minVerdicts} / ${pct(rule.minAcceptRate)}.`;
      break;
    }
  }

  // Demotion reads the recent tail, so a long clean history does not insulate a
  // type that has started failing this week.
  const recent = verdicts.slice(-DEMOTION_WINDOW);
  const recentBad = recent.filter(h => h.verdict !== 'accepted').length;
  if (tier > TIER.SUPERVISED && recentBad >= DEMOTION_THRESHOLD) {
    tier -= 1;
    return {
      ...base, tier, label: TIER_LABEL[tier], demoted: true,
      reason: `Demoted — ${recentBad} non-accepted verdicts in the last ${recent.length}. ${reason}`,
    };
  }

  return { ...base, tier, label: TIER_LABEL[tier], reason };
}

/**
 * Does this particular run need a human, given the tier and its auto-checks?
 *
 * `autoCheckPass === false` forces review at every tier. A run that fails a
 * deterministic check has been caught being wrong by something that cannot be
 * argued with, and no accuracy record earns the right to skip that.
 *
 * @param {object} tierInfo   from computeTier()
 * @param {boolean|null} autoCheckPass
 * @param {() => number} rng  injectable for tests — the Tier 2 sample is random
 */
export function needsReview(tierInfo, autoCheckPass = null, rng = Math.random) {
  if (autoCheckPass === false) {
    return { review: true, why: 'A deterministic auto-check failed. Auto-checks override trust.' };
  }
  if (tierInfo.tier === TIER.SUPERVISED) {
    return { review: true, why: tierInfo.permanent ? 'Permanently supervised task type.' : 'Supervised tier.' };
  }
  if (tierInfo.tier === TIER.AUTO_EDIT) {
    return { review: true, flagOnly: true, why: 'Auto-edit — written and flagged, surfaced for review.' };
  }
  if (rng() < TIER_2_SAMPLE_RATE) {
    return { review: true, sampled: true, why: `Auto-write, but caught by the ${pct(TIER_2_SAMPLE_RATE)} audit sample.` };
  }
  return { review: false, why: 'Auto-write, not sampled.' };
}

/** The async wrapper: pull the history for a task type, then compute. */
export async function getTier(taskType, promptVersion = null) {
  const history = await verdictHistory(taskType, promptVersion, 50);
  return computeTier(taskType, history);
}

function pct(n) { return `${Math.round(n * 100)}%`; }
