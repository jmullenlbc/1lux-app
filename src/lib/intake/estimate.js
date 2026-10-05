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
import { siteFeaturesFromRows } from '../siteFeatures.js';
import { parseLooseNumber } from '../numberInput.js';
import { controlsMathOf } from './controlsWords.js';

/** A stated, usable number — or null (Number(null) is 0, hence the dance). */
function num(v) {
  const n = parseLooseNumber(v);            // "226,000" typed on the public page
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
export function computeIntakeEstimate({ answers, drawings, pricing = null, adopted = null }) {
  const gate = intakeEstimateGate(answers, drawings);
  if (!gate.ready) return { budget: null, projectData: null, quantities: [] };

  // Drawings → quantities (null stays null: "the drawing did not say"). A
  // typed-in budget passes no drawings; its blanks get the stand-in guesses.
  const rows = computeQuantities(gate.hasDrawings ? drawings : null, answers || null, pricing, adopted);
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
  // Drive-lane area lights (townhouse / single-family) ride the engine's
  // surface-parking line through the same kind of seam. A known drive length
  // goes in as feet so the reviewed budget keeps the ÷ 81 ft rule live.
  if (num(q.driveLengthFt) > 0) {
    sections.exterior = { ...(sections.exterior || {}), driveLaneFt: num(q.driveLengthFt) };
  } else if (num(q.driveLaneLights) > 0) {
    sections.exterior = { ...(sections.exterior || {}), driveLaneLightsQty: num(q.driveLaneLights) };
  }
  // Homes: a walkway length read off the site plan prices the bollards /
  // pedestrian poles at one per 40 ft (Mike 2026-10-02). Never asked.
  if (num(q.walkwayLengthFt) > 0) {
    sections.exterior = { ...(sections.exterior || {}), walkwayLengthFt: num(q.walkwayLengthFt) };
  }

  const projectData = {
    grossSf:             num(q.grossSf),
    unitsSf:             num(q.unitsSf),
    numUnits:            num(q.totalUnits),
    numBalconies:        num(q.balconies),
    numVanities:         num(q.vanities),
    numBathrooms:        num(q.bathrooms),
    // Ceiling fans are counted PER BEDROOM by the takeoff (Mike 2026-09-16:
    // "a 3 bedroom unit with master bedroom and living room chosen should be
    // 2 fans; a studio with that same option should only be 1 fan"). Without
    // this seam the engine fell back to units × a room multiplier, which gives
    // every studio a master-bedroom fan. null (mix not found) keeps the
    // engine's multiplier as the last resort.
    numFans:             num(q.ceilingFans),
    corridorSf:          num(q.corridorSf),
    interiorAmenitySf:   num(q.interiorAmenitySf),
    exteriorAmenitySf:   num(q.exteriorAmenitySf),
    garageSf:            num(q.garageSf),
    bohSf:               num(q.bohSf),
    // The engine field is named numEgressStairwells but HOLDS LANDINGS — the
    // internal wizard labels it "Stairwell Landings" and prices $200 per
    // landing. The takeoff's stairLandings row (stairs × (2×stories−1)) is
    // the matching figure; the raw shaft count would underprice 5-9×.
    numEgressStairwells: num(q.stairLandings),
    // Residential building count (stated → counted off the site plan →
    // typed). The engine's wallpack model scales on it; the takeoff already
    // multiplied the per-building stair count by it.
    numBuildings:        num(q.buildings),
    numSurfaceParking:   num(q.surfaceParking),
    numCarports:         num(q.carports),
    numGarages:          num(q.garages),
    lotSf:               num(q.lotSf),
    buildingFootprintSf: num(q.buildingFootprintSf),
    buildingTypeKey:     buildingTypeKey || undefined,
    // Sporadic site features (Mike 2026-09-16) — the same seam the internal
    // wizard feeds from the project's SiteFeature rows. Built from the
    // takeoff rows (drawing-read or typed); empty when none were found.
    siteFeatures:        siteFeaturesFromRows(q),
    // Sales tax is unknown at intake; the reviewed budget adds it later.
  };

  const budget = calculateBudget(projectData, sections, pricing);

  // The wizard's "we couldn't find these" card keys off where each figure
  // came from: null = ask for it, 'derived' = show our estimate and offer an
  // override, 'drawing'/'questionnaire' = settled. Values + provenance only —
  // no pricing.
  // `corrected`/`wasValue` ride along so the grid can show "you changed this,
  // we had read 200" next to the figure. They are display provenance, not
  // pricing: the money already moved, because `q` above is built from these
  // same rows. Listed explicitly like every other field — this projection is
  // what keeps the pricing model from leaking into a public browser, so it
  // stays a named list rather than a spread.
  const quantities = rows.map(r => ({
    key: r.key, label: r.label, unit: r.unit,
    value: r.value, source: r.source, how: r.how, flag: r.flag,
    corrected: r.corrected ?? false, wasValue: r.wasValue ?? null,
    assumed: r.assumed === true,
  }));

  // `sections` is for the staff hand-off (src/lib/intake/handoff.js) only — the
  // public projection below names its fields and never passes it on.
  return { budget, projectData, sections, quantities, range: typedInRange(budget, gate.hasDrawings) };
}

// ─────────────────────────────────────────────────────────────────────────────
// The PUBLIC projection — dollars and the visitor's own quantities, no formulas
// ─────────────────────────────────────────────────────────────────────────────
//
// Mike, 2026-09-16: "We don't want to give away to the world all the math we
// are doing… Someone could steal all the math." The engine's budget object is
// generous on purpose — every line carries its count, its per-fixture price,
// its multiplier, and every site feature says "1 pole per 30 ft". That is what
// the INTERNAL screens are for. The public page gets what a visitor needs to
// read their own budget: a label, their own count or length, and the dollars.
//
// Everything below is an ALLOW list. A new field on the engine's return does
// not reach a public browser until somebody names it here, and
// scripts/tests/intakePublicMath.test.mjs fails the build if a rate-shaped key
// ever shows up anyway.

/** Top-level budget figures the public sidebar, review step and PDF print. */
const PUBLIC_BUDGET_KEYS = [
  'freight', 'warehousing', // dollars only — the rates behind them stay internal (Mike 9-17)
  'lightingProductSubtotal', 'subtotalLightingOnly',
  'controls', 'controlsFreight', 'controlsWarehousing', 'controlsTotal',
  'totalWithControls', 'perSf', 'perUnit',
  'energyCreditPct', 'energyCreditLighting', 'energyCreditControls',
  'contingencyRate', 'contingencyAmount', 'totalWithContingency',
  'salesTaxPct', 'lightingTaxAmount', 'controlsTaxAmount',
];

/** Inside `sections`, these leaves survive; every object is walked for them. */
const PUBLIC_LINE_KEYS = new Set(['product', 'manualAdder', 'suppressedByManual']);

function publicLines(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (PUBLIC_LINE_KEYS.has(k)) {
      if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    } else if (k === 'siteFeatures') {
      // The visitor's own finding (2 courts, a 90 ft courtyard) and its dollars.
      // Not the fixture count, the fixture kind, the price each or the rule.
      out.siteFeatures = {
        product: Number(v?.product) || 0,
        items: (Array.isArray(v?.items) ? v.items : []).map(i => ({
          type: i.type, label: i.label,
          count: i.count ?? null, lengthFt: i.lengthFt ?? null,
          product: Number(i.product) || 0,
          approx: approxWords(i.fixtures, i.fixtureKind === 'areaLight' ? 'area lights' : 'poles'),
        })),
      };
    } else if (k === 'parking' && v && typeof v === 'object') {
      // The dollars plus "approx. 47 area lights" — not how the 47 was reached.
      out.parking = { product: Number(v.product) || 0, approx: approxWords(v.fixtures, 'area lights') };
    } else if (k === 'wallpacks' && v && typeof v === 'object') {
      out.wallpacks = { product: Number(v.product) || 0, approx: approxWords(v.qty, 'wallpacks') };
    } else if (k === 'breezeway' && v && typeof v === 'object') {
      // A quantity and a description of the building, both the visitor's own.
      out.breezeway = { landings: v.landings ?? null, style: v.style ?? null };
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const child = publicLines(v);
      if (child && Object.keys(child).length) out[k] = child;
    }
  }
  return out;
}

