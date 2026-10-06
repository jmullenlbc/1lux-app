// Field-picker widget engine. Turns a widget's dataSpec + section rows into a
// chart-ready { chartType, series:[{label,value}] }. Deterministic, no LLM.
//
// Legacy category/metric widgets still run through src/lib/dashboardEngine.js;
// this handles the new field-picker widgets. Both coexist during the migration.

import { readField, fieldByKey } from './fieldCatalog.js';
import { evalGroup } from './formula.js';

// ── Global filters (applied in JS on shaped rows) ─────────────────────────────
// filter: { field: <catalog key>, op: 'is'|'is_not'|'gte'|'lte'|'contains', value }
export function applyFilters(rows, section, filters = []) {
  if (!filters.length) return rows;
  return rows.filter(row => filters.every(f => {
    const field = fieldByKey(section, f.field);
    if (!field) return true;
    const v = readField(row, field.source);
    switch (f.op) {
      case 'is':       return String(v ?? '') === String(f.value);
      case 'is_not':   return String(v ?? '') !== String(f.value);
      case 'in':       return (Array.isArray(f.value) ? f.value : [f.value]).map(String).includes(String(v ?? ''));
      case 'gte':      return Number(v) >= Number(f.value);
      case 'lte':      return Number(v) <= Number(f.value);
      case 'contains': return String(v ?? '').toLowerCase().includes(String(f.value).toLowerCase());
      default:         return true;
    }
  }));
}

// ── Time bucketing for date group-bys ─────────────────────────────────────────
function pad(n) { return n < 10 ? '0' + n : String(n); }
function timeKey(dateVal, bucket) {
  if (!dateVal) return { key: '~none', label: 'No date', sort: Infinity };
  const d = new Date(dateVal);
  if (isNaN(d)) return { key: '~none', label: 'No date', sort: Infinity };
  const y = d.getFullYear();
  if (bucket === 'week') {
    const onejan = new Date(y, 0, 1);
    const wk = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return { key: `${y}-W${pad(wk)}`, label: `W${wk} ${y}`, sort: y * 100 + wk };
  }
  if (bucket === 'quarter') {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${y}`, sort: y * 10 + q };
  }
  if (bucket === 'year') {
    return { key: `${y}`, label: `${y}`, sort: y };
  }
  // month (default)
  const m = d.getMonth();
  return { key: `${y}-${pad(m + 1)}`, label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }), sort: y * 100 + m };
}

// ── Date windows (Year-to-Date / Custom range / next N months) ───────────────
// Forward-looking windows, in months, keyed by the timeBucket value.
export const NEXT_MONTHS = { next12: 12, next6: 6 };
function dateWindow(bucket, spec) {
  if (bucket === 'ytd') {
    const now = new Date();
    return { start: new Date(now.getFullYear(), 0, 1), end: now };
  }
  if (NEXT_MONTHS[bucket]) {
    // This month plus the ones after it: next12 is Maram's "next 12 months"
    // forecast, next6 is Jason's "won, not yet ordered" window (Oct 5 call).
    const n = NEXT_MONTHS[bucket];
    const now = new Date();
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + n, 0, 23, 59, 59) };
  }
  // custom
  return {
    start: spec.customStart ? new Date(spec.customStart) : null,
    end:   spec.customEnd   ? new Date(`${spec.customEnd}T23:59:59`) : null,
  };
}

// ── Numeric bucketing for range dimensions (e.g. probability tiers) ───────────
function bucketKey(val, buckets = []) {
  const n = Number(val);
  if (!Number.isFinite(n)) return { key: '~none', label: 'No value', sort: Infinity };
  for (let i = 0; i < buckets.length; i++) {
    if (n <= buckets[i].max) return { key: buckets[i].label, label: buckets[i].label, sort: i };
  }
  const last = buckets[buckets.length - 1];
  return last ? { key: last.label, label: last.label, sort: buckets.length - 1 } : { key: String(n), label: String(n), sort: n };
}

// ── Run one field-picker widget ───────────────────────────────────────────────
export function runFieldWidget(widget, rows, section, globalFilters = []) {
  let spec = {};
  try { spec = typeof widget.dataSpec === 'string' ? JSON.parse(widget.dataSpec || '{}') : (widget.dataSpec || {}); } catch {}

  let filtered = applyFilters(rows, section, [...(globalFilters || []), ...(spec.filters || [])]);
  const dim = spec.groupBy ? fieldByKey(section, spec.groupBy) : null;

  // Year-to-Date / Custom-Range are date-window modes: restrict to the window,
  // then bucket by month. (Plain week/month/quarter/year just bucket.)
  const bucket = spec.timeBucket || 'month';
  const windowed = bucket === 'ytd' || bucket === 'custom' || !!NEXT_MONTHS[bucket];
  const win = (dim?.type === 'date' && windowed) ? dateWindow(bucket, spec) : null;
  if (win) {
    filtered = filtered.filter(r => {
      const v = readField(r, dim.source); if (!v) return false;
      const d = new Date(v); if (isNaN(d)) return false;
      if (win.start && d < win.start) return false;
      if (win.end && d > win.end) return false;
      return true;
    });
  }
  const effBucket = windowed ? 'month' : bucket;

  // Group rows
  const groups = new Map(); // key -> { label, sort, rows }
  // A forecast shows every month in the window, $0 ones included, so a gap
  // reads as "nothing ordering then" rather than a missing bar.
  if (win && NEXT_MONTHS[bucket]) {
    for (let i = 0; i < NEXT_MONTHS[bucket]; i++) {
      const g = timeKey(new Date(win.start.getFullYear(), win.start.getMonth() + i, 15), 'month');
      groups.set(g.key, { label: g.label, sort: g.sort, rows: [] });
    }
  }
  for (const row of filtered) {
    let g = { key: '_total', label: 'Total', sort: 0 };
    if (dim) {
      if (dim.type === 'date')        g = timeKey(readField(row, dim.source), effBucket);
      else if (dim.type === 'bucket') g = bucketKey(readField(row, dim.source), dim.buckets);
      else { const raw = readField(row, dim.source); const rawKey = raw == null || raw === '' ? 'Unassigned' : String(raw); const label = raw == null || raw === '' ? 'Unassigned' : (dim.valueLabels?.[rawKey] || rawKey); g = { key: rawKey, label, sort: 0 }; }
    }
    if (!groups.has(g.key)) groups.set(g.key, { label: g.label, sort: g.sort, rows: [] });
    groups.get(g.key).rows.push(row);
  }

  let series = [...groups.values()].map(g => ({ label: g.label, sort: g.sort, value: evalGroup(g.rows, section, spec) }));
  // Ordered dimensions (dates, numeric buckets) sort by their natural order; everything else by value.
  if (dim?.type === 'date' || dim?.type === 'bucket') series.sort((a, b) => a.sort - b.sort);
  else series.sort((a, b) => b.value - a.value);
  // hideZero drops empty groups (e.g. every client with nothing On Hold).
  if (spec.hideZero && dim?.type !== 'date') series = series.filter(s => s.value);
  // Running total — each bar is everything up to and including that period.
  if (spec.cumulative && dim?.type === 'date') {
    let run = 0;
    series = series.map(s => (s.sort === Infinity ? s : { ...s, value: (run += s.value) }));
  }

  return { chartType: widget.chartType || 'BAR', series: series.map(({ label, value }) => ({ label, value })) };
}
