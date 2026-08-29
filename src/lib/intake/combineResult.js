/**
 * Which read wins, and what the answer looks like.
 *
 * A drawing set is read two ways. The TEXT read pulls a unit matrix off the
 * text layer -- exact, cheap, and the right answer whenever there is a matrix
 * to find. The VISION read looks at the rendered site plan and reads the
 * summary block -- lot acres, unit count, parking counts -- which is what a
 * vector site plan carries instead of a matrix. Neither is a fallback for the
 * other in general; each is right about different sheets.
 *
 * ── Why this is its own file ─────────────────────────────────────────────────
 * The read used to be one request, so this precedence lived in the middle of
 * the route and nothing else needed it. Now the read is four requests and the
 * BROWSER drives them, which means the browser is the thing holding both
 * answers when the last one lands.
 *
 * The obvious move -- let the page decide -- would put this rule in two places
 * at once, because the all-in-one path still exists for local dev and small
 * files. Two copies of a precedence rule drift, and the drift would show up as
 * "the live site and my laptop disagree about the same PDF", which is a
 * genuinely horrible thing to debug.
 *
 * So it lives here: no imports, no Node, no React. The route imports it and so
 * does the drop zone, and there is exactly one answer to "which read won".
 *
 * @see src/app/api/intake/parse/route.js
 * @see src/components/intake/DrawingDropzone.jsx
 */

/**
 * A vision read always comes back with confidence and notes attached, so their
 * presence proves nothing. "Found something" means an actual site NUMBER.
 */
export const SITE_NUMBER_KEYS = [
  'lotAcres', 'lotSf', 'totalUnits', 'parkingProvided', 'parkingRequired',
  'surfaceParking', 'garages', 'carports', 'buildingCount', 'clubhouseSf', 'amenitySf',
  'grossSf',
];

/** True when a vision read actually found a site number worth keeping. */
export function siteHasNumbers(siteData) {
  return !!siteData && SITE_NUMBER_KEYS.some(k => siteData[k] != null);
}

/** True when the text read found a real unit matrix. */
export function matrixHasTypes(matrix) {
  return (matrix?.unitTypes?.length ?? 0) > 0;
}

/**
 * Does the vision read need to run at all?
 *
 * Vision is materially more expensive per call than the text read, so it is
 * asked for, not run by default. Two cases need it:
 *
 *   - the PDF has no text layer at all (a scanned set) -- there is nothing for
 *     the text read to work with, so vision is the only way in;
 *   - the text read came back with no unit types -- the vector-site-plan case,
 *     where the sheet is full of text but none of it is a matrix.
 *
 * On a sheet whose matrix parses cleanly this returns false and the second
 * model call never happens, which is the whole point.
 */
export function needsSiteRead({ hasText, matrix }) {
  if (!hasText) return true;
  return !matrixHasTypes(matrix);
}

/**
 * Assemble the one answer the page shows, from whichever reads ran.
 *
 * Returns the same shape the single-request route always returned, so nothing
 * downstream of the drop zone had to learn about stages.
 *
 * @param {object}  a
 * @param {string}  a.fileName
 * @param {?number} a.totalPages
 * @param {?Array}  a.sheetsRead   page numbers actually opened
 * @param {?Array}  a.keptSheets   stored copies of those pages, for a reviewer
 * @param {?object} a.matrix       the text read's proposal, if it ran
 * @param {?object} a.siteData     the vision read's data, if it ran
 * @returns {object} the proposal
 */
export function combineIntakeResult({ fileName, totalPages = null, sheetsRead = null, keptSheets = null, matrix = null, siteData = null }) {
  const common = { fileName, sheetsRead, keptSheets, totalPages };

  // Vision wins only when the text read has nothing to offer AND vision found
  // a real number. Checked in this order because a matrix with rows is the
  // better answer even when vision also succeeded.
  if (!matrixHasTypes(matrix) && siteHasNumbers(siteData)) {
    return {
      kind: 'site_data',
      source: 'vision',
      siteData,
      unitTypes: [],      // vision reads summary blocks, not per-type matrices
      ...common,
    };
  }

  // Nothing found either way. Say so as a result rather than an error: the
  // visitor uploaded a real drawing, we just could not pull numbers off it,
  // and the questionnaire behind this still works by hand.
  if (!matrix) {
    return { kind: 'nothing_found', unitTypes: [], siteData: siteData ?? null, ...common };
  }

  return { ...matrix, ...common };
}