/**
 * "Approx. 47 area lights" — a rounded count in plain words, never the price
 * each and never the rule that produced it (Mike 2026-09-18: "Counts and
 * dollars makes it real and doesn't tell people our backend secret logic").
 * Anything under ten is printed as-is; larger counts round to the nearest 5.
 */
export function approxWords(count, noun) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0 || !noun) return null;
  const rounded = n < 10 ? Math.round(n) : Math.round(n / 5) * 5;
  return `approx. ${rounded.toLocaleString()} ${noun}`;
}

/** "What this answer costs" — the dollars and a rounded count, never count × price-each. */
function publicQuestionCosts(costs) {
  const out = {};
  for (const [key, c] of Object.entries(costs || {})) {
    out[key] = {
      product: Number(c?.product) || 0,
      labor:   Number(c?.labor) || 0,
      lines: (c?.lines || []).map(l => ({
        label: l.label, product: Number(l.product) || 0, labor: Number(l.labor) || 0,
        approx: approxWords(l.count, l.countLabel),
      })),
    };
  }
  return out;
}

export function publicBudget(budget) {
  if (!budget) return null;
  const out = { sections: publicLines(budget.sections) || {} };
  for (const k of PUBLIC_BUDGET_KEYS) if (budget[k] !== undefined) out[k] = budget[k];
  out.questionCosts = publicQuestionCosts(budget.questionCosts);
  out.controlsMath = controlsMathOf(budget);
  return out;
}

