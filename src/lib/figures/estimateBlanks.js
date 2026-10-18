// Blank = "we estimate it" on the internal wizards (Mike 10-17: the design
// wizard follows the same three rules as the public no-drawings tool).
//  1. A blank figure gets the public tool's estimate; a typed 0 stays 0.
//  2. No estimates (and no total) until the minimum figures are in.
//  3. Estimates are saved and tagged 'guess' so the screen can say "Estimated".
// Pure: no prisma, safe in the browser. The data route does the saving.
import { computeQuantities } from '../intake/quantities.js';
import { INTAKE_QUESTIONS, NO_DRAWINGS_KEY } from '../intake/questionnaire.js';
import { ROW_FIELD } from '../calibration/figureNorms.js';

// Only conceptual-style budgets estimate; peer reviews and change orders price
// exactly what was typed.
export const ESTIMATING_BUDGET_TYPES = new Set(['conceptual', 'design']);

// The fields an estimate may fill. Stories, units and surface stalls are
// required, landings follow the stairwell count in the data route, and fans
// already default from the Units step's per-unit pick.
export const ESTIMATED_FIELDS = [
  'grossSf', 'unitsSf', 'corridorSf', 'bohSf', 'interiorAmenitySf',
  'exteriorAmenitySf', 'garageSf', 'numVanities', 'numBalconies', 'numGarages',
];

// ProjectData field → the public tool's typed-figure answer key.
const FIGURE_OF = {
  grossSf: 'figureGrossSf', numUnits: 'figureTotalUnits', numFloors: 'figureStories',
  interiorAmenitySf: 'figureInteriorAmenitySf', corridorSf: 'figureCorridorSf',
  garageSf: 'figureGarageSf', exteriorAmenitySf: 'figureExteriorAmenitySf',
  bohSf: 'figureBohSf', numBuildings: 'figureBuildings', numBalconies: 'figureBalconies',
  numExteriorDoors: 'figureExitDoors', numSurfaceParking: 'figureSurfaceParking',
  numGarages: 'figureGarages', numCarports: 'figureCarports', numStairwells: 'figureStairwells',
};

const typed = (pd, f, guessed) => {
  if (guessed?.has(f)) return null;
  const v = pd?.[f];
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function typeLabelFor(typeKey) {
  const q = INTAKE_QUESTIONS.find(x => x.key === 'projectType');
  return q?.options.find(o => q.engine?.map?.[o] === typeKey) ?? null;
}

/**
 * The minimum figures still missing, in plain words ([] = ready).
 * Example: units typed, nothing else → ['Total building SF or unit SF', 'Stories', 'Surface parking stalls (0 if none)'].
 */
export function figuresStillNeeded(pd, buildingTypeKey, guessed = null) {
  const missing = [];
  if (!typeLabelFor(buildingTypeKey)) missing.push('Building type');
  if (!(typed(pd, 'numUnits', guessed) > 0)) missing.push('Total units');
  if (!(typed(pd, 'grossSf', guessed) > 0) && !(typed(pd, 'unitsSf', guessed) > 0)) missing.push('Total building SF or unit SF');
  if (!(typed(pd, 'numFloors', guessed) > 0)) missing.push('Stories');
  if (typed(pd, 'numSurfaceParking', guessed) == null) missing.push('Surface parking stalls (0 if none)');
  return missing;
}

/**
 * Estimates for the blank (or earlier-estimated) fields of `pd`.
 * `guessed` = fields whose current value is an earlier estimate (source 'guess').
 * Returns { values: { field: number }, how: { field: text } }; empty when the
 * minimum figures are missing.
 */
export function estimateBlankFigures(pd, buildingTypeKey, { guessed = null, adopted = null, pricing = null } = {}) {
  const out = { values: {}, how: {} };
  if (figuresStillNeeded(pd, buildingTypeKey, guessed).length) return out;
  const answers = { [NO_DRAWINGS_KEY]: 'yes', projectType: typeLabelFor(buildingTypeKey) };
  for (const [f, key] of Object.entries(FIGURE_OF)) {
    const v = typed(pd, f, guessed);
    if (v != null) answers[key] = String(Math.round(v));
  }
  const units = typed(pd, 'numUnits', guessed);
  const unitsSf = typed(pd, 'unitsSf', guessed);
  if (units > 0 && unitsSf > 0) answers.figureAvgUnitSf = String(Math.round(unitsSf / units));

  const rows = computeQuantities(null, answers, pricing, adopted);
  const allowed = new Set(ESTIMATED_FIELDS);
  for (const r of rows) {
    const field = ROW_FIELD[r.key];
    if (!field || !allowed.has(field) || r.source !== 'derived' || r.value == null) continue;
    if (typed(pd, field, guessed) != null) continue;
    // Vanities fall back to the typed bath count in the engine; keep that.
    if (field === 'numVanities' && typed(pd, 'numBathrooms', guessed) != null) continue;
    out.values[field] = Math.round(Number(r.value));
    out.how[field] = r.how || '';
  }
  return out;
}
