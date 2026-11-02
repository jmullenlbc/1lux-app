import { cents, lineTotal, sumCents } from '../money.js';

// Status decides the plan. These always count, these never do. Considering follows the tick.
export const FORCED_IN = ['PLANNED', 'REGISTERED', 'ATTENDED'];
export const OUT_STATUSES = ['SKIPPED', 'CANCELLED'];
// Until Expenses feeds real receipts, spend is the planned cost of these.
export const SPEND_STATUSES = ['REGISTERED', 'ATTENDED'];

// Conference planner math (0160, Mike 11-1). Pure, no database, so the test can
// hold it to every row of the plan's own numbers. Money here is dollars, always
// through money.js; the database keeps whole cents.

export const DEFAULT_PLAN_SETTINGS = {
  weights: { buyerDensity: 0.30, supplierAccess: 0.20, reach: 0.15, costEfficiency: 0.15, verticalPriority: 0.10, marketFit: 0.10 },
  tiers: { A: 4.05, B: 3.90 },
  headcount: { A: 2, B: 1, C: 1 },
  verticalPriority: { MULTIFAMILY: 5, BTR: 4, AFFORDABLE: 5, SENIORS: 5, STUDENT: 5, LIGHTING_DESIGN: 3 },
  marketFit: { COLORADO: 5, NATIONAL: 4, REGIONAL: 2 },
  reachBands: [3000, 1200, 500, 200],
  costBands: [2000, 3000, 4500, 6500],
  hotelDefault: 300,
  perDiem: 125,
  defaultDays: 3,
  extraHotelNights: 1,
  contingency: 0.10,
  sponsorPlaceholder: 7500,
  airfareByState: {
    CO: 150, AZ: 350, UT: 350, NM: 350, NV: 350, TX: 350, WY: 350, MT: 350, ID: 350, KS: 350, NE: 350, OK: 350, SD: 350, ND: 350,
    CA: 400, WA: 400, OR: 400,
    IL: 450, MN: 450, MO: 450, TN: 450, GA: 450, NC: 450, SC: 450, FL: 450, LA: 450, AL: 450, MS: 450, AR: 450, IA: 450, WI: 450, MI: 450, IN: 450, OH: 450, KY: 450,
    NY: 500, MA: 500, DC: 500, PA: 500, NJ: 500, MD: 500, VA: 500, CT: 500, RI: 500, NH: 500, ME: 500, VT: 500, DE: 500, WV: 500,
    HI: 900, TBD: 450,
  },
};

// Settings are stored one row per value ("weights.reach", "airfareByState.CO",
// "reachBands.0"). Only the changed ones have a row; the rest stay default.
export function settingsFromRows(rows = []) {
  const out = structuredClone(DEFAULT_PLAN_SETTINGS);
  for (const { key, value } of rows) {
    const [head, sub] = key.split('.');
    if (!(head in out)) continue;
    if (sub === undefined) out[head] = value;
    else if (Array.isArray(out[head])) out[head][Number(sub)] = value;
    else out[head][sub] = value;
  }
  return out;
}

export function settingRowsFrom(settings) {
  const rows = [];
  for (const [head, v] of Object.entries(settings)) {
    if (typeof v === 'number') rows.push({ key: head, value: v });
    else if (Array.isArray(v)) v.forEach((x, i) => rows.push({ key: `${head}.${i}`, value: x }));
    else if (v && typeof v === 'object') for (const [sub, x] of Object.entries(v)) rows.push({ key: `${head}.${sub}`, value: x });
  }
  return rows;
}

