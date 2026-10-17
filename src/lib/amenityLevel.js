/**
 * One meaning for the exterior amenity level, wherever it is read.
 *
 * The public questionnaire stores the visitor's answer as a BARE DOLLAR
 * FIGURE, '1', '2', '3', '5', because the question asks "what $/SF ... based
 * on the level of finish" and shows the choices as $1/SF … $5/SF. The internal
 * wizard, the project summary, the share page and the calibration report were
 * all written against the master sheet's WORD keys, low / lowMedium / medium
 * / high. Nothing translated between them, so:
 *
 *   - a public answer of $1/SF read as `medium` inside the app and priced at
 *     $3/SF, a real money error, tripling that line on the cheapest finish;
 *   - the summary and share pages printed a bare "1" where the label belongs.
 *
 * Both directions are needed and both must keep working on already-stored
 * submissions, which are recomputed on view: word answers are still stored on
 * every internally-created budget, numeric ones on every public one.
 *
 * The numbers are the master sheet's DEFAULT rates, and they are only used to
 * recognise a stored answer, never to price. Pricing always reads the live
 * rate out of PRICING/the project's snapshot by the word key, so an edited
 * master sheet still governs.
 *
 * @see src/lib/pricing.js, exteriorAmenities rates and labels (the word keys)
 * @see src/lib/intake/questionnaire.js, exteriorAmenityFinish (the numbers)
 */

/** Word key → the master sheet's default $/SF. Order is the ladder low→high. */
export const AMENITY_LEVEL_RATES = Object.freeze({
  low: 1,
  lowMedium: 2,
  medium: 3,
  high: 5,
});

/** The word keys, cheapest first. */
export const AMENITY_LEVELS = Object.freeze(Object.keys(AMENITY_LEVEL_RATES));

/**
 * Any stored amenity-level answer → a word key the rest of the app understands.
 *
 * Accepts a word key ('medium'), a bare number or numeric string from the
 * public questionnaire ('1', 3, '$5/SF'), and anything unrecognised. An
 * unrecognised answer returns the fallback rather than guessing, the callers
 * all defaulted to 'medium' before this existed, so that stays the default.
 *
 * A number that is not one of the four rates snaps to the NEAREST rate, so a
 * master sheet edited to $4/SF (or a hand-entered 4) still lands on a real
 * level instead of silently becoming medium.
 *
 * @param {string|number|null|undefined} value
 * @param {string} fallback - word key to use when nothing can be read
 * @returns {string} one of low | lowMedium | medium | high
 */
export function normalizeAmenityLevel(value, fallback = 'medium') {
  if (value == null) return fallback;

  const raw = String(value).trim();
  if (!raw) return fallback;

  if (Object.prototype.hasOwnProperty.call(AMENITY_LEVEL_RATES, raw)) return raw;

  // '$3/SF' and '3' both read as 3.
  const n = parseFloat(raw.replace(/[$,]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return fallback;

  let best = fallback, bestGap = Infinity;
  for (const [key, rate] of Object.entries(AMENITY_LEVEL_RATES)) {
    const gap = Math.abs(rate - n);
    if (gap < bestGap) { best = key; bestGap = gap; }
  }
  return best;
}

/**
 * The live $/SF for a stored answer, read out of the given pricing block.
 *
 * Takes `pricing.exteriorAmenities` (the project's frozen snapshot or the live
 * master sheet), so an edited rate governs. Falls back to the default rate for
 * the level when the block is missing that key.
 *
 * @param {object|null|undefined} exteriorAmenities - PRICING.exteriorAmenities
 * @param {string|number|null|undefined} value - the stored answer
 * @returns {number} dollars per square foot
 */
export function amenityRate(exteriorAmenities, value) {
  const key = normalizeAmenityLevel(value);
  const fromSheet = Number(exteriorAmenities?.[key]);
  if (Number.isFinite(fromSheet) && fromSheet > 0) return fromSheet;
  return AMENITY_LEVEL_RATES[key] ?? AMENITY_LEVEL_RATES.medium;
}
