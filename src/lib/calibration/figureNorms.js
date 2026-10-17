/**
 * What our real jobs say every budget figure runs, by building type, and an
 * on-screen alert when a figure is far off it (Mike, 2026-09-24: "build that
 * intelligence into everything with budgeting as alert notifications at a
 * line level … only learn from non made up info").
 *
 * Which numbers are real (ProjectFigureSource.source):
 *   drawing, staff, fixtures, import, always learned from.
 *   client, typed by a visitor on the public form; learned from only when
 *             it sits inside the normal range ("they don't want to make stuff
 *             up either").
 *   guess, a stand-in the tool made up; never learned from.
 * A figure somebody marked "It's right" on an alert counts as checked.
 *
 * Learned figures are SUGGESTIONS: a person adopts one on the Pre-Con
 * dashboard (ConfirmedGuess) before it changes any budget.
 *
 * INTERNAL ONLY. Alert sentences name our ranges and job counts, the
 * background data Mike said never reaches a public visitor. Staff screens,
 * the review screen and the precon email only.
 *
 * Pure: no database, safe in the browser. figureNormsLoad.js feeds it.
 */
import { median, MIN_DRIVER_PROJECTS } from './drivers.js';
import { NO_DRAWING_GUESSES } from '../intake/noDrawingGuesses.js';

export const REAL_SOURCES = new Set(['drawing', 'staff', 'fixtures', 'import']);
export const FIGURE_SOURCES = ['drawing', 'staff', 'fixtures', 'import', 'client', 'guess'];

export const BUILDING_TYPE_LABEL = {
  garden: 'Garden', gurban: 'Gurban', stackedFlats: 'Stacked flats', wrap: 'Wrap',
  podium: 'Podium', midRise: 'Mid-rise', highRise: 'High-rise',
  townHouses: 'Townhouse', singleFamily: 'Single-family',
};
export const typeLabel = (t) => BUILDING_TYPE_LABEL[t] || t || 'Unknown type';

/**
 * Every ProjectData figure that learns. basis: 'unit' = per unit, 'gross' =
 * share of the building's gross SF, 'raw' = the figure itself. zeroOk: 0 is a
 * real answer (no balconies, no garage). guessKey: the NO_DRAWING_GUESSES
 * table a learned value can replace, once a person adopts it.
 */
export const FIGURES = {
  grossSf:             { label: 'Gross building SF',   basis: 'unit',  unit: 'SF', zeroOk: false },
  unitsSf:             { label: 'Units SF',            basis: 'unit',  unit: 'SF', zeroOk: false },
  numBedrooms:         { label: 'Bedrooms',            basis: 'unit',  zeroOk: false },
  numBathrooms:        { label: 'Bathrooms',           basis: 'unit',  zeroOk: false },
  numVanities:         { label: 'Vanities',            basis: 'unit',  zeroOk: false, guessKey: 'vanitiesPerUnit', fallback: 'numBathrooms' },
  numBalconies:        { label: 'Balconies',           basis: 'unit',  zeroOk: true,  guessKey: 'balconiesPerUnit' },
  numEgressStairwells: { label: 'Stair landings',      basis: 'unit',  zeroOk: true },
  numFans:             { label: 'Ceiling fans',        basis: 'unit',  zeroOk: true },
  numAccentDownlights: { label: 'Accent downlights',   basis: 'unit',  zeroOk: true },
  numSurfaceParking:   { label: 'Surface parking stalls', basis: 'unit', zeroOk: true, guessKey: 'surfaceParkingPerUnit' },
  numCarports:         { label: 'Carports',            basis: 'unit',  zeroOk: true },
  numGarages:          { label: 'Private garages',     basis: 'unit',  zeroOk: true,  guessKey: 'garagesPerUnit' },
  numExteriorDoors:    { label: 'Exterior doors',      basis: 'unit',  zeroOk: true },
  numElevatorShafts:   { label: 'Elevator shafts',     basis: 'unit',  zeroOk: true },
  numFloors:           { label: 'Stories',             basis: 'raw',   zeroOk: false, guessKey: 'storiesByType' },
  exteriorAmenitySf:   { label: 'Exterior amenity SF', basis: 'unit',  unit: 'SF', zeroOk: true, guessKey: 'exteriorAmenitySfPerUnit' },
  interiorAmenitySf:   { label: 'Interior amenity SF', basis: 'unit',  unit: 'SF', zeroOk: true, guessKey: 'interiorAmenitySfPerUnit' },
  garageSf:            { label: 'Parking garage SF',   basis: 'unit',  unit: 'SF', zeroOk: true, guessKey: 'garageSfPerUnit' },
  corridorSf:          { label: 'Corridor SF',         basis: 'gross', unit: 'SF', zeroOk: true, guessKey: 'corridorPctOfGross' },
  bohSf:               { label: 'Back of house SF',    basis: 'gross', unit: 'SF', zeroOk: true, guessKey: 'bohPctOfGross' },
};

