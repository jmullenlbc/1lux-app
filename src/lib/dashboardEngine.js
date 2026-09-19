/**
 * Dashboard query engine — native JS dates only, no date library.
 * Translates a DashboardWidget config into Prisma queries and returns chart-ready data.
 */

// File extensions on purpose: the test suite imports this module straight into
// plain Node, which will not guess at a missing ".js" the way the app build does.
import {
  averageProbability, STAGE_LABEL, STATUS_LABEL, DESIGN_SERVICE_TYPES, FEE_OPTIONAL_DESIGN_TYPES,
  PIPELINE_LABEL, PIPELINE_KEYS, boardRows, combinedRevenue,
  normalizeStage, DECIDED_STATUSES, WON_STATUSES,
} from './pipeline.js';
import { serviceTypeLabel, projectTypeLabel } from './utils.js';

// ── Native date helpers ────────────────────────────────────────────────────

function sob(d) { const r = new Date(d); r.setHours(0,0,0,0);   return r; }  // start of day
function eod(d) { const r = new Date(d); r.setHours(23,59,59,999); return r; } // end of day

function som(d) { return new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0); }
function eom(d) { return new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999); }

function soq(d) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1, 0,0,0,0);
}
function eoq(d) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0, 23,59,59,999);
}

function soy(d) { return new Date(d.getFullYear(), 0, 1, 0,0,0,0); }
function eoy(d) { return new Date(d.getFullYear(), 11, 31, 23,59,59,999); }

function addMonths(d, n) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
function addQuarters(d, n) { return addMonths(d, n * 3); }
function addYears(d, n)    { const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r; }

function fmtMonthYear(d) {
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}
function quarter(d) {
  return `Q${Math.ceil((d.getMonth()+1)/3)} ${d.getFullYear()}`;
}

function eachMonth(start, end) {
  const months = [];
  const cur = som(start);
  while (cur <= end) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function eachQuarter(start, end) {
  const quarters = [];
  const cur = soq(start);
  while (cur <= end) {
    quarters.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 3);
  }
  return quarters;
}

// ── Relative date resolver ─────────────────────────────────────────────────

export function resolveRelativeDate(key) {
  const now = new Date();
  switch (key) {
    case 'today':          return { gte: sob(now),              lte: eod(now) };
    case 'yesterday':      { const y = new Date(now); y.setDate(y.getDate()-1);
                             return { gte: sob(y), lte: eod(y) }; }
    case 'this_week':      { const s = new Date(now); s.setDate(s.getDate() - ((s.getDay()+6)%7));
                             const e = new Date(s); e.setDate(s.getDate()+6);
                             return { gte: sob(s), lte: eod(e) }; }
    case 'last_week':      { const s = new Date(now); s.setDate(s.getDate() - ((s.getDay()+6)%7) - 7);
                             const e = new Date(s); e.setDate(s.getDate()+6);
                             return { gte: sob(s), lte: eod(e) }; }
    case 'this_month':     return { gte: som(now),              lte: eom(now) };
    case 'last_month':     { const m = addMonths(now,-1); return { gte: som(m), lte: eom(m) }; }
    case 'next_month':     { const m = addMonths(now, 1); return { gte: som(m), lte: eom(m) }; }
    case 'this_quarter':   return { gte: soq(now),              lte: eoq(now) };
    case 'last_quarter':   { const q = addQuarters(now,-1); return { gte: soq(q), lte: eoq(q) }; }
    case 'next_quarter':   { const q = addQuarters(now, 1); return { gte: soq(q), lte: eoq(q) }; }
    case 'this_year':      return { gte: soy(now),              lte: eoy(now) };
    case 'last_year':      { const y = addYears(now,-1); return { gte: soy(y), lte: eoy(y) }; }
    case 'next_year':      { const y = addYears(now, 1); return { gte: soy(y), lte: eoy(y) }; }
    case 'last_6_months':  return { gte: som(addMonths(now,-6)), lte: eom(now) };
    case 'last_12_months': return { gte: som(addMonths(now,-12)),lte: eom(now) };
    case 'next_6_months':  return { gte: sob(now),               lte: eom(addMonths(now,6)) };
    case 'next_12_months': return { gte: sob(now),               lte: eod(addMonths(now,12)) };
    default: return null;
  }
}

