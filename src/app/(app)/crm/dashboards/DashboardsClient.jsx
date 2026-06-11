'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';

// ── Colour palette ─────────────────────────────────────────────────────────

const PALETTE = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
];

const STATUS_COLORS = {
  OPEN: '#3b82f6',
  WON:  '#10b981',
  LOST: '#ef4444',
  ABANDONED: '#94a3b8',
  ON_HOLD: '#f59e0b',
};

const PIPELINE_COLORS = {
  PROCUREMENT: '#3b82f6',
  DESIGN: '#8b5cf6',
};

function segmentColor(seg, idx) {
  if (STATUS_COLORS[seg]) return STATUS_COLORS[seg];
  if (PIPELINE_COLORS[seg]) return PIPELINE_COLORS[seg];
  return PALETTE[idx % PALETTE.length];
}

// ── Number formatters ──────────────────────────────────────────────────────

function fmtDollar(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtDollarFull(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-emerald-50 text-emerald-700',
    red:    'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
    amber:  'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-lg px-4 py-3 ${colors[color]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-lg font-bold leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, isRevenue, isDuration }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[140px]">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-slate-500">{p.name}</span>
          </span>
          <span className="font-semibold text-slate-800">
            {isDuration ? `${p.value}d` : isRevenue ? fmtDollarFull(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Widget chart renderer ──────────────────────────────────────────────────

function WidgetChart({ data }) {
  if (!data) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading…</div>;
  if (!data.series?.length) return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">No data for this period</div>
  );

  const { category, metric, segmentBy, segments, series } = data;
  const isRevenue  = category === 'REVENUE' || category === 'FORECAST' || (category === 'PROPOSALS' && metric === 'value');
  const isDuration = category === 'DURATION';
  const isPercent  = category === 'PROPOSALS' && metric === 'acceptance_rate';

  // CONVERSION — horizontal bar showing win rate %
  if (category === 'CONVERSION') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`}
            tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={100}
            tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(v, name) => [`${v}%`, name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <Bar dataKey="winRate" name="Win Rate" radius={[0, 4, 4, 0]}>
            {series.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // All other categories — vertical grouped/stacked bar chart
  const useStacked = segmentBy && segments.length > 1;
  const segList = segments.filter(s => s !== '_total');
  const showSingle = !segmentBy || segList.length === 0;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={series} margin={{ left: 8, right: 8, top: 4, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
          angle={series.length > 6 ? -35 : 0} textAnchor={series.length > 6 ? 'end' : 'middle'}
          interval={0} height={series.length > 6 ? 48 : 20} />
        <YAxis tickFormatter={isRevenue ? fmtDollar : isDuration ? v => `${v}d` : isPercent ? v => `${v}%` : undefined}
          tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<CustomTooltip isRevenue={isRevenue} isDuration={isDuration} />} />
        {(showSingle ? ['_total'] : segList).length > 1 && (
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        )}
        {showSingle ? (
          <Bar dataKey="_total" name="Total" stackId={useStacked ? 'a' : undefined} radius={[3, 3, 0, 0]}>
            {series.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        ) : (
          segList.map((seg, i) => (
            <Bar key={seg} dataKey={seg} name={seg} stackId={useStacked ? 'a' : undefined}
              fill={segmentColor(seg, i)}
              radius={useStacked && i === segList.length - 1 ? [3, 3, 0, 0] : undefined} />
          ))
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Widget stat strip ──────────────────────────────────────────────────────

function WidgetStats({ data, widget }) {
  if (!data?.meta) return null;
  const { meta, category } = data;

  if (category === 'REVENUE' || category === 'FORECAST') {
    const isDesignFee = widget.metric === 'designFee';
    return (
      <div className="flex gap-3 flex-wrap mb-3">
        <StatCard label="Open" value={fmtDollar(meta.totalOpen)} color="blue" />
        <StatCard label="Won"  value={fmtDollar(meta.totalWon)}  color="green" />
        <StatCard label="Deals" value={meta.dealCount} color="purple" />
      </div>
    );
  }
  if (category === 'CONVERSION') {
    return (
      <div className="flex gap-3 flex-wrap mb-3">
        <StatCard label="Win Rate" value={`${meta.overallRate}%`} color="green" />
        <StatCard label="Won"      value={meta.totalWon}          color="green" />
        <StatCard label="Lost"     value={meta.totalLost}         color="red" />
        <StatCard label="Total"    value={meta.dealCount}         color="purple" />
      </div>
    );
  }
  if (category === 'DEAL_COUNT') {
    return (
      <div className="flex gap-3 flex-wrap mb-3">
        <StatCard label="Total Deals" value={meta.dealCount} color="blue" />
      </div>
    );
  }
  if (category === 'DURATION') {
    return (
      <div className="flex gap-3 flex-wrap mb-3">
        <StatCard label="Deals Closed" value={meta.dealCount} color="purple" />
      </div>
    );
  }
  if (category === 'SALES_ACTIVITY') {
    return (
      <div className="flex gap-3 flex-wrap mb-3">
        <StatCard label="Activities"     value={meta.totalActivities} color="blue" />
        <StatCard label="In-Person"      value={meta.inPerson}        color="green" />
        <StatCard label="Unique Clients" value={meta.uniqueClients}   color="purple" />
      </div>
    );
  }
  if (category === 'PROPOSALS') {
    return (
      <div className="flex gap-3 flex-wrap mb-3">
        <StatCard label="Sent"      value={meta.sentCount}            color="blue" />
        <StatCard label="Accepted"  value={meta.acceptedCount}        color="green" />
        <StatCard label="Win Rate"  value={`${meta.rate}%`}           color="purple" />
        <StatCard label="Value"     value={fmtDollar(meta.acceptedValue)} color="green" />
      </div>
    );
  }
  return null;
}

// ── Widget filter summary ──────────────────────────────────────────────────

function FilterSummary({ filters }) {
  if (!filters?.length) return null;
  const tags = filters.map((f, i) => {
    const val = Array.isArray(f.value) ? f.value.join(', ') : f.value;
    return (
      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">
        <span className="text-slate-400">{f.field}</span>
        <span>{typeof val === 'string' ? val.replace(/_/g, ' ') : val}</span>
      </span>
    );
  });
  return <div className="flex flex-wrap gap-1 mb-3">{tags}</div>;
}

// ── Widget card ────────────────────────────────────────────────────────────

function WidgetCard({ widget, onEdit, onDelete }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const filters = typeof widget.filters === 'string'
    ? JSON.parse(widget.filters || '[]')
    : (widget.filters || []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/crm/dashboards/${widget.dashboardId}/widgets/${widget.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError('Failed to load'); setLoading(false); });
  }, [widget.id, widget.filters, widget.category, widget.metric, widget.viewBy, widget.segmentBy]);

  const chartHeight = widget.width === 'FULL' ? 280 : 240;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{widget.name}</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {widget.category.replace('_', ' ')} · View by {widget.viewBy}
            {widget.segmentBy ? ` · Segment by ${widget.segmentBy}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(widget)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
          <button onClick={() => onDelete(widget.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm.01 6a1 1 0 10-2 0v4a1 1 0 102 0V8zm3-1a1 1 0 011 1v4a1 1 0 11-2 0V8a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="flex-1 px-4 pt-3 pb-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-red-400 text-sm">{error}</div>
        ) : (
          <>
            <WidgetStats data={data} widget={widget} />
            <FilterSummary filters={filters} />
            <div style={{ height: chartHeight }}>
              <WidgetChart data={data} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Widget edit modal ──────────────────────────────────────────────────────

const FILTER_FIELDS = [
  { key: 'pipeline',         label: 'Pipeline',          type: 'enum',    options: ['PROCUREMENT','DESIGN'] },
  { key: 'dealStatus',       label: 'Deal Status',       type: 'enum',    options: ['OPEN','WON','LOST','ABANDONED','ON_HOLD'] },
  { key: 'projectStatus',    label: 'Project Status',    type: 'enum',    options: ['ACTIVE','ON_HOLD','CANCELED','COMPLETED'] },
  { key: 'stage',            label: 'Stage',             type: 'enum',    options: ['QUALIFIED','PRECONSTRUCTION','CONSTRUCTION','COMPLETED','DESIGN_QUALIFIED','PROPOSAL_SENT','DESIGN','DESIGN_COMPLETED'] },
  { key: 'projectType',      label: 'Project Type',      type: 'enum',    options: ['MULTI_FAMILY','STUDENT_HOUSING','HOSPITALITY','OFFICE','OTHER'] },
  { key: 'serviceType',      label: 'Service Type',      type: 'enum',    options: ['FULL_SERVICE_DESIGN','DESIGN_ASSIST','PEER_REVIEW','BID_ONLY'] },
  { key: 'lostReason',       label: 'Lost Reason',       type: 'enum',    options: ['BUDGET','COMPETITOR','CANCELLED','NO_DECISION','TIMING','OTHER'] },
  { key: 'probability',      label: 'Win %',             type: 'number' },
  { key: 'totalRevenue',     label: 'Total Revenue',     type: 'number' },
  { key: 'expectedOrderDate',label: 'Expected Order Date',type: 'date' },
  { key: 'createdAt',        label: 'Created Date',      type: 'date' },
  { key: 'wonAt',            label: 'Won Date',          type: 'date' },
];

const RELATIVE_DATES = [
  'this_month','last_month','next_month','this_quarter','last_quarter',
  'next_quarter','this_year','last_year','last_6_months','last_12_months',
  'next_6_months','next_12_months',
];

const VIEW_BY_OPTIONS = [
  { key: 'month',          label: 'Month' },
  { key: 'quarter',        label: 'Quarter' },
  { key: 'client',         label: 'Organization' },
  { key: 'owner',          label: 'Owner' },
  { key: 'stage',          label: 'Stage' },
  { key: 'projectType',    label: 'Project Type' },
  { key: 'serviceType',    label: 'Service Type' },
  { key: 'probabilityTier',label: 'Probability Tier' },
  { key: 'lostReason',     label: 'Lost Reason' },
  { key: 'pipeline',       label: 'Pipeline' },
  { key: 'state',          label: 'State' },
];

const SEGMENT_OPTIONS = [null, 'pipeline', 'serviceType', 'dealStatus', 'projectType', 'owner'];

const CATEGORY_OPTIONS = [
  { key: 'REVENUE',        label: 'Revenue',        desc: 'Total revenue by period or dimension' },
  { key: 'DEAL_COUNT',     label: 'Deal Count',     desc: 'Number of deals' },
  { key: 'CONVERSION',     label: 'Conversion',     desc: 'Win / loss rate' },
  { key: 'FORECAST',       label: 'Forecast',       desc: 'Weighted revenue forecast' },
  { key: 'DURATION',       label: 'Duration',       desc: 'Sales cycle length in days' },
  { key: 'SALES_ACTIVITY', label: 'Sales Activity', desc: 'Meetings, in-person visits, clients touched' },
  { key: 'PROPOSALS',      label: 'Proposals',      desc: 'Sent, accepted, value, acceptance rate' },
];

// View-by options that apply to the sales-activity categories (their dimensions
// differ from deal dimensions). Deal categories fall back to VIEW_BY_OPTIONS.
const SALES_ACTIVITY_VIEW_BY = [
  { key: 'month',        label: 'Month' },
  { key: 'quarter',      label: 'Quarter' },
  { key: 'rep',          label: 'Sales Rep' },
  { key: 'activityType', label: 'Activity Type' },
  { key: 'organization', label: 'Organization' },
];
const PROPOSAL_VIEW_BY = [
  { key: 'month',        label: 'Month' },
  { key: 'quarter',      label: 'Quarter' },
  { key: 'rep',          label: 'Sales Rep' },
  { key: 'organization', label: 'Organization' },
  { key: 'status',       label: 'Status' },
  { key: 'type',         label: 'Proposal Type' },
];

function viewByOptionsFor(category) {
  if (category === 'SALES_ACTIVITY') return SALES_ACTIVITY_VIEW_BY;
  if (category === 'PROPOSALS')      return PROPOSAL_VIEW_BY;
  return VIEW_BY_OPTIONS;
}

function FilterRow({ rule, onChange, onRemove }) {
  const fieldDef = FILTER_FIELDS.find(f => f.key === rule.field);
  return (
    <div className="flex items-center gap-2">
      <select value={rule.field} onChange={e => onChange({ ...rule, field: e.target.value, value: '' })}
        className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
        {FILTER_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      {fieldDef?.type === 'number' && (
        <>
          <select value={rule.operator} onChange={e => onChange({ ...rule, operator: e.target.value })}
            className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="gte">≥</option>
            <option value="lte">≤</option>
            <option value="eq">=</option>
          </select>
          <input type="number" value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })}
            className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
        </>
      )}

      {fieldDef?.type === 'enum' && (
        <select value={Array.isArray(rule.value) ? rule.value[0] : rule.value}
          onChange={e => onChange({ ...rule, operator: 'is_any_of', value: [e.target.value] })}
          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">Any</option>
          {fieldDef.options.map(o => <option key={o} value={o}>{o.replace(/_/g,' ')}</option>)}
        </select>
      )}

      {fieldDef?.type === 'date' && (
        <select value={typeof rule.value === 'string' ? rule.value : ''}
          onChange={e => onChange({ ...rule, operator: 'is', value: e.target.value })}
          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">Select period</option>
          {RELATIVE_DATES.map(d => <option key={d} value={d}>{d.replace(/_/g,' ')}</option>)}
        </select>
      )}

      <button onClick={onRemove} className="p-1 text-slate-400 hover:text-red-500">
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </button>
    </div>
  );
}

function WidgetEditModal({ widget, dashboardId, onSave, onClose }) {
  const isNew = !widget?.id;
  const [form, setForm] = useState({
    name:      widget?.name      || 'New Chart',
    category:  widget?.category  || 'DEAL_COUNT',
    metric:    widget?.metric    || 'count',
    viewBy:    widget?.viewBy    || 'month',
    segmentBy: widget?.segmentBy || null,
    filters:   widget?.filters
      ? (typeof widget.filters === 'string' ? JSON.parse(widget.filters) : widget.filters)
      : [],
    width:     widget?.width     || 'HALF',
  });
  const [saving, setSaving] = useState(false);

  function addFilter() {
    setForm(f => ({ ...f, filters: [...f.filters, { field: 'pipeline', operator: 'is', value: 'PROCUREMENT' }] }));
  }

  async function handleSave() {
    setSaving(true);
    const payload = { ...form };
    let res;
    if (isNew) {
      res = await fetch(`/api/crm/dashboards/${dashboardId}/widgets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`/api/crm/dashboards/${dashboardId}/widgets/${widget.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    const saved = await res.json();
    onSave(saved, isNew);
    setSaving(false);
  }

  const metricOptions = {
    REVENUE:    [{ key:'value',label:'Revenue ($)' },{ key:'designFee',label:'Design Fee ($)' },{ key:'weighted_value',label:'Weighted Revenue' }],
    DEAL_COUNT: [{ key:'count',label:'Deal Count' }],
    CONVERSION: [{ key:'rate',label:'Win Rate (%)' }],
    FORECAST:   [{ key:'value',label:'Revenue ($)' },{ key:'weighted_value',label:'Weighted Revenue' }],
    DURATION:   [{ key:'days',label:'Days to Close' }],
    SALES_ACTIVITY: [{ key:'count',label:'Activities' },{ key:'in_person',label:'In-Person Meetings' },{ key:'unique_clients',label:'Unique Clients' }],
    PROPOSALS:  [{ key:'sent',label:'Sent' },{ key:'accepted',label:'Accepted' },{ key:'value',label:'Accepted Value ($)' },{ key:'acceptance_rate',label:'Acceptance Rate (%)' }],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">{isNew ? 'Add Widget' : 'Edit Widget'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Widget Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Category</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_OPTIONS.map(c => (
                <button key={c.key} onClick={() => setForm(f => ({ ...f, category: c.key, metric: metricOptions[c.key][0].key, viewBy: viewByOptionsFor(c.key)[0].key, segmentBy: null }))}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${form.category === c.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <div className="font-semibold">{c.label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{c.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Metric */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Measure</label>
            <select value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
              {(metricOptions[form.category] || []).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>

          {/* View by */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">View by (X-axis)</label>
              <select value={form.viewBy} onChange={e => setForm(f => ({ ...f, viewBy: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
                {viewByOptionsFor(form.category).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Segment by (colour)</label>
              <select value={form.segmentBy || ''} onChange={e => setForm(f => ({ ...f, segmentBy: e.target.value || null }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
                <option value="">None</option>
                {SEGMENT_OPTIONS.filter(Boolean).map(o => <option key={o} value={o}>{o.replace(/([A-Z])/g,' $1').trim()}</option>)}
              </select>
            </div>
          </div>

          {/* Width */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Width</label>
            <div className="flex gap-2">
              {['HALF','FULL'].map(w => (
                <button key={w} onClick={() => setForm(f => ({ ...f, width: w }))}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${form.width === w ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {w === 'HALF' ? 'Half width' : 'Full width'}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Filters</label>
              <button onClick={addFilter} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Add filter</button>
            </div>
            <div className="space-y-2">
              {form.filters.map((rule, i) => (
                <FilterRow key={i} rule={rule}
                  onChange={updated => setForm(f => ({ ...f, filters: f.filters.map((r, ri) => ri === i ? updated : r) }))}
                  onRemove={() => setForm(f => ({ ...f, filters: f.filters.filter((_, ri) => ri !== i) }))} />
              ))}
              {form.filters.length === 0 && (
                <p className="text-xs text-slate-400 py-2 text-center">No filters — shows all deals</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Widget'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard client ──────────────────────────────────────────────────

export default function DashboardsClient({ dashboards: initialDashboards, user }) {
  const [dashboards, setDashboards] = useState(initialDashboards);
  const [activeDashboardId, setActiveDashboardId] = useState(initialDashboards[0]?.id || null);
  const [editingWidget, setEditingWidget] = useState(null);  // null | 'new' | widget obj
  const [newDashboardName, setNewDashboardName] = useState('');
  const [showNewDashboard, setShowNewDashboard] = useState(false);

  const activeDashboard = dashboards.find(d => d.id === activeDashboardId) || dashboards[0];

  async function handleDeleteWidget(widgetId) {
    if (!confirm('Remove this widget?')) return;
    await fetch(`/api/crm/dashboards/${activeDashboard.id}/widgets/${widgetId}`, { method: 'DELETE' });
    setDashboards(ds => ds.map(d =>
      d.id === activeDashboard.id
        ? { ...d, widgets: d.widgets.filter(w => w.id !== widgetId) }
        : d
    ));
  }

  function handleSaveWidget(saved, isNew) {
    setDashboards(ds => ds.map(d => {
      if (d.id !== activeDashboard.id) return d;
      if (isNew) return { ...d, widgets: [...d.widgets, saved] };
      return { ...d, widgets: d.widgets.map(w => w.id === saved.id ? saved : w) };
    }));
    setEditingWidget(null);
  }

  async function handleCreateDashboard() {
    if (!newDashboardName.trim()) return;
    const res = await fetch('/api/crm/dashboards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDashboardName.trim() }),
    });
    const created = await res.json();
    setDashboards(ds => [...ds, created]);
    setActiveDashboardId(created.id);
    setNewDashboardName('');
    setShowNewDashboard(false);
  }

  const widgets = activeDashboard?.widgets || [];
  const halfWidgets  = widgets.filter(w => w.width === 'HALF');
  const fullWidgets  = widgets.filter(w => w.width === 'FULL');

  // Interleave full and half widgets by position
  const sortedWidgets = [...widgets].sort((a, b) => a.position - b.position);

  // Build grid: consecutive HALF widgets pair up, FULL widgets span
  const rows = [];
  let i = 0;
  while (i < sortedWidgets.length) {
    const w = sortedWidgets[i];
    if (w.width === 'FULL') {
      rows.push({ type: 'full', widgets: [w] });
      i++;
    } else {
      const next = sortedWidgets[i + 1];
      if (next && next.width === 'HALF') {
        rows.push({ type: 'half', widgets: [w, next] });
        i += 2;
      } else {
        rows.push({ type: 'half', widgets: [w] });
        i++;
      }
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">ILC Studios</span>
            </div>
            <h1 className="text-lg font-bold text-slate-900">Dashboards</h1>
          </div>
          <button onClick={() => setEditingWidget('new')}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
            </svg>
            Add Widget
          </button>
        </div>

        {/* Dashboard tabs */}
        <div className="flex items-center gap-1 mt-3 -mb-3">
          {dashboards.map(d => (
            <button key={d.id} onClick={() => setActiveDashboardId(d.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                d.id === activeDashboard?.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {d.name}
              {d.isDefault && <span className="ml-1.5 text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">default</span>}
            </button>
          ))}
          {showNewDashboard ? (
            <div className="flex items-center gap-2 ml-2">
              <input autoFocus value={newDashboardName} onChange={e => setNewDashboardName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateDashboard()}
                placeholder="Dashboard name" className="text-sm border border-slate-300 rounded-lg px-2 py-1 w-40" />
              <button onClick={handleCreateDashboard} className="text-xs text-blue-600 font-medium">Create</button>
              <button onClick={() => setShowNewDashboard(false)} className="text-xs text-slate-400">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowNewDashboard(true)}
              className="ml-1 px-3 py-2 text-xs text-slate-400 hover:text-slate-600 border-b-2 border-transparent">
              + New Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Widget grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {widgets.length === 0 ? (
          <div className="max-w-md mx-auto text-center mt-16">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">No widgets yet</h3>
            <p className="text-xs text-slate-400 mb-4">Click "Add Widget" to build your first chart.</p>
            <button onClick={() => setEditingWidget('new')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              Add Widget
            </button>
          </div>
        ) : (
          <div className="space-y-4 max-w-[1400px] mx-auto">
            {rows.map((row, ri) => (
              <div key={ri} className={`grid gap-4 ${row.type === 'full' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                {row.widgets.map(w => (
                  <WidgetCard key={w.id} widget={{ ...w, dashboardId: activeDashboard.id }}
                    onEdit={setEditingWidget} onDelete={handleDeleteWidget} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit / new widget modal */}
      {editingWidget && (
        <WidgetEditModal
          widget={editingWidget === 'new' ? null : editingWidget}
          dashboardId={activeDashboard.id}
          onSave={handleSaveWidget}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </div>
  );
}