/** Takeoff row key (intake/quantities.js) → the ProjectData figure it fills. */
export const ROW_FIELD = {
  grossSf: 'grossSf', unitsSf: 'unitsSf', bedrooms: 'numBedrooms', bathrooms: 'numBathrooms',
  vanities: 'numVanities', balconies: 'numBalconies', stairLandings: 'numEgressStairwells',
  ceilingFans: 'numFans', surfaceParking: 'numSurfaceParking', carports: 'numCarports',
  garages: 'numGarages', exitDoors: 'numExteriorDoors', stories: 'numFloors',
  exteriorAmenitySf: 'exteriorAmenitySf', interiorAmenitySf: 'interiorAmenitySf',
  garageSf: 'garageSf', corridorSf: 'corridorSf', bohSf: 'bohSf',
};

// null / '' mean "never recorded", not 0, which can be a real answer.
const num = (v) => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function statsOf(list) {
  const xs = list.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return null;
  return { jobs: xs.length, median: median(xs), low: pct(xs, 0.25), high: pct(xs, 0.75) };
}

/** The figure as a ratio on its basis, or null when it can't be one. */
export function ratioOf(field, value, { units, grossSf } = {}) {
  const f = FIGURES[field];
  const v = num(value);
  if (!f || v == null || v < 0) return null;
  if (!f.zeroOk && v === 0) return null;
  if (f.basis === 'raw') return v;
  const d = num(f.basis === 'gross' ? grossSf : units);
  return d > 0 ? v / d : null;
}

/** The standing guess for a figure's building type: adopted, else built-in. */
export function currentGuess(field, buildingType, confirmed = null) {
  const key = FIGURES[field]?.guessKey;
  if (!key || !buildingType) return null;
  return num(confirmed?.[key]?.[buildingType]) ?? num(NO_DRAWING_GUESSES[key]?.[buildingType]);
}

// ── Formatting ──────────────────────────────────────────────────────────────
const whole = (v) => Math.round(v).toLocaleString('en-US');
function fmtRatio(field, r) {
  const f = FIGURES[field];
  if (f.basis === 'gross') return `${Math.round(r * 1000) / 10}%`;
  if (f.basis === 'raw') return whole(r);
  return r >= 10 ? whole(r) : String(Math.round(r * 100) / 100);
}
const per = (field) => (FIGURES[field].basis === 'gross' ? ' of gross SF' : FIGURES[field].basis === 'raw' ? '' : ' per unit');
const asTotal = (field, r, ctx) => {
  const f = FIGURES[field];
  const d = num(f.basis === 'gross' ? ctx.grossSf : f.basis === 'unit' ? ctx.units : 1);
  return d > 0 ? whole(r * d) : null;
};

