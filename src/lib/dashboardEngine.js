/**
 * Dashboard query engine — zero external dependencies, native JS dates only.
 * Translates a DashboardWidget config into Prisma queries and returns chart-ready data.
 */

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

const DATE_FIELDS    = new Set(['expectedOrderDate','createdAt','wonAt','lostAt','nextActionDue']);
const NUMERIC_FIELDS = new Set(['probability','totalRevenue','designFeeTotal','numberOfUnits']);

function filterToWhere(rule) {
  const { field, operator, value } = rule;

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

function getDealKey(deal, viewBy) {
  switch (viewBy) {
    case 'month':           return deal.expectedOrderDate ? fmtMonthYear(new Date(deal.expectedOrderDate)) : 'No Date';
    case 'quarter':         return deal.expectedOrderDate ? quarter(new Date(deal.expectedOrderDate)) : 'No Date';
    case 'client':          return deal.client?.name || 'Unassigned';
    case 'owner':           return deal.owner?.name  || 'Unassigned';
    case 'stage':           return deal.stage        || 'Unknown';
    case 'projectType':     return deal.projectType  || 'Unknown';
    case 'serviceType':     return deal.serviceType  || 'Unknown';
    case 'probabilityTier': return probabilityTier(deal.probability);
    case 'lostReason':      return deal.lostReason   || 'Unknown';
    case 'state':           return deal.state        || 'Unknown';
    case 'pipeline':        return deal.pipeline     || 'Unknown';
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

// ── Main run function ──────────────────────────────────────────────────────

export async function runWidget(widget, db) {
  const filters = typeof widget.filters === 'string'
    ? JSON.parse(widget.filters)
    : (widget.filters || []);

  const where = filtersToWhere(filters);

  const deals = await db.deal.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      owner:  { select: { id: true, name: true } },
    },
  });

  const { category, metric, viewBy, segmentBy } = widget;

  // REVENUE / FORECAST
  if (category === 'REVENUE' || category === 'FORECAST') {
    const revenueField = metric === 'designFee' ? 'designFeeTotal' : 'totalRevenue';
    const map = {};

    for (const deal of deals) {
      const key = getDealKey(deal, viewBy);
      const seg = getSegmentKey(deal, segmentBy);
      const val = metric === 'weighted_value'
        ? (deal[revenueField] || 0) * (deal.probability / 100)
        : (deal[revenueField] || 0);
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

    const totalOpen = deals.filter(d => d.dealStatus === 'OPEN').reduce((s,d) => s + (d[revenueField]||0), 0);
    const totalWon  = deals.filter(d => d.dealStatus === 'WON').reduce((s,d)  => s + (d[revenueField]||0), 0);
    return { category, metric, viewBy, segmentBy, segments, series,
      meta: { totalOpen, totalWon, dealCount: deals.length } };
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
      meta: { dealCount: deals.length } };
  }

  // CONVERSION
  if (category === 'CONVERSION') {
    const map = {};
    for (const deal of deals) {
      const key = getDealKey(deal, viewBy);
      if (!map[key]) map[key] = { won:0, lost:0, total:0 };
      map[key].total++;
      if (deal.dealStatus === 'WON')  map[key].won++;
      if (deal.dealStatus === 'LOST') map[key].lost++;
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
    const totalWon  = deals.filter(d => d.dealStatus === 'WON').length;
    const totalLost = deals.filter(d => d.dealStatus === 'LOST').length;
    const overallRate = (totalWon+totalLost) > 0 ? Math.round((totalWon/(totalWon+totalLost))*100) : 0;
    return { category, metric, viewBy, segmentBy: null, segments: ['won','lost'],
      series, meta: { totalWon, totalLost, overallRate, dealCount: deals.length } };
  }

  // DURATION
  if (category === 'DURATION') {
    const map = {};
    for (const deal of deals) {
      if (!deal.wonAt && !deal.lostAt) continue;
      const closed = deal.wonAt || deal.lostAt;
      const days   = Math.round((new Date(closed) - new Date(deal.createdAt)) / 86400000);
      const key    = getDealKey(deal, viewBy);
      const seg    = getSegmentKey(deal, segmentBy);
      if (!map[key])       map[key] = {};
      if (!map[key][seg])  map[key][seg] = [];
      map[key][seg].push(days);
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
      meta: { dealCount: deals.length } };
  }

  return { category, metric, viewBy, segmentBy, segments:[], series:[], meta:{ dealCount:0 } };
}