export const RELATIVE_DATE_OPTIONS = [
  { group: 'Relative Dates',   key: 'today',          label: 'Today' },
  { group: 'Relative Dates',   key: 'yesterday',       label: 'Yesterday' },
  { group: 'Relative Periods', key: 'this_week',       label: 'This week' },
  { group: 'Relative Periods', key: 'last_week',       label: 'Last week' },
  { group: 'Relative Periods', key: 'this_month',      label: 'This month' },
  { group: 'Relative Periods', key: 'last_month',      label: 'Last month' },
  { group: 'Relative Periods', key: 'next_month',      label: 'Next month' },
  { group: 'Relative Periods', key: 'this_quarter',    label: 'This quarter' },
  { group: 'Relative Periods', key: 'last_quarter',    label: 'Last quarter' },
  { group: 'Relative Periods', key: 'next_quarter',    label: 'Next quarter' },
  { group: 'Relative Periods', key: 'this_year',       label: 'This year' },
  { group: 'Relative Periods', key: 'last_year',       label: 'Last year' },
  { group: 'Relative Periods', key: 'next_year',       label: 'Next year' },
  { group: 'Rolling Windows',  key: 'last_6_months',   label: 'Last 6 months' },
  { group: 'Rolling Windows',  key: 'last_12_months',  label: 'Last 12 months' },
  { group: 'Rolling Windows',  key: 'next_6_months',   label: 'Next 6 months' },
  { group: 'Rolling Windows',  key: 'next_12_months',  label: 'Next 12 months' },
];

// ── Filter → Prisma where clause ──────────────────────────────────────────

const DATE_FIELDS    = new Set(['expectedOrderDate','createdAt']);
const NUMERIC_FIELDS = new Set(['pipelineProbability','contractValue','designContractValue']);

// The dashboard now runs on Project (Deal merged in). Translate legacy deal filter
// field names → project columns; drop filters on fields that no longer exist.
const FIELD_MAP = {
  probability: 'pipelineProbability',
  totalRevenue: 'contractValue', designFeeTotal: 'designContractValue', ownerId: 'salesOwnerId',
};
const DROP_FILTER_FIELDS = new Set(['lostReason','wonAt','lostAt','nextActionDue','numberOfUnits','projectStatus']);

// ── Row-level filters ─────────────────────────────────────────────────────
// These three describe a BOARD ROW, not a job. A full-design job is on two
// boards at once and can be won on one while still open on the other, so asking
// the database for "status is WON" against procurementStatus is wrong twice
// over: it throws away a job whose DESIGN side is won, and it lets that same
// job's Procurement row through when the chart asked only for Design. They are
// matched in JS after each project is expanded into its board rows instead.
const ROW_FILTER_FIELDS = new Set(['pipeline', 'dealStatus', 'stage']);

function rowValue(row, field) {
  if (field === 'pipeline')   return row.pipeline;
  if (field === 'dealStatus') return row.status;
  if (field === 'stage')      return normalizeStage(row.stage);
  return null;
}

function rowMatches(row, rule) {
  const actual = rowValue(row, rule.field);
  const norm   = v => (rule.field === 'stage' ? normalizeStage(v) : v);
  const wanted = (Array.isArray(rule.value) ? rule.value : [rule.value]).map(norm);
  switch (rule.operator) {
    case 'is':        return actual === wanted[0];
    case 'is_not':    return actual !== wanted[0];
    case 'is_any_of': return wanted.includes(actual);
    default:          return true;   // an operator that makes no sense here filters nothing
  }
}

/** Does this board row survive every row-level filter on the widget? */
export function rowPassesFilters(row, filters) {
  return (filters || [])
    .filter(f => ROW_FILTER_FIELDS.has(f.field))
    .every(f => rowMatches(row, f));
}

