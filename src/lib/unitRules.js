/**
 * House rules for per-unit counts (Mike, 2026-09-24). Import-free so browser
 * screens, the public intake and the engine all share one copy.
 *
 *  - Bathrooms are never fractions: a 1.5-bath unit is 2 bathrooms. A half
 *    bath lacks a shower, which doesn't matter for lighting, it still has
 *    a vanity light.
 *  - A unit has 0 or 1 balcony, never more. Any positive figure on a unit
 *    type (including a balcony SF column misread as a count) means 1.
 */
export function wholeBaths(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : (n === 0 ? 0 : null);
}

export function balconiesPerUnit(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? 1 : (n === 0 ? 0 : null);
}

/** Per-unit normalizer by matrix column; other columns pass through. */
export function perUnitRule(field, v) {
  if (field === 'bathrooms') return wholeBaths(v);
  if (field === 'balconies') return balconiesPerUnit(v);
  return Number(v);
}

/**
 * Bathrooms when no drawing states them (Mike 2026-09-24): studio, 1BR and
 * 2BR = 1 bath (a 2BR may have 2, but with no other info we stay at 1);
 * 3BR and 4BR = 2 minimum. Bedrooms unknown → 1.
 */
export function bathsFromBedrooms(beds) {
  const n = Number(beds);
  return Number.isFinite(n) && n >= 3 ? 2 : 1;
}