/**
 * Is a figure outside the normal range? stats = this type's real jobs.
 * 5+ jobs: above 2× the top of the usual range, below half the bottom, or 0
 * when most jobs have some. Fewer: the standing guess with a 4× band.
 * Returns 'high' | 'low' | 'zero' | null, and whether the guess was the yardstick.
 */
function judge(field, r, stats, guess) {
  if (stats && stats.jobs >= MIN_DRIVER_PROJECTS) {
    if (r === 0) return stats.low > 0 ? { way: 'zero', byGuess: false } : null;
    if (r > stats.high * 2) return { way: 'high', byGuess: false };
    if (stats.low > 0 && r < stats.low / 2) return { way: 'low', byGuess: false };
    return null;
  }
  if (!(guess > 0) || r === 0) return null;
  if (r > guess * 4) return { way: 'high', byGuess: true };
  if (r < guess / 4) return { way: 'low', byGuess: true };
  return null;
}

/**
 * rows: [{ buildingType, units, grossSf, figures: { [field]: { value, source, confirmed } } }]
 * Returns { [buildingType]: { [field]: stats } } from real numbers only, plus
 * client-typed numbers that sit inside the range the real ones set.
 */
export function figureNorms(rows, confirmed = null) {
  const real = {};
  const client = {};
  for (const r of rows || []) {
    const type = r?.buildingType;
    if (!type || !(num(r.units) > 0)) continue;
    for (const field of Object.keys(FIGURES)) {
      let fig = r.figures?.[field];
      const fb = FIGURES[field].fallback;
      if ((fig == null || num(fig.value) == null) && fb) fig = r.figures?.[fb];
      if (!fig) continue;
      const ratio = ratioOf(field, fig.value, r);
      if (ratio == null) continue;
      const trusted = REAL_SOURCES.has(fig.source) || fig.confirmed;
      const bucket = trusted ? real : fig.source === 'client' ? client : null;
      if (!bucket) continue;
      ((bucket[type] ??= {})[field] ??= []).push(ratio);
    }
  }
  const out = {};
  const types = new Set([...Object.keys(real), ...Object.keys(client)]);
  for (const type of types) {
    out[type] = {};
    for (const field of Object.keys(FIGURES)) {
      const mine = real[type]?.[field] || [];
      const base = statsOf(mine);
      const guess = currentGuess(field, type, confirmed);
      const kept = (client[type]?.[field] || []).filter(x => !judge(field, x, base, guess));
      const s = statsOf([...mine, ...kept]);
      if (s) out[type][field] = s;
    }
  }
  return out;
}

/**
 * One on-screen alert for a figure, or null. ctx = { buildingType, units, grossSf }.
 * Text like: "Vanities 120 is 0.4 per unit, our 6 garden jobs usually run
 * 1.3 to 1.5 per unit (about 390 to 450 here). Check it."
 */
export function figureAlert(field, value, ctx, norms, confirmed = null) {
  const f = FIGURES[field];
  if (!f || !ctx?.buildingType) return null;
  const v = num(value);
  if (v == null || v < 0) return null;
  // A 0 on a figure where 0 isn't real is simply "not counted yet", the
  // blank-field prompts handle that, not the alert.
  if (v === 0 && !f.zeroOk) return null;
  const r = f.basis === 'raw' ? v : ratioOf(field, v, ctx);
  if (r == null) return null;
  const stats = norms?.[ctx.buildingType]?.[field] || null;
  const guess = currentGuess(field, ctx.buildingType, confirmed);
  const j = judge(field, r, stats, guess);
  if (!j) return null;

  const name = typeLabel(ctx.buildingType).toLowerCase();
  const shown = f.unit ? `${whole(v)} ${f.unit}` : whole(v);
  const is = f.basis === 'raw' ? '' : ` is ${fmtRatio(field, r)}${per(field)}`;
  let yard;
  if (!j.byGuess) {
    const lo = asTotal(field, stats.low, ctx), hi = asTotal(field, stats.high, ctx);
    const here = f.basis !== 'raw' && lo != null && hi != null ? ` (about ${lo} to ${hi} here)` : '';
    yard = j.way === 'zero'
      ? `our ${stats.jobs} ${name} jobs normally have some (${fmtRatio(field, stats.low)} to ${fmtRatio(field, stats.high)}${per(field)})`
      : `our ${stats.jobs} ${name} jobs usually run ${fmtRatio(field, stats.low)} to ${fmtRatio(field, stats.high)}${per(field)}${here}`;
  } else {
    const t = asTotal(field, guess, ctx);
    yard = `the usual figure for ${name} is ${fmtRatio(field, guess)}${per(field)}${t && f.basis !== 'raw' ? ` (about ${t} here)` : ''}, fewer than ${MIN_DRIVER_PROJECTS} real jobs to compare against yet`;
  }
  const lead = j.way === 'zero' ? `${f.label} is 0, but` : `${f.label} ${shown} looks ${j.way}:${is ? `${is.replace(/^ is/, '')},` : ''}`;
  return { field, way: j.way, text: `${lead} ${yard}. Check it.` };
}