// Service type used to be offered on the filter panel in a spelling the database
// has never held (FULL_SERVICE_DESIGN and friends). Charts saved with one of
// those matched nothing at all. Translate them on the way in so an existing saved
// chart starts working instead of silently staying empty.
const LEGACY_SERVICE_TYPE = {
  FULL_SERVICE_DESIGN: 'fullDesign',
  DESIGN_ASSIST:       'designAssist',
  PEER_REVIEW:         'peerReview',
  BID_ONLY:            'bidOnly',
};

// Which board a job sits on is derived, not stored: every project sells product,
// so Procurement is all of them, and Design is the ones whose service type puts
// them on that board. This filter was being thrown away, which is why the seeded
// "Design Fee Forecast" was quietly charting every job in the company.
//
// This is only a head start for the database — it fetches no more jobs than the
// chart could possibly need. The actual narrowing to one board happens in
// rowPassesFilters() after each job has been split into its rows, which is the
// only place that can tell a job's Design row from its Procurement row.
function pipelineWhere(rule) {
  if (rule.operator !== 'is' && rule.operator !== 'is_any_of') return {};
  const picked = Array.isArray(rule.value) ? rule.value : [rule.value];
  if (picked.includes('DESIGN') && !picked.includes('PROCUREMENT')) {
    // Peer Reviews ride along when they carry a design fee (Maram 9-17); the
    // per-row check in boardRows() is what finally decides, this only pre-narrows.
    return { OR: [
      { serviceType: { in: DESIGN_SERVICE_TYPES } },
      { serviceType: { in: FEE_OPTIONAL_DESIGN_TYPES }, designContractValue: { gt: 0 } },
    ] };
  }
  return {}; // Procurement (or both) — no narrowing, every project is on that board
}

function filterToWhere(rule) {
  if (DROP_FILTER_FIELDS.has(rule.field)) return {};
  if (rule.field === 'pipeline') return pipelineWhere(rule);
  // Status and stage belong to a board row; they are matched after expansion.
  if (ROW_FILTER_FIELDS.has(rule.field)) return {};
  const field = FIELD_MAP[rule.field] || rule.field;
  const { operator } = rule;
  const value = field === 'serviceType'
    ? (Array.isArray(rule.value)
        ? rule.value.map(v => LEGACY_SERVICE_TYPE[v] || v)
        : (LEGACY_SERVICE_TYPE[rule.value] || rule.value))
    : rule.value;

  if (DATE_FIELDS.has(field)) {
    let range = typeof value === 'string' ? resolveRelativeDate(value) : null;
    if (!range && value && typeof value === 'object' && value.gte) {
      range = { gte: new Date(value.gte), lte: new Date(value.lte) };
    }
    if (!range) return {};
    switch (operator) {
      case 'is':     return { [field]: range };
      case 'before': return { [field]: { lte: range.gte } };
      case 'after':  return { [field]: { gte: range.lte } };
      default:       return { [field]: range };
    }
  }

  if (NUMERIC_FIELDS.has(field)) {
    const num = Number(value);
    switch (operator) {
      case 'eq':      return { [field]: num };
      case 'neq':     return { NOT: { [field]: num } };
      case 'gte':     return { [field]: { gte: num } };
      case 'lte':     return { [field]: { lte: num } };
      case 'between': return { [field]: { gte: Number(value[0]), lte: Number(value[1]) } };
      default:        return {};
    }
  }

  switch (operator) {
    case 'is':        return { [field]: value };
    case 'is_not':    return { NOT: { [field]: value } };
    case 'is_any_of': return { [field]: { in: Array.isArray(value) ? value : [value] } };
    case 'contains':  return { [field]: { contains: value, mode: 'insensitive' } };
    default:          return {};
  }
}

export function filtersToWhere(filters) {
  if (!filters?.length) return {};
  const clauses = filters.map(filterToWhere).filter(c => Object.keys(c).length > 0);
  if (!clauses.length)  return {};
  if (clauses.length === 1) return clauses[0];
  return { AND: clauses };
}

// ── Grouping helpers ───────────────────────────────────────────────────────

function probabilityTier(p) {
  if (p >= 80) return '80–100%';
  if (p >= 50) return '50–79%';
  if (p >= 25) return '25–49%';
  return '0–24%';
}

