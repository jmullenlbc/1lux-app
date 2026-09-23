/**
 * calibration/drivers.js - Phase 3: is the model multiplying by the RIGHT thing?
 *
 * Phase 2 answered "is this rate too high or too low". This answers the harder
 * question underneath it: some scopes are not per-unit problems at all. Pathway
 * lighting is the example we already know about - it follows the walking paths
 * on the site, not how many apartments the building holds. No amount of
 * re-tuning a per-unit rate ever fixes a line whose driver is wrong.
 *
 * It needs no new data. Every project's samples already carry every driver:
 * the units line records residential SF, the pathway line records the unit
 * count, the total line records gross SF, landscape records net lot SF, and so
 * on. This file pivots those quantities into one driver profile per project,
 * then asks, for each budget line, which driver the real dollars actually
 * track.
 *
 * Two numbers per candidate, and the second one matters more:
 *   - fit    - do they rise and fall together? Plain correlation.
 *   - spread - if we priced on this driver, how much would the rate wobble
 *              from job to job? Measured robustly, so one strange job cannot
 *              decide anything on its own.
 *
 * A tight spread is what you can actually price on. A driver can correlate
 * beautifully and still be useless if the rate it implies doubles between
 * jobs.
 *
 * Pure: no database. Input is the same rows loadSamplesWithContext() returns.
 */

import { LINE_LABELS } from './lines.js';

/**
 * How few jobs is too few to say anything out loud. Five is not statistics -
 * it is the point below which a "finding" is just noise with a decimal point
 * on it. Nothing below this is reported at all, on purpose.
 */
export const MIN_DRIVER_PROJECTS = 5;

/** A candidate has to fit at least this well before it is even considered. */
export const MIN_FIT = 0.7;

/** ...and has to tighten the spread by at least this much to be worth raising. */
export const SPREAD_IMPROVEMENT = 0.25;

/**
 * The drivers we can read today, and the budget line whose recorded quantity
 * carries each one. Adding a driver here is the whole job of teaching the
 * analysis a new one - nothing else changes.
 */
export const DRIVERS = [
  { key: 'units',           label: 'Apartment units',     unit: 'units',    from: 'exterior.pathway' },
  { key: 'grossSf',         label: 'Gross building SF',   unit: 'sf',       from: 'total' },
  { key: 'unitsSf',         label: 'Residential SF',      unit: 'sf',       from: 'units.base' },
  { key: 'corridorSf',      label: 'Corridor SF',         unit: 'sf',       from: 'corridors.disks' },
  { key: 'landings',        label: 'Stair landings',      unit: 'landings', from: 'corridors.stairwells' },
  { key: 'bohSf',           label: 'Back-of-house SF',    unit: 'sf',       from: 'boh' },
  { key: 'interiorSf',      label: 'Interior amenity SF', unit: 'sf',       from: 'interior' },
  { key: 'garageSf',        label: 'Garage SF',           unit: 'sf',       from: 'garage' },
  { key: 'exteriorSf',      label: 'Exterior amenity SF', unit: 'sf',       from: 'exterior.amenities' },
  { key: 'parkingFixtures', label: 'Parking pole lights', unit: 'fixtures', from: 'exterior.parking' },
  { key: 'netLotSf',        label: 'Net lot SF',          unit: 'sf',       from: 'exterior.landscape' },
];

export const DRIVER_LABEL = Object.fromEntries(DRIVERS.map(d => [d.key, d.label]));
export const DRIVER_UNIT  = Object.fromEntries(DRIVERS.map(d => [d.key, d.unit]));

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const round = (v, p = 4) => (v == null ? null : Math.round(v * 10 ** p) / 10 ** p);

