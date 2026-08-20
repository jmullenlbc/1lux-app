/**
 * The governance decision — where Steps 16, 17 and 18 meet.
 *
 * A feature that has just gotten an extraction back from a model calls this
 * ONCE and is told two things: may I write this, and does a human need to see
 * it. Everything else — running the deterministic checks, looking up what this
 * task type has earned, opening a queue row — happens in here.
 *
 * ── Why one call and not three ───────────────────────────────────────────────
 * The alternative is every feature running its own checks, computing its own
 * tier and deciding for itself. That is three chances to get the order wrong,
 * and the ordering is the whole safety property: **auto-checks are consulted
 * before trust, and they override it.** A caller that reads the tier first and
 * short-circuits on Tier 2 never runs the check that would have caught it.
 *
 * ── Failing safe, and what that costs ────────────────────────────────────────
 * If the store cannot record the run, a Tier 0 task returns `shouldWrite: false`.
 * That is the whole point of Tier 0 — nothing gets filed without a signature, and
 * a run that was never recorded can never be signed. It means a broken store
 * blocks supervised writes, which is a real cost, and it is the correct trade:
 * the alternative is writing AI output into project records with a review row
 * that does not exist, which looks identical to a reviewed write forever after.
 *
 * Tiers 1 and 2 have already earned the right to write, so a store failure there
 * degrades to "written but unrecorded" — logged loudly, not blocked.
 *
 * @see src/lib/agent/autoChecks.js   — Step 16
 * @see src/lib/agent/reviewStore.js  — Step 17's storage
 * @see src/lib/agentTrust.js         — Step 18
 * @see scripts/tests/agentReview.test.mjs
 */
import { runAutoChecks } from './autoChecks.js';
import { recordReviewableRun, STATUS } from './reviewStore.js';
import { computeTier, needsReview, TIER } from '../agentTrust.js';
import { verdictHistory } from './reviewStore.js';

/**
 * @param {object}   p
 * @param {string}   p.taskType       'vision.fixtureTagDetect' | 'review.contract' | ...
 * @param {object}   p.output         the parsed model output — stored for review
 * @param {string}   [p.promptVersion] bump this and the task type resets to Tier 0
 * @param {object}   [p.context]      data the deterministic checks reconcile against
 * @param {string}   [p.inputSummary] hash + descriptor from summariseInput(). NEVER the document.
 * @param {() => number} [p.rng]      injectable for tests — the Tier 2 audit sample
 *
 * @returns {{shouldWrite: boolean, needsReview: boolean, flagOnly: boolean,
 *           sampled: boolean, runId: string|null, tier: object, autoChecks: object,
 *           status: string, why: string, stored: boolean}}
 */
export async function submitAgentOutput({
  taskType,
  output,
  promptVersion = null,
  context = {},
  inputSummary = null,
  citations = null,
  confidence = null,
  feature = null,
  model = null,
  projectId = null,
  clientId = null,
  userId = null,
  sourceFileId = null,
  latencyMs = null,
  inputTokens = null,
  outputTokens = null,
  rng = Math.random,
}) {
  // Order matters and is the safety property: checks first, then trust.
  const autoChecks = await runAutoChecks(taskType, output, context);
  const history    = await verdictHistory(taskType, promptVersion, 50);
  const tier       = computeTier(taskType, history);
  const decision   = needsReview(tier, autoChecks.pass, rng);

  const status = decision.review ? STATUS.AWAITING_REVIEW : STATUS.AUTO_PASSED;

  const rec = await recordReviewableRun({
    taskType, feature, model, promptVersion,
    projectId, clientId, userId, sourceFileId,
    inputSummary, output, citations, confidence,
    latencyMs, inputTokens, outputTokens,
    autoChecks: autoChecks.checks,
    autoCheckPass: autoChecks.pass,
    reviewable: true,
    status,
  });

  // Tier 0 means nothing is filed without a signature. No row, no signature.
  const blockedByStore = !rec.stored && tier.tier === TIER.SUPERVISED;
  if (!rec.stored) {
    console.error(
      `[agent/review] "${taskType}" output could not be recorded for review` +
      (blockedByStore ? ' — WRITE BLOCKED (supervised tier).' : ' — writing anyway (earned tier), but unrecorded.')
    );
  }

  return {
    // Tier 0 holds the write until a human accepts it; Tiers 1 and 2 write now.
    shouldWrite: !blockedByStore && tier.tier > TIER.SUPERVISED,
    needsReview: !!decision.review,
    flagOnly:    !!decision.flagOnly,
    sampled:     !!decision.sampled,
    runId:       rec.stored ? rec.id : null,
    stored:      rec.stored,
    tier,
    autoChecks,
    status,
    why: blockedByStore
      ? 'Supervised tier and the review row could not be stored — refusing to write unsigned output.'
      : decision.why,
  };
}
