/**
 * Per-area budget alerts (Mike 2026-09-24): "do it by area of the building.
 * Does that area of the building seem out of whack or totally off from the
 * questionnaire they answered originally."
 *
 * Two checks per area (units, corridors, garage…):
 *   1. against our real jobs of the same building type, in $ per unit;
 *   2. against the area's dollars when the questionnaire was first finished.
 *
 * INTERNAL ONLY. The sentences name our ranges and job counts — never on the
 * public form, a PDF, a share link or the portal. Sell dollars only; this
 * engine has no buy price in it.
 *
 * Pure: no database, safe in the browser. areaNormsLoad.js feeds it.
 */
import { median, MIN_DRIVER_PROJECTS } from './drivers.js';
import { typeLabel } from './figureNorms.js';

// The sidebar's areas, in the sidebar's order and words.
export const AREAS = {
  units:     'Residential Units',
  corridors: 'Corridors & Stairwells',
  boh:       'BOH / Core + Shell',
  interior:  'Interior Amenities',
  garage:    'Garage',
  exterior:  'Exterior & Site',
  emergency: 'Emergency Lighting',
  exitSigns: 'Exit Signs',
  controls:  'Controls',
};
export const AREA_KEYS = Object.keys(AREAS);

// Questionnaire check: the area moved by more than half AND by this much.
export const BASE_MOVE = 0.5;
export const BASE_MIN_DOLLARS = 5000;
// "It's right" holds while the area stays within 5% (or $500) of the checked figure.
const OK_SLACK = 0.05;
const OK_MIN = 500;

const num = (v) => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
const round = (v) => Math.round((num(v) || 0) * 100) / 100;

/** Each area's product dollars from a calculateBudget() result. */
export function areaDollars(budget) {
  const s = budget?.sections || {};
  return {
    units:     round(s.units?.total?.product),
    corridors: round(s.corridors?.total?.product),
    boh:       round(s.boh?.product),
    interior:  round(s.interior?.product),
    garage:    round(s.garage?.product),
    exterior:  round(s.exterior?.total?.product),
    emergency: round(s.emergency?.product),
    exitSigns: round(s.exitSigns?.product),
    controls:  round(budget?.controls),
  };
}