// Day-only dates. Stored at noon UTC, compared as YYYY-MM-DD.
export function dayOf(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

const dayNumber = (day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86400000;

// band(4000, [3000, 1200, 500, 200], '>=') = 5; falls through the list to 1.
function band(value, bands, test) {
  const i = bands.findIndex(b => (test === '>=' ? value >= b : value <= b));
  return i === -1 ? 1 : 5 - i;
}

const clean = (n) => Number(n.toPrecision(12));

export function quarterOf(day) {
  if (!day) return 'TBD';
  return `${day.slice(0, 4)}-Q${Math.ceil(+day.slice(5, 7) / 3)}`;
}

/** One event: its cost ledger, its score and where the plan puts it. */
export function computeEdition(edition, series, settings = DEFAULT_PLAN_SETTINGS) {
  const s = settings;
  const start = dayOf(edition.startDate), end = dayOf(edition.endDate);
  const isLocal = !!edition.isLocal;

  const days        = start && end ? dayNumber(end) - dayNumber(start) + 1 : s.defaultDays;
  const hotelNights = isLocal ? 0 : days - 1 + s.extraHotelNights;
  const airfare     = isLocal ? 0 : (edition.airfareOverride ?? s.airfareByState[edition.state] ?? 450);
  const hotelRate   = isLocal ? 0 : (edition.hotelRateOverride ?? s.hotelDefault);

  const route = series.accessRoute;
  const reg = edition.regCostBasis === 'MANUAL' ? (edition.regCost ?? 0)
    : route === 'MEMBERS_ONLY' || route === 'BARRED' ? 0
    : edition.regCost ?? (route === 'SPONSOR_ONLY' ? s.sponsorPlaceholder : 0);

  const hotel   = lineTotal(hotelNights, hotelRate);
  const meals   = lineTotal(days, s.perDiem);
  const perPerson = sumCents([reg, airfare, hotel, meals]);

  const reachScore = edition.attendance == null ? 2 : band(edition.attendance, s.reachBands, '>=');
  const costScore  = band(perPerson, s.costBands, '<=');
  const vertScore  = s.verticalPriority[series.vertical] ?? 3;
  const mktScore   = s.marketFit[edition.scope] ?? 0;
  const w = s.weights;
  const score = clean(
    series.buyerDensity * w.buyerDensity + series.supplierAccess * w.supplierAccess + reachScore * w.reach
    + costScore * w.costEfficiency + vertScore * w.verticalPriority + mktScore * w.marketFit,
  );

  const tier = !series.supplierEligible ? 'X'
    : edition.tierOverride || (score >= s.tiers.A ? 'A' : score >= s.tiers.B ? 'B' : 'C');
  const out = OUT_STATUSES.includes(edition.status);
  const forced = FORCED_IN.includes(edition.status);
  const include = tier === 'X' || out ? false : forced || (edition.includeOverride ?? (tier === 'A' || tier === 'B'));
  const headcount = edition.headcountOverride ?? s.headcount[tier === 'X' ? 'C' : tier];

  const travel = cents(perPerson - reg);
  const plannedCost = series.regCostPerCompany
    ? cents(reg + lineTotal(headcount, travel))
    : lineTotal(headcount, perPerson);

  return {
    days, hotelNights, airfare, hotelRate, reg, hotel, meals, perPerson,
    reachScore, costScore, vertScore, mktScore, score, tier, include, headcount,
    plannedCost, plannedTotal: include ? plannedCost : 0,
    needsMembership: route === 'MEMBERS_ONLY',
    quarter: quarterOf(start),
  };
}

// Highest score first, then soonest, then name. Undated events sort last on a tie.
export function rankRows(rows) {
  const sorted = [...rows].sort((a, b) =>
    b.score - a.score
    || (a.start || '9999').localeCompare(b.start || '9999')
    || a.name.localeCompare(b.name));
  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}

// Marks every included event that overlaps another included one. Undated events
// cannot clash.
export function markClashes(rows) {
  const going = rows.filter(r => r.include && r.start && r.end);
  for (const r of rows) {
    r.clash = r.include && !!r.start && !!r.end
      && going.some(o => o !== r && o.start <= r.end && r.start <= o.end);
  }
  return rows;
}

function scenario(rows, contingency) {
  const subtotal = sumCents(rows.map(r => r.plannedCost));
  const cushion = cents(subtotal * contingency);
  return {
    events: rows.length,
    attendeeTrips: rows.reduce((n, r) => n + r.headcount, 0),
    subtotal,
    contingency: cushion,
    total: cents(subtotal + cushion),
  };
}

export function groupTotals(rows, keyOf) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    const row = map.get(k) || { key: k, events: 0, planned: 0 };
    row.events += 1;
    row.planned = cents(row.planned + r.plannedTotal);
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * The whole plan. rows are computeEdition results plus the event's slug,
 * vertical and region; memberships are { orgName, annualDues, include, unlocks: [slug] }.
 */
export function computePlan(rows, memberships = [], settings = DEFAULT_PLAN_SETTINGS, budgetCap = null) {
  const live = rows.filter(r => r.status !== 'CANCELLED');
  const included = live.filter(r => r.include);
  const c = settings.contingency;

  const scenarios = {
    lean:    scenario(live.filter(r => r.tier === 'A'), c),
    core:    scenario(live.filter(r => r.tier === 'A' || r.tier === 'B'), c),
    full:    scenario(live.filter(r => r.tier !== 'X'), c),
    current: scenario(included, c),
  };

  const slugsGoing = new Set(included.map(r => r.slug));
  const membershipRows = memberships.map(m => {
    const unlocked = (m.unlocks || []).filter(s => slugsGoing.has(s));
    const on = m.include === 'Y' || (m.include === 'AUTO' && unlocked.length > 0);
    return { ...m, on, unlockedCount: unlocked.length, duesCounted: on ? (m.annualDues ?? 0) : 0 };
  });
  const dues = sumCents(membershipRows.map(m => m.duesCounted));
  const grandTotal = cents(scenarios.current.total + dues);

  return {
    scenarios,
    memberships: membershipRows,
    dues,
    grandTotal,
    budgetCap,
    vsCap: budgetCap == null ? null : cents(budgetCap - grandTotal),
    byQuarter:  groupTotals(included, r => r.quarter),
    byVertical: groupTotals(included, r => r.vertical),
    byRegion:   groupTotals(included, r => r.region),
  };
}

/**
 * The top numbers for one year. Pure, so filtered rows give filtered numbers.
 * Spend has no contingency: it is what we are committed to, not a cushion.
 */
export function yearTotals(rows, year, today, contingency = 0) {
  const inYear = rows.filter(r => Number(r.year) === Number(year) && !OUT_STATUSES.includes(r.status));
  const spent = inYear.filter(r => SPEND_STATUSES.includes(r.status));
  const planned = scenario(inYear.filter(r => r.include), contingency);
  return {
    events: planned.events,
    trips: planned.attendeeTrips,
    planned: planned.total,
    ytdSpend: sumCents(spent.filter(r => r.start && r.start <= today).map(r => r.plannedCost)),
    yearSpend: sumCents(spent.map(r => r.plannedCost)),
  };
}

/**
 * The top numbers on the Memberships tab, from the rows computePlan returns.
 * Pure, so filtered rows give filtered numbers. A typed Actual with no date
 * counts as already paid.
 */
export function membershipTotals(rows, today) {
  const paid = rows.filter(m => m.paid != null);
  return {
    planned: sumCents(rows.map(m => m.duesCounted)),
    ytdSpend: sumCents(paid.filter(m => !m.paidOn || m.paidOn <= today).map(m => m.paid)),
    yearSpend: sumCents(paid.map(m => m.paid)),
    toPay: sumCents(rows.filter(m => m.on && m.paid == null).map(m => m.duesCounted)),
  };
}