const PROB_TIER_ORDER = ['80–100%', '50–79%', '25–49%', '0–24%'];

// Every bar, slice and legend entry reads in plain English. These used to come
// back as the stored value, so a chart grouped by stage said "PRECONSTRUCTION"
// and one grouped by service type said "fullDesign". The names come from the
// same vocabulary the boards use (pipeline.js), so a rename lands on the charts
// too — this file used to keep its own copy of the board names.

function getDealKey(deal, viewBy) {
  switch (viewBy) {
    case 'month':           return deal.expectedOrderDate ? fmtMonthYear(new Date(deal.expectedOrderDate)) : 'No Date';
    case 'quarter':         return deal.expectedOrderDate ? quarter(new Date(deal.expectedOrderDate)) : 'No Date';
    case 'client':          return deal.client?.name || 'Unassigned';
    case 'owner':           return deal.owner?.name  || 'Unassigned';
    case 'stage':           return STAGE_LABEL[deal.stage] || deal.stage || 'Unknown';
    case 'projectType':     return deal.projectType ? projectTypeLabel(deal.projectType) : 'Unknown';
    case 'serviceType':     return deal.serviceType ? serviceTypeLabel(deal.serviceType) : 'Unknown';
    // Splitting a chart by Deal Status was landing every deal in one "Unknown"
    // bucket — the status was never read here at all.
    case 'dealStatus':      return STATUS_LABEL[deal.dealStatus] || deal.dealStatus || 'Unknown';
    case 'probabilityTier': return probabilityTier(deal.probability);
    case 'state':           return deal.state        || 'Unknown';
    case 'pipeline':        return PIPELINE_LABEL[deal.pipeline] || deal.pipeline || 'Unknown';
    // 'lostReason' used to live here. A lost deal now carries a written reason on
    // the project rather than a code picked from a list, so there is nothing to
    // group by; an old chart set to it falls through to a single bucket below.
    default:                return 'Unknown';
  }
}

function getSegmentKey(deal, segmentBy) {
  if (!segmentBy) return '_total';
  return getDealKey(deal, segmentBy);
}

function generateTimeLabels(deals, viewBy) {
  const dates = deals.filter(d => d.expectedOrderDate).map(d => new Date(d.expectedOrderDate));
  if (!dates.length) return [];
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  if (viewBy === 'month')   return eachMonth(min, max).map(fmtMonthYear);
  if (viewBy === 'quarter') return eachQuarter(min, max).map(quarter);
  return null;
}

// ── Counting jobs vs counting rows ─────────────────────────────────────────
// Two honest numbers, and they are meant to differ. "Rows" is how many deals are
// in play across the boards; "jobs" is how many actual projects those came from,
// counted once each. A full-design job is one job and two deals.
function countJobs(deals) {
  return new Set(deals.map(d => d.id)).size;
}

// Mike, 2026-09-08: "We need to always break out deals won to design deals won
// and procurement deals won." So every widget that reports wins reports both,
// never a single merged figure.
function wonByBoard(deals, revenueOf) {
  const out = { total: 0, totalRevenue: 0 };
  for (const key of PIPELINE_KEYS) out[key] = { count: 0, revenue: 0, label: PIPELINE_LABEL[key] };
  for (const deal of deals) {
    if (!WON_STATUSES.includes(deal.dealStatus)) continue;
    const bucket = out[deal.pipeline];
    if (!bucket) continue;
    const money = revenueOf ? revenueOf(deal) : (deal.revenue || 0);
    bucket.count += 1;
    bucket.revenue += money;
    out.total += 1;
    out.totalRevenue += money;
  }
  return out;
}

// ── Main run function ──────────────────────────────────────────────────────

