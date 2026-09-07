/**
 * Where the "mass email" number comes from.
 *
 * Mike set it at 25 and asked for it to be changeable (2026-09-07: "make it
 * changeable but set to 25. no one will probably change it."). So the number
 * lives in a rule row he can edit on Sales Automation → Rules → Exclusions,
 * and the hardcoded 25 in classify.js is only the fallback for when no rule
 * exists.
 *
 * Kept out of classify.js on purpose: that file stays pure and testable with no
 * database in it. This is the one small piece that talks to the rules table.
 */
// Relative with the .js on the end on purpose: the regression suite runs these
// files through plain Node, which does not understand the "@/" alias.
import { MASS_EMAIL_MIN_PEOPLE, normalizeMinPeople } from './classify.js';

// The rules screen writes { "minRecipients": 25 } into ActivityExclusionRule.config.
const RULE_TYPE = 'MIN_RECIPIENTS';

// Read once every few minutes rather than on every message of a sync run. Short
// enough that Mike changing the number takes effect while he is still looking
// at the screen.
const TTL_MS = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;

/** Forget the cached number — call after the rule is edited. */
export function invalidateMassEmailThreshold() {
  cached = null;
  cachedAt = 0;
}

/**
 * The current mass-email threshold. Falls back to 25 whenever there is no
 * active rule, the rule's config is unreadable, or the database is unhappy —
 * this must never be the reason an email sync fails.
 */
export async function getMassEmailThreshold(prisma) {
  if (cached !== null && Date.now() - cachedAt < TTL_MS) return cached;

  let value = MASS_EMAIL_MIN_PEOPLE;
  try {
    const rule = await prisma.activityExclusionRule.findFirst({
      where:   { ruleType: RULE_TYPE, isActive: true },
      orderBy: { createdAt: 'desc' },   // newest active rule wins
      select:  { config: true },
    });
    if (rule?.config) {
      const parsed = JSON.parse(rule.config);
      value = normalizeMinPeople(parsed?.minRecipients);
    }
  } catch (err) {
    console.warn('[email/settings] falling back to the default threshold:', err?.message ?? err);
    value = MASS_EMAIL_MIN_PEOPLE;
  }

  cached = value;
  cachedAt = Date.now();
  return value;
}
