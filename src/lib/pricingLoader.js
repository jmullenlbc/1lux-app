/**
 * pricingLoader.js
 * Loads pricing config from the database (SystemConfig table).
 * Falls back to the static pricing.js if no DB record exists yet.
 * Server-side only (uses Prisma).
 */
import { prisma } from './db';
import { PRICING as STATIC_PRICING } from './pricing';
import { fillPricingDefaults } from './calculations';

const CONFIG_KEY = 'pricing';

/**
 * Returns the active pricing config object.
 * Always server-side — do not import in client components.
 */
export async function loadPricing() {
  try {
    const record = await prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEY },
    });
    if (record) {
      // Merge with static so keys added to pricing.js after the DB record was saved
      // (e.g. designExitSigns, designCorridors) are always present.
      return deepMerge(STATIC_PRICING, JSON.parse(record.value));
    }
  } catch {
    // DB not available or parse error — fall through to static
  }
  return STATIC_PRICING;
}

/**
 * The pricing a project actually runs on: its frozen snapshot, with any line
 * added to the sheet AFTER the snapshot was taken filled in from the master
 * defaults (the engine applies the same rule inside calculateBudget). No
 * snapshot, or an unreadable one, → the fallback (usually loadPricing()).
 * Every page and route that used to JSON.parse(project.pricingSnapshot) goes
 * through here so the client-side mirrors see the same numbers as the engine.
 */
export function pricingForProject(snapshotJson, fallback) {
  if (!snapshotJson) return fallback;
  try {
    const parsed = typeof snapshotJson === 'string' ? JSON.parse(snapshotJson) : snapshotJson;
    if (!parsed || typeof parsed !== 'object') return fallback;
    return fillPricingDefaults(STATIC_PRICING, parsed);
  } catch {
    return fallback;
  }
}

/**
 * Saves a new pricing config to the database.
 * Merges with static defaults to ensure all keys are present.
 */
export async function savePricing(newPricing, userId) {
  const merged = deepMerge(STATIC_PRICING, newPricing);
  await prisma.systemConfig.upsert({
    where:  { key: CONFIG_KEY },
    update: { value: JSON.stringify(merged), updatedById: userId },
    create: { key: CONFIG_KEY, value: JSON.stringify(merged), updatedById: userId },
  });
  return merged;
}

/** Deep merge: target keys win over source */
function deepMerge(source, target) {
  const out = { ...source };
  for (const [k, v] of Object.entries(target)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof source[k] === 'object') {
      out[k] = deepMerge(source[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}