export async function runWidget(widget, db) {
  const filters = typeof widget.filters === 'string'
    ? JSON.parse(widget.filters)
    : (widget.filters || []);

  // Sales-activity categories query their own models, not Deal.
  if (widget.category === 'SALES_ACTIVITY') return runSalesActivity(widget, db, filters);
  if (widget.category === 'PROPOSALS')      return runProposals(widget, db, filters);

  const where = filtersToWhere(filters);

  // The pipeline now lives on Project (Deal merged in). Query projects and shape
  // each into the deal-like object the grouping/metric logic below expects.
  const rawProjects = await db.project.findMany({
    where,
    include: {
      client:     { select: { id: true, name: true } },
      salesOwner: { select: { id: true, name: true } },
    },
  });

  // ── One job → one row per board ────────────────────────────────────────────
  // Mike, 2026-09-08: "It counts once, but shows on 2 dashboards. Each dashboard
  // only cares about product sales (PROCUREMENT) or design fees (DESIGN)."
  //
  // So a full-design job produces two rows here: a Procurement row worth the
  // product sale and a Design row worth the design fee. Each carries its own
  // stage and its own status, because the two really do move and close apart.
  // A chart filtered to one board sees exactly one of them; a chart left on both
  // sees both, and the un-split sum of the two IS that job's combined revenue.
  const deals = [];
  for (const p of rawProjects) {
    for (const row of boardRows(p)) {
      if (!rowPassesFilters(row, filters)) continue;
      deals.push({
        ...p,
        owner:           p.salesOwner,
        pipeline:        row.pipeline,
        stage:           row.stage,
        dealStatus:      row.status,
        probability:     averageProbability(p),
        revenue:         row.revenue,            // this board's money, and only this board's
        totalRevenue:    p.contractValue,        // product sales on the whole job
        designFeeTotal:  p.designContractValue,  // design fee on the whole job
        combinedRevenue: combinedRevenue(p),     // Mike's item 3 — the two added up
        lostReason:      null,
      });
    }
  }

  const { category, metric, viewBy, segmentBy } = widget;

  // REVENUE / FORECAST
  if (category === 'REVENUE' || category === 'FORECAST') {
    // Each row is worth what its own board is worth. A widget that names design
    // fees zeroes the Procurement rows so a chart left on both boards still says
    // "design fees" honestly rather than quietly adding product sales in.
    const revenueOf = deal => (metric === 'designFee' && deal.pipeline !== 'DESIGN')
      ? 0
      : (deal.revenue || 0);
    const map = {};

    for (const deal of deals) {
      const key = getDealKey(deal, viewBy);
      const seg = getSegmentKey(deal, segmentBy);
      const val = metric === 'weighted_value'
        ? revenueOf(deal) * ((deal.probability || 0) / 100)
        : revenueOf(deal);
      if (!map[key]) map[key] = {};
      map[key][seg] = (map[key][seg] || 0) + val;
    }

    const timeLabels = (viewBy === 'month' || viewBy === 'quarter')
      ? generateTimeLabels(deals, viewBy) : null;
    const labelSet  = timeLabels || Object.keys(map);
    const segments  = [...new Set(deals.map(d => getSegmentKey(d, segmentBy)))].sort();
    const series    = labelSet.map(label => {
      const row = { label };
      for (const seg of segments) row[seg] = map[label]?.[seg] || 0;
      return row;
    });

    const totalOpen = deals.filter(d => d.dealStatus === 'OPEN')
      .reduce((s, d) => s + revenueOf(d), 0);
    const totalWon  = deals.filter(d => WON_STATUSES.includes(d.dealStatus))
      .reduce((s, d) => s + revenueOf(d), 0);
    return { category, metric, viewBy, segmentBy, segments, series,
      meta: { totalOpen, totalWon, dealCount: deals.length,
        jobCount: countJobs(deals), won: wonByBoard(deals, revenueOf) } };
  }

  // DEAL_COUNT
  if (category === 'DEAL_COUNT') {
    const map = {};
    for (const deal of deals) {
      const key = getDealKey(deal, viewBy);
      const seg = getSegmentKey(deal, segmentBy);
      if (!map[key]) map[key] = {};
      map[key][seg] = (map[key][seg] || 0) + 1;
    }
    const labelOrder = viewBy === 'probabilityTier' ? PROB_TIER_ORDER : null;
    let labels = labelOrder || Object.keys(map);
    if (!labelOrder && viewBy !== 'month' && viewBy !== 'quarter') {
      labels = labels.sort((a,b) => {
        const ta = Object.values(map[a]||{}).reduce((s,v)=>s+v,0);
        const tb = Object.values(map[b]||{}).reduce((s,v)=>s+v,0);
        return tb - ta;
      });
    }
    const segments = [...new Set(deals.map(d => getSegmentKey(d, segmentBy)))].sort();
    const series   = labels.filter(l => map[l]).map(label => {
      const row = { label };
      for (const seg of segments) row[seg] = map[label]?.[seg] || 0;
      return row;
    });
    return { category, metric, viewBy, segmentBy, segments, series,
      meta: { dealCount: deals.length, jobCount: countJobs(deals), won: wonByBoard(deals) } };
  }

  // CONVERSION
  if (category === 'CONVERSION') {
    // One win-rate definition, the one in pipeline.js: won ÷ everything past
    // Open. A COMPLETED job was won and then delivered, so finishing the work
    // must not lower the rate, and an abandoned deal is a deal that did not
    // land. This branch used to count only WON over WON+LOST, which is why the
    // dashboard and the CRM stats bar could show two different win rates.
    const decided = d => DECIDED_STATUSES.includes(d.dealStatus);
    const map = {};
    for (const deal of deals) {
      const key = getDealKey(deal, viewBy);
      if (!map[key]) map[key] = { won:0, lost:0, total:0 };
      if (!decided(deal)) continue;
      map[key].total++;
      if (WON_STATUSES.includes(deal.dealStatus)) map[key].won++;
      else                                        map[key].lost++;
    }
    const labels = Object.keys(map).sort((a,b) => {
      const ra = map[a].total > 0 ? map[a].won/map[a].total : 0;
      const rb = map[b].total > 0 ? map[b].won/map[b].total : 0;
      return rb - ra;
    });
    const series = labels.map(label => ({
      label,
      won:     map[label].won,
      lost:    map[label].lost,
      total:   map[label].total,
      winRate: map[label].total > 0 ? Math.round((map[label].won/map[label].total)*100) : 0,
    }));
    const won       = wonByBoard(deals);
    const totalWon  = won.total;
    const totalLost = deals.filter(d => decided(d) && !WON_STATUSES.includes(d.dealStatus)).length;
    const overallRate = (totalWon+totalLost) > 0 ? Math.round((totalWon/(totalWon+totalLost))*100) : 0;
    return { category, metric, viewBy, segmentBy: null, segments: ['won','lost'],
      series, meta: { totalWon, totalLost, overallRate, won,
        dealCount: deals.length, jobCount: countJobs(deals) } };
  }

  // DURATION — how long a deal took, board by board
  //
  // This chart was always empty: it read deal.wonAt / deal.lostAt, and neither
  // column has ever existed. The dates now come from ProjectStatusEvent, which
  // records the day a deal was created and every day its status changed.
  //
  // Rows the 0069 backfill had to invent from updatedAt are marked approximated
  // and are excluded here on purpose. The 0061 lesson is that a guessed date,
  // once stored, is indistinguishable from a real one — so rather than publish
  // an average built on the day somebody last edited a record, the chart says
  // how many closed deals it had to leave out.
  if (category === 'DURATION') {
    const events = rawProjects.length ? await db.projectStatusEvent.findMany({
      where: { projectId: { in: rawProjects.map(p => p.id) }, approximated: false },
      orderBy: { changedAt: 'asc' },
      select: { projectId: true, pipeline: true, toStatus: true, changedAt: true },
    }) : [];
    const history = new Map();
    for (const e of events) {
      const k = `${e.projectId}|${e.pipeline}`;
      if (!history.has(k)) history.set(k, []);
      history.get(k).push(e);
    }

    const map = {};
    let closedWithoutDate = 0;
    let measured = 0;
    for (const deal of deals) {
      if (!DECIDED_STATUSES.includes(deal.dealStatus)) continue;   // still open — no duration yet
      const board   = history.get(`${deal.id}|${deal.pipeline}`) || [];
      const closing = [...board].reverse().find(e => DECIDED_STATUSES.includes(e.toStatus));
      if (!closing) { closedWithoutDate++; continue; }
      const openedAt = board.find(e => e.toStatus === 'OPEN')?.changedAt ?? deal.createdAt;
      const days = Math.max(0, Math.round((new Date(closing.changedAt) - new Date(openedAt)) / 86400000));
      const key  = getDealKey(deal, viewBy);
      const seg  = getSegmentKey(deal, segmentBy);
      if (!map[key])      map[key] = {};
      if (!map[key][seg]) map[key][seg] = [];
      map[key][seg].push(days);
      measured++;
    }
    const labels   = Object.keys(map).sort();
    const segments = [...new Set(Object.values(map).flatMap(s => Object.keys(s)))].sort();
    const series   = labels.map(label => {
      const row = { label };
      for (const seg of segments) {
        const vals = map[label]?.[seg] || [];
        row[seg] = vals.length ? Math.round(vals.reduce((s,v)=>s+v,0)/vals.length) : 0;
      }
      return row;
    });
    return { category, metric, viewBy, segmentBy, segments, series,
      meta: { dealCount: measured, closedWithoutDate,
        jobCount: countJobs(deals), won: wonByBoard(deals) } };
  }

  return { category, metric, viewBy, segmentBy, segments:[], series:[], meta:{ dealCount:0 } };
}