/** Every alert for a set of figures. values = { [field]: value }. */
export function figureAlerts(values, ctx, norms, confirmed = null) {
  const out = [];
  for (const field of Object.keys(FIGURES)) {
    if (!(field in (values || {}))) continue;
    const a = figureAlert(field, values[field], ctx, norms, confirmed);
    if (a) out.push(a);
  }
  return out;
}

function roundFor(field, v) {
  const f = FIGURES[field];
  if (f.basis === 'gross') return Math.round(v * 1000) / 1000;
  if (f.basis === 'raw') return Math.round(v);
  return v >= 10 ? Math.round(v) : Math.round(v * 100) / 100;
}

/**
 * The Pre-Con dashboard's suggestions: one row per learnable figure × building
 * type we have real jobs for. canAdopt once 5+ jobs and the learned figure
 * differs from today's by 5% or more.
 */
export function guessSuggestions(norms, confirmed = null) {
  const rows = [];
  for (const [field, f] of Object.entries(FIGURES)) {
    if (!f.guessKey) continue;
    for (const [type, figs] of Object.entries(norms || {})) {
      const s = figs[field];
      if (!s) continue;
      const now = currentGuess(field, type, confirmed);
      const learned = roundFor(field, s.median);
      const differs = now == null ? true : Math.abs(learned - now) > Math.max(Math.abs(now) * 0.05, 1e-9);
      rows.push({
        field, guessKey: f.guessKey, buildingType: type,
        label: `${f.label}: ${typeLabel(type)}`,
        jobs: s.jobs,
        current: now == null ? null : fmtRatio(field, now) + per(field),
        learned: fmtRatio(field, learned) + per(field),
        learnedValue: learned,
        adopted: confirmed?.[f.guessKey]?.[type] != null,
        range: `${fmtRatio(field, s.low)} to ${fmtRatio(field, s.high)}`,
        canAdopt: s.jobs >= MIN_DRIVER_PROJECTS && differs,
        status: s.jobs < MIN_DRIVER_PROJECTS ? `Needs ${MIN_DRIVER_PROJECTS - s.jobs} more real job(s)`
          : differs ? 'Ready, a person can adopt it' : 'Matches what we use',
      });
    }
  }
  return rows.sort((a, b) => Number(b.canAdopt) - Number(a.canAdopt) || b.jobs - a.jobs || a.label.localeCompare(b.label));
}

/** { [guessKey]: { [buildingType]: value } } from live ConfirmedGuess rows, newest wins. */
export function confirmedGuessMap(rows) {
  const out = {};
  const sorted = [...(rows || [])].filter(r => !r.archivedAt)
    .sort((a, b) => new Date(a.confirmedAt) - new Date(b.confirmedAt));
  for (const r of sorted) (out[r.guessKey] ??= {})[r.buildingType] = r.value;
  return out;
}
