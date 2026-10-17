/**
 * Interior amenity $/SF choices, grouped into three finish tiers.
 *
 * Mike 2026-09-11: "every dollar amount from four until 16 ... $4 through $8 a
 * square foot ... lower finish tier then 8 through 12 is a medium finish tier
 * and then 12 through 16 is a high finish tier."
 *
 * Each dollar amount belongs to exactly one tier. Mike picked the split on
 * 2026-09-11: $4 to $8 low, $9 to $12 medium, $13 to $16 high. The tier edges live here and nowhere
 * else, the internal wizard and the public conceptual budget both read them.
 *
 * Pure data: no pricing numbers that matter to DN, safe for the browser.
 * The legacy named levels (low/medium/high in PRICING.interiorAmenities) are
 * untouched, older projects store those words and still price off them.
 */

export const INTERIOR_AMENITY_TIERS = [
  { key: 'low',    label: 'Lower finish',  min: 4,  max: 8,  note: 'Garden walk-up, minimal amenity package' },
  { key: 'medium', label: 'Medium finish', min: 9,  max: 12, note: 'Standard to upper mid-market multifamily' },
  { key: 'high',   label: 'High finish',   min: 13, max: 16, note: 'High-end mid-rise or high-rise, luxury finishes' },
];

/** Every whole-dollar rate offered, low to high: 4, 5, … 16. */
export const INTERIOR_AMENITY_RATES = INTERIOR_AMENITY_TIERS
  .flatMap(t => Array.from({ length: t.max - t.min + 1 }, (_, i) => t.min + i));

/** The tier a $/SF rate falls in, or null when it is outside $4 to $16. */
export function interiorAmenityTier(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return null;
  return INTERIOR_AMENITY_TIERS.find(t => n >= t.min && n <= t.max) ?? null;
}

/** The rates in one tier, as numbers. */
export function ratesInTier(tier) {
  return INTERIOR_AMENITY_RATES.filter(r => r >= tier.min && r <= tier.max);
}