// ── Sales-activity helpers ─────────────────────────────────────────────────

function relDateFromFilters(filters, fields) {
  const f = (filters || []).find(x => fields.includes(x.field));
  if (!f) return null;
  if (typeof f.value === 'string') return resolveRelativeDate(f.value);
  if (f.value && f.value.gte) return { gte: new Date(f.value.gte), lte: new Date(f.value.lte) };
  return null;
}

function timeLabelsFromDates(dates, viewBy) {
  if (!dates.length) return [];
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  if (viewBy === 'quarter') return eachQuarter(min, max).map(quarter);
  return eachMonth(min, max).map(fmtMonthYear);
}

// ── SALES_ACTIVITY — counts sales Note rows (meetings, in-person, unique clients) ──

async function runSalesActivity(widget, db, filters) {
  const { metric, viewBy } = widget;
  const range = relDateFromFilters(filters, ['meetingDate', 'createdAt', 'date']);

  let notes = await db.note.findMany({
    where: { noteType: 'SALES' },
    include: {
      createdBy: { select: { id: true, name: true } },
      clients:   { include: { client: { select: { id: true, name: true } } } },
    },
  });

  const effDate = n => (n.meetingDate ? new Date(n.meetingDate) : new Date(n.createdAt));
  if (range) notes = notes.filter(n => { const d = effDate(n); return d >= range.gte && d <= range.lte; });
  if (metric === 'in_person') notes = notes.filter(n => n.isInPerson);

  const bucketKeysFor = (n) => {
    const d = effDate(n);
    switch (viewBy) {
      case 'month':        return [fmtMonthYear(d)];
      case 'quarter':      return [quarter(d)];
      case 'rep':          return [n.createdBy?.name || 'Unassigned'];
      case 'activityType': return [n.activityType || 'Untagged'];
      case 'organization': {
        const orgs = (n.clients || []).map(c => c.client?.name).filter(Boolean);
        return orgs.length ? orgs : ['Unlinked'];
      }
      default:             return ['All'];
    }
  };

  const map = {};          // key -> count
  const clientSets = {};   // key -> Set of client ids (unique_clients metric)
  for (const n of notes) {
    for (const key of bucketKeysFor(n)) {
      if (metric === 'unique_clients') {
        if (!clientSets[key]) clientSets[key] = new Set();
        (n.clients || []).forEach(c => c.client?.id && clientSets[key].add(c.client.id));
      } else {
        map[key] = (map[key] || 0) + 1;
      }
    }
  }

  const valOf = label => metric === 'unique_clients' ? (clientSets[label]?.size || 0) : (map[label] || 0);

  let labels;
  if (viewBy === 'month' || viewBy === 'quarter') {
    labels = timeLabelsFromDates(notes.map(effDate), viewBy);
  } else {
    labels = Object.keys(metric === 'unique_clients' ? clientSets : map).sort((a, b) => valOf(b) - valOf(a));
  }

  const series = labels.map(label => ({ label, _total: valOf(label) }));

  const inPerson = notes.filter(n => n.isInPerson).length;
  const uniqueClients = new Set(
    notes.flatMap(n => (n.clients || []).map(c => c.client?.id).filter(Boolean))
  ).size;

  return {
    category: 'SALES_ACTIVITY', metric, viewBy, segmentBy: null,
    segments: ['_total'], series,
    meta: { totalActivities: notes.length, inPerson, uniqueClients },
  };
}