function pct(sorted, p) {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function statsOf(list) {
  const xs = list.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return null;
  return { jobs: xs.length, median: median(xs), low: pct(xs, 0.25), high: pct(xs, 0.75) };
}

// Same yardstick as the figure alerts: 5+ jobs, above 2× the top of the usual
// range, below half the bottom, or $0 when most jobs have some.
function judge(perUnit, stats) {
  if (!stats || stats.jobs < MIN_DRIVER_PROJECTS) return null;
  if (perUnit === 0) return stats.low > 0 ? 'zero' : null;
  if (perUnit > stats.high * 2) return 'high';
  if (stats.low > 0 && perUnit < stats.low / 2) return 'low';
  return null;
}

/**
 * rows: [{ buildingType, units, trust: 'real' | 'client' | null, areas: { [area]: $ } }]
 * 'real' = every figure is a real one; 'client' = the visitor typed some and
 * none are tool guesses — those count only inside the range the real ones set.
 * Returns { [buildingType]: { [area]: { jobs, median, low, high } } } in $ per unit.
 */
export function areaNorms(rows) {
  const real = {}, client = {};
  for (const r of rows || []) {
    const type = r?.buildingType;
    const units = num(r?.units);
    if (!type || !(units > 0) || !r.areas) continue;
    const bucket = r.trust === 'real' ? real : r.trust === 'client' ? client : null;
    if (!bucket) continue;
    for (const a of AREA_KEYS) {
      const v = num(r.areas[a]);
      if (v == null || v < 0) continue;
      ((bucket[type] ??= {})[a] ??= []).push(v / units);
    }
  }
  const out = {};
  for (const type of new Set([...Object.keys(real), ...Object.keys(client)])) {
    out[type] = {};
    for (const a of AREA_KEYS) {
      const mine = real[type]?.[a] || [];
      const base = statsOf(mine);
      const kept = (client[type]?.[a] || []).filter(x => !judge(x, base));
      const s = statsOf([...mine, ...kept]);
      if (s) out[type][a] = s;
    }
  }
  return out;
}

const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const perUnitMoney = (v) => `$${v >= 100 ? Math.round(v).toLocaleString('en-US') : Math.round(v * 10) / 10}`;

function checkedAlready(amount, check) {
  const ok = num(check?.okAmount);
  return ok != null && Math.abs(amount - ok) <= Math.max(OK_MIN, ok * OK_SLACK);
}

/** Against our real jobs of this building type. */
export function areaJobsAlert(area, amount, ctx, norms) {
  const units = num(ctx?.units);
  if (!AREAS[area] || !ctx?.buildingType || !(units > 0)) return null;
  const v = num(amount);
  if (v == null || v < 0) return null;
  const stats = norms?.[ctx.buildingType]?.[area];
  const r = v / units;
  const way = judge(r, stats);
  if (!way) return null;
  const name = typeLabel(ctx.buildingType).toLowerCase();
  const range = `${perUnitMoney(stats.low)}–${perUnitMoney(stats.high)} per unit (about ${money(stats.low * units)}–${money(stats.high * units)} here)`;
  const text = way === 'zero'
    ? `${AREAS[area]} is $0, but our ${stats.jobs} ${name} jobs normally have some — ${range}.`
    : `${AREAS[area]} ${money(v)} looks ${way}: ${perUnitMoney(r)} per unit — our ${stats.jobs} ${name} jobs usually run ${range}.`;
  return { area, kind: 'jobs', way, text };
}

/** Against this area's dollars when the questionnaire was first finished. */
export function areaBaseAlert(area, amount, ctx, check) {
  const base = num(check?.baseAmount);
  const v = num(amount);
  if (!AREAS[area] || base == null || v == null) return null;
  // Per unit when the unit count moved — a bigger building is not a surprise here.
  const nowU = num(ctx?.units), thenU = num(check?.baseUnits);
  const scale = nowU > 0 && thenU > 0 && nowU !== thenU ? nowU / thenU : 1;
  const expected = base * scale;
  if (Math.abs(v - expected) < BASE_MIN_DOLLARS) return null;
  let way = null;
  if (expected === 0) way = 'new';
  else if (v === 0) way = 'gone';
  else if (v > expected * (1 + BASE_MOVE)) way = 'high';
  else if (v < expected * (1 - BASE_MOVE)) way = 'low';
  if (!way) return null;
  const from = check.baseFrom === 'web-request' ? 'the original web request' : 'the original questionnaire';
  const units = scale !== 1 ? ` (${money(expected)} at today's ${Math.round(nowU)} units)` : '';
  const text = way === 'new'
    ? `${AREAS[area]} is ${money(v)} — ${from} had none here.`
    : way === 'gone'
      ? `${AREAS[area]} is now $0 — ${from} had ${money(base)}.`
      : `${AREAS[area]} ${money(v)} is ${Math.round((v / expected) * 10) / 10}× ${from}'s ${money(base)}${units}.`;
  return { area, kind: 'questionnaire', way, text };
}

/**
 * Every area alert. dollars = areaDollars(budget); ctx = { buildingType, units };
 * checks = { [area]: { baseAmount, baseUnits, baseFrom, okAmount } }.
 * Returns { [area]: [alert, …] } (only areas with something to say).
 */
export function areaAlerts(dollars, ctx, norms, checks = {}) {
  const out = {};
  for (const a of AREA_KEYS) {
    const v = num(dollars?.[a]);
    if (v == null || checkedAlready(v, checks?.[a])) continue;
    const list = [areaJobsAlert(a, v, ctx, norms), areaBaseAlert(a, v, ctx, checks?.[a])].filter(Boolean);
    if (list.length) out[a] = list;
  }
  return out;
}