/**
 * Does this sentence explain HOW a number was worked out? Deliberately broad:
 * a false hit costs the visitor one plain sentence; a miss publishes a rule.
 */
export const MATH_RE = /[×÷=$]|\d\s*%|\bper\b|\bratio\b|\bfactor\b|\bmultipl|\bshare\b|\bcapp?ed\b|\bcap\b|\bremainder\b|\bscaled\b|\btypical\b|\baverage\b/i;

const HOW_DERIVED  = 'Our estimate, worked out from the other figures on this project. Type over it if you know the real number.';
const HOW_DRAWINGS = 'Worked out from figures printed on the drawings.';
const FLAG_DERIVED = 'Please confirm this figure — it was estimated rather than read off a sheet.';
const FLAG_OTHER   = 'Please confirm this figure.';

/** One takeoff row with the working-out taken off it. Value and source stay. */
export function publicQuantity(r) {
  let how = r.how ?? null;
  let flag = r.flag ?? null;
  if (r.corrected) {
    // "Corrected by you to 210. We read 200 — 1.4 balconies per unit…": the
    // tail is the old working-out. `wasValue` already carries the 200.
    how = r.wasValue != null ? 'Corrected by you.' : 'Entered by you.';
  } else if (r.source === 'derived') {
    how = HOW_DERIVED;
  } else if (how && MATH_RE.test(how)) {
    how = HOW_DRAWINGS;
  }
  if (flag && MATH_RE.test(flag)) flag = r.source === 'derived' ? FLAG_DERIVED : FLAG_OTHER;
  return {
    key: r.key, label: r.label, unit: r.unit,
    value: r.value, source: r.source, how, flag,
    corrected: r.corrected ?? false, wasValue: r.wasValue ?? null,
    assumed: r.assumed === true,
  };
}

/**
 * What /api/intake/estimate sends to a public browser. Same math, same totals
 * as computeIntakeEstimate — staff, the PDF and the hand-off keep using that
 * one — with the formulas taken out.
 */
export function publicIntakeEstimate(args) {
  const full = computeIntakeEstimate(args);
  return {
    budget: publicBudget(full.budget),
    projectData: full.projectData,
    quantities: (full.quantities || []).map(publicQuantity),
    ...(full.range !== undefined ? { range: full.range } : {}),
  };
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