// ── PROPOSALS — counts/sums Proposal rows (sent, accepted, value, acceptance rate) ──

async function runProposals(widget, db, filters) {
  const { metric, viewBy } = widget;
  const range = relDateFromFilters(filters, ['createdAt', 'sentAt', 'date']);

  let proposals = await db.proposal.findMany({
    include: { createdBy: { select: { id: true, name: true } } },
  });

  const refDate = p => {
    if (metric === 'accepted') return p.acceptedAt ? new Date(p.acceptedAt) : new Date(p.createdAt);
    if (metric === 'sent')     return p.sentAt     ? new Date(p.sentAt)     : new Date(p.createdAt);
    return new Date(p.createdAt);
  };

  if (range) proposals = proposals.filter(p => { const d = refDate(p); return d >= range.gte && d <= range.lte; });

  const isSent     = p => !!p.sentAt || ['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'].includes(p.status);
  const isAccepted = p => p.status === 'ACCEPTED' || !!p.acceptedAt;
  const feeOf      = p => (p.overrideActive && p.overrideFee != null ? p.overrideFee : (p.calculatedFee || 0));

  const keyFor = p => {
    const d = refDate(p);
    switch (viewBy) {
      case 'month':        return fmtMonthYear(d);
      case 'quarter':      return quarter(d);
      case 'rep':          return p.createdBy?.name || 'Unassigned';
      case 'organization': return p.clientName || 'Unknown';
      case 'status':       return p.status || 'DRAFT';
      case 'type':         return p.type || 'Unknown';
      default:             return 'All';
    }
  };

  const map = {};
  let pool = proposals;

  if (metric === 'acceptance_rate') {
    const acc = {}, sent = {};
    for (const p of proposals) {
      const k = keyFor(p);
      if (isSent(p))     sent[k] = (sent[k] || 0) + 1;
      if (isAccepted(p)) acc[k]  = (acc[k]  || 0) + 1;
    }
    for (const k of Object.keys(sent)) map[k] = sent[k] ? Math.round(((acc[k] || 0) / sent[k]) * 100) : 0;
  } else {
    if (metric === 'sent')     pool = proposals.filter(isSent);
    if (metric === 'accepted' || metric === 'value') pool = proposals.filter(isAccepted);
    for (const p of pool) {
      const k = keyFor(p);
      map[k] = (map[k] || 0) + (metric === 'value' ? feeOf(p) : 1);
    }
  }

  let labels;
  if (viewBy === 'month' || viewBy === 'quarter') {
    const dates = (metric === 'acceptance_rate' ? proposals : pool).map(refDate);
    labels = dates.length ? timeLabelsFromDates(dates, viewBy) : Object.keys(map);
  } else {
    labels = Object.keys(map).sort((a, b) => (map[b] || 0) - (map[a] || 0));
  }

  const series = labels.map(label => ({ label, _total: map[label] || 0 }));

  const sentCount     = proposals.filter(isSent).length;
  const acceptedCount = proposals.filter(isAccepted).length;
  const acceptedValue = proposals.filter(isAccepted).reduce((s, p) => s + feeOf(p), 0);
  const rate          = sentCount ? Math.round((acceptedCount / sentCount) * 100) : 0;

  return {
    category: 'PROPOSALS', metric, viewBy, segmentBy: null,
    segments: ['_total'], series,
    meta: { sentCount, acceptedCount, acceptedValue, rate },
  };
}

// Internals reached by the test suite only (scripts/tests/dashboardFilters.test.mjs).
// Nothing in the app imports this.
export const __testing = { getDealKey, probabilityTier, countJobs, wonByBoard };
