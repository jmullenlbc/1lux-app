/**
 * The public conceptual estimate — answers (+ drawings) in, budget out.
 *
 * SERVER-ONLY. Pulled out of /api/intake/estimate (2026-09-12) so the live
 * estimate and the downloadable PDF run the exact same math from the same
 * inputs: the PDF route recomputes from the visitor's answers rather than
 * trusting any number the browser sends. Never import this from a client
 * component — it reaches the pricing model through calculations.js and the
 * no-drawings guesses through quantities.js.
 *
 * Pure: pricing is passed in (loadPricing() touches the database), so the
 * unit tests can run it with the engine's static default.
 *
 * @see src/app/api/intake/estimate/route.js — the live sidebar number
 * @see src/app/api/intake/pdf/route.js      — the PDF download
 */
import { answersToEngine, NO_DRAWINGS_KEY, noDrawingsReady } from './questionnaire.js';
import { computeQuantities, answersToMap } from './quantities.js';
import { calculateBudget } from '../calculations.js';

/** A stated, usable number — or null (Number(null) is 0, hence the dance). */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * May these inputs be priced at all?
 *
 * Drawings are the ticket in (Mike, 2026-09-04): a visitor gets a live
 * number only after uploading drawings. Typed figures refine that estimate;
 * they never start one. Enforced on the server, not just in the wizard UI, so
 * the bare endpoint can't be used as a free pricing calculator.
 *
 * The one other way in (Mike, 2026-09-11): the visitor answered "no
 * drawings" and typed the minimum no guess can replace — project type,
 * total units, and total building SF or an average unit size. Any drawings
 * sent alongside a "no drawings" answer are ignored.
 *
 * @returns {{ ready: boolean, hasDrawings: boolean }}
 */
export function intakeEstimateGate(answers, drawings) {
  const map = answersToMap(answers);
  const typedIn = map[NO_DRAWINGS_KEY] === 'yes';
  const hasDrawings = !typedIn && !!drawings && typeof drawings === 'object';
  return { ready: hasDrawings || (typedIn && noDrawingsReady(map).ready), hasDrawings };
}

/**
 * Price a public submission.
 *
 * @returns {{ budget, projectData, quantities }} — budget/projectData null
 *   (and quantities empty) when the gate above says no.
 */
export function computeIntakeEstimate({ answers, drawings, pricing = null }) {
  const gate = intakeEstimateGate(answers, drawings);
  if (!gate.ready) return { budget: null, projectData: null, quantities: [] };

  // Drawings → quantities (null stays null: "the drawing did not say"). A
  // typed-in budget passes no drawings; its blanks get the stand-in guesses.
  const rows = computeQuantities(gate.hasDrawings ? drawings : null, answers || null, pricing);
  const q = {};
  for (const r of rows) if (r && r.key) q[r.key] = r.value;

  const { sections, buildingTypeKey } = answersToEngine(answers);

  // A known exit-door count (drawing-stated, counted, or visitor-typed) is a
  // better wallpack quantity than the engine's per-building fallback model —
  // wallpacks are the one door fixture, one per egress door. Passed as the
  // engine's own quantity-override seam, so the reviewed budget behaves the
  // same way when it inherits these sections.
  if (num(q.exitDoors) != null) {
    sections.exterior = { ...(sections.exterior || {}), wallpacksQty: num(q.exitDoors) };
  }
  // Drive-lane area lights (typed-in townhouse budgets only) ride the engine's
  // surface-parking line through the same kind of seam.
  if (num(q.driveLaneLights) > 0) {
    sections.exterior = { ...(sections.exterior || {}), driveLaneLightsQty: num(q.driveLaneLights) };
  }

  const projectData = {
    grossSf:             num(q.grossSf),
    unitsSf:             num(q.unitsSf),
    numUnits:            num(q.totalUnits),
    numBalconies:        num(q.balconies),
    numVanities:         num(q.vanities),
    numBathrooms:        num(q.bathrooms),
    corridorSf:          num(q.corridorSf),
    interiorAmenitySf:   num(q.interiorAmenitySf),
    exteriorAmenitySf:   num(q.exteriorAmenitySf),
    garageSf:            num(q.garageSf),
    bohSf:               num(q.bohSf),
    // The engine field is named numEgressStairwells but HOLDS LANDINGS — the
    // internal wizard labels it "Stairwell Landings" and prices $175 per
    // landing. The takeoff's stairLandings row (stairs × (2×stories−1)) is
    // the matching figure; the raw shaft count would underprice 5-9×.
    numEgressStairwells: num(q.stairLandings),
    numSurfaceParking:   num(q.surfaceParking),
    numCarports:         num(q.carports),
    numGarages:          num(q.garages),
    lotSf:               num(q.lotSf),
    buildingFootprintSf: num(q.buildingFootprintSf),
    buildingTypeKey:     buildingTypeKey || undefined,
    // Sales tax is unknown at intake; the reviewed budget adds it later.
  };

  const budget = calculateBudget(projectData, sections, pricing);

  // The wizard's "we couldn't find these" card keys off where each figure
  // came from: null = ask for it, 'derived' = show our estimate and offer an
  // override, 'drawing'/'questionnaire' = settled. Values + provenance only —
  // no pricing.
  const quantities = rows.map(r => ({
    key: r.key, label: r.label, unit: r.unit,
    value: r.value, source: r.source, how: r.how, flag: r.flag,
  }));

  return { budget, projectData, quantities, range: typedInRange(budget, gate.hasDrawings) };
}

/**
 * The "likely between" band on a typed-in budget (Mike, 2026-09-12: "we have
 * to get all these percentages within 10% in the conceptual budget"). Ten real
 * ILC budgets land within about ±10% of this estimate, so the band is ±10%,
 * rounded out to the nearest $1,000. Drawing-read budgets get no band — they
 * haven't been measured the same way.
 *
 * @returns {{ low: number, high: number, pct: number } | null}
 */
export const TYPED_IN_RANGE_PCT = 0.10;
function typedInRange(budget, hasDrawings) {
  const total = Number(budget?.totalWithControls);
  if (hasDrawings || !Number.isFinite(total) || total <= 0) return null;
  return {
    low:  Math.floor((total * (1 - TYPED_IN_RANGE_PCT)) / 1000) * 1000,
    high: Math.ceil((total * (1 + TYPED_IN_RANGE_PCT)) / 1000) * 1000,
    pct:  TYPED_IN_RANGE_PCT,
  };
}