export function median(list) {
  const xs = (list || []).filter(x => x != null && Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * How much a rate wobbles, as a share of its middle value. Median absolute
 * deviation, not standard deviation: one wild job moves a standard deviation a
 * long way and a median barely at all.
 */
export function spreadOf(rates) {
  const xs = (rates || []).filter(x => x != null && Number.isFinite(x) && x > 0);
  if (xs.length < 2) return null;
  const mid = median(xs);
  if (!mid) return null;
  const mad = median(xs.map(x => Math.abs(x - mid)));
  return round(mad / mid, 4);
}

/** Plain Pearson correlation. Null whenever it cannot be computed honestly. */
export function correlation(pairs) {
  const xs = (pairs || []).filter(p => num(p?.[0]) != null && num(p?.[1]) != null);
  if (xs.length < 3) return null;
  const mx = xs.reduce((a, p) => a + p[0], 0) / xs.length;
  const my = xs.reduce((a, p) => a + p[1], 0) / xs.length;
  let num2 = 0, dx = 0, dy = 0;
  for (const [x, y] of xs) { num2 += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2; }
  // One value repeated has no direction to correlate with. Say so, do not guess.
  if (dx === 0 || dy === 0) return null;
  return round(num2 / Math.sqrt(dx * dy), 3);
}

/**
 * One driver profile per project, pivoted out of that project's own samples.
 * A driver the project never recorded is simply absent - never a zero, because
 * "no garage" and "we never captured the garage" price very differently.
 */
export function projectDrivers(samples) {
  const byProject = new Map();
  for (const s of samples || []) {
    if (!s?.projectId) continue;
    if (!byProject.has(s.projectId)) byProject.set(s.projectId, {});
    const profile = byProject.get(s.projectId);
    for (const d of DRIVERS) {
      if (s.lineKey !== d.from) continue;
      const q = num(s.quantity);
      if (q != null && q > 0) profile[d.key] = q;
    }
  }
  return byProject;
}

/**
 * How well one driver explains one budget line's real dollars.
 * Null when there are not enough jobs to say anything.
 */
export function driverFit(lineRows, drivers, driverKey) {
  const seen  = new Set();
  const pairs = [];
  for (const r of lineRows || []) {
    const driver = drivers.get(r.projectId)?.[driverKey];
    const actual = num(r.actualAmount);
    if (driver == null || driver <= 0 || actual == null || actual <= 0) continue;
    // One job votes once, however many samples it happens to have on this line.
    if (seen.has(r.projectId)) continue;
    seen.add(r.projectId);
    pairs.push([driver, actual]);
  }
  if (pairs.length < MIN_DRIVER_PROJECTS) return null;

  const rates = pairs.map(([d, a]) => a / d);
  return {
    driverKey,
    driverLabel: DRIVER_LABEL[driverKey] || driverKey,
    driverUnit:  DRIVER_UNIT[driverKey] || null,
    projects:    pairs.length,
    fit:         correlation(pairs),
    impliedRate: round(median(rates)),
    spread:      spreadOf(rates),
  };
}

/**
 * For every budget line with enough real figures behind it, rank the drivers
 * that could explain it. `current` is the driver the engine multiplies by
 * today, found by matching the line's own recorded quantity.
 */
export function driverAnalysis(samples) {
  const rows    = (samples || []).filter(s => num(s?.actualAmount) != null && s.actualAmount > 0);
  const drivers = projectDrivers(samples);

  const byLine = new Map();
  for (const r of rows) {
    if (!r.lineKey) continue;
    if (!byLine.has(r.lineKey)) byLine.set(r.lineKey, []);
    byLine.get(r.lineKey).push(r);
  }

  const out = [];
  for (const [lineKey, lineRows] of byLine) {
    const projects = new Set(lineRows.map(r => r.projectId)).size;
    if (projects < MIN_DRIVER_PROJECTS) continue;

    // The driver the engine uses today is whichever one this line's own
    // quantity is. It can be none - some lines are hand-entered.
    const own = DRIVERS.find(d => d.from === lineKey)?.key ?? null;

    const candidates = DRIVERS
      .map(d => driverFit(lineRows, drivers, d.key))
      .filter(Boolean)
      // Tightest rate first: that is the one you could actually price on.
      .sort((a, b) => (a.spread ?? 9) - (b.spread ?? 9));

    out.push({
      lineKey,
      label:            LINE_LABELS[lineKey] || lineKey,
      projects,
      currentDriverKey: own,
      current:          own ? (candidates.find(c => c.driverKey === own) ?? null) : null,
      candidates,
    });
  }
  return out.sort((a, b) => b.projects - a.projects);
}

function suggestionShape(line, best, current) {
  return {
    lineKey:  line.lineKey,
    label:    line.label,
    projects: best.projects,
    from: current
      ? { driver: current.driverLabel, unit: current.driverUnit, rate: current.impliedRate, spread: current.spread, fit: current.fit }
      : null,
    to:   { driver: best.driverLabel, unit: best.driverUnit, rate: best.impliedRate, spread: best.spread, fit: best.fit },
  };
}

/**
 * The only findings worth putting in front of somebody: a different driver
 * that both fits well AND prices more steadily than the one in use, across
 * enough jobs to mean it. Everything else stays quiet.
 */
export function betterDriverSuggestions(analysis) {
  const out = [];
  for (const line of analysis || []) {
    const current = line.current;
    const pool    = (line.candidates || []).filter(c => c.driverKey !== line.currentDriverKey);
    const best    = pool.find(c => (c.fit ?? 0) >= MIN_FIT && c.spread != null);
    if (!best) continue;

    // A line with no driver at all is hand-entered today. Any good candidate
    // there is news, because it means the line could have a formula.
    if (!current) {
      out.push({ ...suggestionShape(line, best, null), reason: 'no-formula' });
      continue;
    }
    if (current.spread == null || current.spread <= 0) continue;
    const improvement = (current.spread - best.spread) / current.spread;
    if (improvement < SPREAD_IMPROVEMENT) continue;
    out.push({ ...suggestionShape(line, best, current), improvement: round(improvement, 3), reason: 'steadier' });
  }
  // Biggest improvement first; a line with no formula at all sorts to the top.
  return out.sort((a, b) => (b.improvement ?? 1) - (a.improvement ?? 1));
}

/** How steady a rate is, in words. */
export function describeSpread(spread) {
  if (spread == null) return 'not enough jobs to say';
  if (spread <= 0.10) return 'very steady';
  if (spread <= 0.25) return 'steady';
  if (spread <= 0.50) return 'wobbly';
  return 'all over the place';
}

const money = (v) => (v == null ? '-' : v < 10 ? `$${v.toFixed(2)}` : `$${Math.round(v).toLocaleString()}`);
const per   = (rate, unit) => `${money(rate)} per ${unit || 'unit'}`;

/**
 * One suggestion as a sentence somebody can read without a statistics degree.
 * This is also what a bot hands back when it is asked about drivers.
 */
export function describeSuggestion(s) {
  if (!s) return '';
  if (s.reason === 'no-formula') {
    return `${s.label} has no formula behind it today. Across ${s.projects} jobs the real figure tracks ` +
           `${s.to.driver.toLowerCase()} at about ${per(s.to.rate, s.to.unit)} (${describeSpread(s.to.spread)}).`;
  }
  return `${s.label} is priced per ${s.from.unit || 'unit'} today, and that rate is ` +
         `${describeSpread(s.from.spread)} across ${s.projects} jobs. The same dollars track ` +
         `${s.to.driver.toLowerCase()} much more closely - about ${per(s.to.rate, s.to.unit)}, ` +
         `${describeSpread(s.to.spread)}. Worth measuring ${s.to.driver.toLowerCase()} off the drawings.`;
}

/**
 * Everything Phase 3 knows, in one call: what each line really tracks, and the
 * short list of lines whose driver looks wrong. Used by the screen, the report
 * and the bot alike so all three always say the same thing.
 */
export function driverFindings(samples) {
  const analysis    = driverAnalysis(samples);
  const suggestions = betterDriverSuggestions(analysis);
  return {
    minProjects: MIN_DRIVER_PROJECTS,
    linesRead:   analysis.length,
    analysis,
    suggestions,
    sentences:   suggestions.map(describeSuggestion),
  };
}
