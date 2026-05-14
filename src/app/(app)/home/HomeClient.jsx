'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// Widget Registry — single source of truth for all available widgets
// ─────────────────────────────────────────────────────────────────────────────

export const WIDGET_REGISTRY = {
  recent_projects: {
    title:       'Recent Projects',
    description: 'Your most recently updated projects',
    icon:        '📁',
    color:       '#f59e0b',
    defaultSize: 'normal',
  },
  open_pipeline: {
    title:       'Open Pipeline',
    description: 'CRM deals, pipeline value, and weighted forecast',
    icon:        '📈',
    color:       '#f97316',
    defaultSize: 'normal',
  },
  clients: {
    title:       'Clients',
    description: 'Recently active clients',
    icon:        '🏢',
    color:       '#3b82f6',
    defaultSize: 'normal',
  },
  upcoming_actions: {
    title:       'Upcoming Actions',
    description: 'Deals with action items due in the next 7 days',
    icon:        '⏰',
    color:       '#ef4444',
    defaultSize: 'normal',
  },
  won_this_year: {
    title:       'Won This Year',
    description: 'Deals closed and won in the current calendar year',
    icon:        '🏆',
    color:       '#22c55e',
    defaultSize: 'normal',
  },
  pipeline_by_stage: {
    title:       'Pipeline by Stage',
    description: 'Open pipeline value broken down by deal stage',
    icon:        '📊',
    color:       '#6366f1',
    defaultSize: 'wide',
  },
  manufacturers: {
    title:       'Manufacturers & Products',
    description: 'Quick access to your product catalog',
    icon:        '🏭',
    color:       '#8b5cf6',
    defaultSize: 'normal',
  },
  sales_reps: {
    title:       'Sales Reps',
    description: 'Rep directory summary and quick links',
    icon:        '🤝',
    color:       '#10b981',
    defaultSize: 'normal',
  },
  quick_stats: {
    title:       'Quick Stats',
    description: 'At-a-glance numbers across all sections',
    icon:        '⚡',
    color:       '#64748b',
    defaultSize: 'wide',
  },
};

const DEFAULT_WIDGETS = [
  { id: 'quick_stats',      size: 'wide'   },
  { id: 'recent_projects',  size: 'normal' },
  { id: 'open_pipeline',    size: 'normal' },
  { id: 'clients',          size: 'normal' },
  { id: 'upcoming_actions', size: 'normal' },
  { id: 'won_this_year',    size: 'normal' },
  { id: 'manufacturers',    size: 'normal' },
  { id: 'sales_reps',       size: 'normal' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtMoney(val) {
  if (!val) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function fmtDate(str) {
  if (!str) return '';
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

function isOverdue(str) {
  if (!str) return false;
  return new Date(str) < new Date();
}

function timeGreeting(name) {
  const h    = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const first = (name || '').split(' ')[0];
  return `Good ${part}${first ? `, ${first}` : ''}`;
}

const PHASE_LABELS = {
  sd: 'SD', dd: 'DD', cd: 'CD', ifc: 'IFC',
  construction: 'CA', closeout: 'CL',
};
const STAGE_LABELS = {
  QUALIFIED:'Qualified', PRECONSTRUCTION:'Pre-Con', CONSTRUCTION:'Construction', COMPLETED:'Completed',
  DESIGN_QUALIFIED:'Qualified', PROPOSAL_SENT:'Proposal', DESIGN:'Design', DESIGN_COMPLETED:'Completed',
};

// ─────────────────────────────────────────────────────────────────────────────
// Widget shell
// ─────────────────────────────────────────────────────────────────────────────

function WidgetShell({ id, title, icon, count, countLabel, href, color = '#f59e0b', children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
            style={{ backgroundColor: `${color}18`, color }}>
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {count != null && (
              <p className="text-[11px] text-slate-400">{count.toLocaleString()} {countLabel}</p>
            )}
          </div>
        </div>
        {href && (
          <Link href={href}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors shrink-0"
            style={{ color, backgroundColor: `${color}12` }}>
            View all →
          </Link>
        )}
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual Widgets
// ─────────────────────────────────────────────────────────────────────────────

function QuickStatsWidget({ stats }) {
  const items = [
    { label: 'Projects',       value: stats.projects.total,      href: '/dashboard',      color: '#f59e0b' },
    { label: 'Clients',        value: stats.clients.total,        href: '/clients',        color: '#3b82f6' },
    { label: 'Open Deals',     value: stats.deals.open,           href: '/crm',            color: '#f97316' },
    { label: 'Pipeline',       value: fmtMoney(stats.deals.pipeline), href: '/crm',        color: '#f97316' },
    { label: 'Won This Year',  value: stats.deals.wonThisYear.length, href: '/crm',        color: '#22c55e' },
    { label: 'Won Value',      value: fmtMoney(stats.deals.wonValue), href: '/crm',        color: '#22c55e' },
    { label: 'Manufacturers',  value: stats.manufacturers.total,  href: '/manufacturers',  color: '#8b5cf6' },
    { label: 'Products',       value: stats.products.total,       href: '/products',       color: '#8b5cf6' },
  ];

  const cfg = WIDGET_REGISTRY.quick_stats;
  return (
    <WidgetShell id="quick_stats" title={cfg.title} icon={cfg.icon} color={cfg.color}>
      <div className="grid grid-cols-4 divide-x divide-slate-100">
        {items.map(s => (
          <Link key={s.label} href={s.href}
            className="flex flex-col px-4 py-4 hover:bg-slate-50 transition-colors group">
            <span className="text-xl font-bold" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">{s.label}</span>
          </Link>
        ))}
      </div>
    </WidgetShell>
  );
}

function RecentProjectsWidget({ data }) {
  const cfg = WIDGET_REGISTRY.recent_projects;
  return (
    <WidgetShell id="recent_projects" title={cfg.title} icon={cfg.icon}
      count={data.total} countLabel="total" href="/dashboard" color={cfg.color}>
      <div className="divide-y divide-slate-50 overflow-y-auto max-h-72">
        {data.recent.length === 0 && (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">No projects yet.</p>
        )}
        {data.recent.map(p => (
          <Link key={p.id} href={`/project/${p.id}`}
            className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors group">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-amber-600">{PHASE_LABELS[p.phase] || 'SD'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-amber-600 transition-colors">
                {p.name}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {p.client?.name || '—'}
                {(p.city || p.state) ? ` · ${[p.city, p.state].filter(Boolean).join(', ')}` : ''}
              </p>
            </div>
            <span className="text-[10px] text-slate-300 shrink-0">{fmtDate(p.updatedAt)}</span>
          </Link>
        ))}
      </div>
    </WidgetShell>
  );
}

function OpenPipelineWidget({ data }) {
  const cfg = WIDGET_REGISTRY.open_pipeline;
  return (
    <WidgetShell id="open_pipeline" title={cfg.title} icon={cfg.icon}
      count={data.open} countLabel="open deals" href="/crm" color={cfg.color}>
      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-4 py-3">
          <p className="text-base font-bold text-slate-900">{fmtMoney(data.pipeline)}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Open Pipeline</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-base font-bold text-orange-600">{fmtMoney(data.weighted)}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Weighted</p>
        </div>
      </div>
      <div className="divide-y divide-slate-50 overflow-y-auto max-h-52">
        {data.recent.length === 0 && (
          <p className="px-5 py-6 text-sm text-slate-400 text-center">No open deals.</p>
        )}
        {data.recent.map(d => (
          <Link key={d.id} href="/crm"
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors group">
            <div className="w-1.5 h-6 rounded-full shrink-0"
              style={{ backgroundColor: d.pipeline === 'PROCUREMENT' ? '#fb923c' : '#60a5fa' }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-orange-600 transition-colors">
                {d.title}
              </p>
              <p className="text-[10px] text-slate-400">
                {STAGE_LABELS[d.stage] || d.stage}
                {d.client ? ` · ${d.client.name}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              {d.totalRevenue && <p className="text-xs font-bold text-slate-700">{fmtMoney(d.totalRevenue)}</p>}
              <p className="text-[10px] text-slate-400">{d.probability}%</p>
            </div>
          </Link>
        ))}
      </div>
    </WidgetShell>
  );
}

function ClientsWidget({ data }) {
  const cfg = WIDGET_REGISTRY.clients;
  return (
    <WidgetShell id="clients" title={cfg.title} icon={cfg.icon}
      count={data.total} countLabel="total" href="/clients" color={cfg.color}>
      <div className="divide-y divide-slate-50 overflow-y-auto max-h-72">
        {data.recent.length === 0 && (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">No clients yet.</p>
        )}
        {data.recent.map(c => (
          <Link key={c.id} href={`/clients/${c.id}`}
            className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors group">
            <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-blue-600">{c.name[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                {c.name}
              </p>
              <p className="text-[11px] text-slate-400">
                {c._count.projects} project{c._count.projects !== 1 ? 's' : ''}
                {(c.city || c.state) ? ` · ${[c.city, c.state].filter(Boolean).join(', ')}` : ''}
              </p>
            </div>
            <span className="text-[10px] text-slate-300 shrink-0">{fmtDate(c.updatedAt)}</span>
          </Link>
        ))}
      </div>
    </WidgetShell>
  );
}

function UpcomingActionsWidget({ data }) {
  const cfg = WIDGET_REGISTRY.upcoming_actions;
  return (
    <WidgetShell id="upcoming_actions" title={cfg.title} icon={cfg.icon}
      count={data.upcomingActions.length} countLabel="items" href="/crm" color={cfg.color}>
      <div className="divide-y divide-slate-50 overflow-y-auto max-h-72">
        {data.upcomingActions.length === 0 && (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">
            No upcoming actions. 🎉
          </p>
        )}
        {data.upcomingActions.map(d => {
          const overdue = isOverdue(d.nextActionDue);
          return (
            <Link key={d.id} href="/crm"
              className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors group">
              <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${overdue ? 'bg-red-500' : 'bg-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-red-600 transition-colors">
                  {d.title}
                </p>
                {d.nextActionText && (
                  <p className="text-[11px] text-slate-500 truncate">{d.nextActionText}</p>
                )}
                <p className="text-[11px] text-slate-400">
                  {d.client?.name || '—'}
                </p>
              </div>
              <span className={`text-[10px] font-semibold shrink-0 ${overdue ? 'text-red-500' : 'text-amber-500'}`}>
                {overdue ? 'Overdue' : fmtDate(d.nextActionDue)}
              </span>
            </Link>
          );
        })}
      </div>
    </WidgetShell>
  );
}

function WonThisYearWidget({ data }) {
  const cfg = WIDGET_REGISTRY.won_this_year;
  return (
    <WidgetShell id="won_this_year" title={cfg.title} icon={cfg.icon} color={cfg.color}
      href="/crm">
      <div className="px-5 py-4 border-b border-slate-100 grid grid-cols-2 gap-4">
        <div>
          <p className="text-2xl font-bold text-green-700">{data.wonThisYear.length}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Deals Won</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-green-600">{fmtMoney(data.wonValue)}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Total Value</p>
        </div>
      </div>
      <div className="divide-y divide-slate-50 overflow-y-auto max-h-48">
        {data.wonThisYear.length === 0 && (
          <p className="px-5 py-6 text-sm text-slate-400 text-center">No wins yet this year.</p>
        )}
        {data.wonThisYear.slice(0, 5).map(d => (
          <Link key={d.id} href="/crm"
            className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 transition-colors group">
            <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <span className="text-[9px] text-green-700">✓</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-green-600 transition-colors">
                {d.title}
              </p>
              <p className="text-[10px] text-slate-400">{d.client?.name || '—'}</p>
            </div>
            <span className="text-xs font-bold text-green-700 shrink-0">
              {fmtMoney(d.totalRevenue)}
            </span>
          </Link>
        ))}
      </div>
    </WidgetShell>
  );
}

function PipelineByStageWidget({ data }) {
  const cfg    = WIDGET_REGISTRY.pipeline_by_stage;
  const stages = data.byStage || [];
  const max    = Math.max(...stages.map(s => s.value), 1);

  return (
    <WidgetShell id="pipeline_by_stage" title={cfg.title} icon={cfg.icon}
      count={data.open} countLabel="open deals" href="/crm" color={cfg.color}>
      {stages.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-400 text-center">No open deals.</p>
      ) : (
        <div className="px-5 py-4 space-y-3 overflow-y-auto max-h-64">
          {stages.map(s => (
            <div key={s.stage}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">
                  {STAGE_LABELS[s.stage] || s.stage}
                </span>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900">{fmtMoney(s.value)}</span>
                  <span className="text-[10px] text-slate-400 ml-1.5">{s.count} deal{s.count !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width:           `${(s.value / max) * 100}%`,
                    backgroundColor: s.pipeline === 'PROCUREMENT' ? '#fb923c' : '#818cf8',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}

function ManufacturersWidget({ stats }) {
  const cfg = WIDGET_REGISTRY.manufacturers;
  return (
    <WidgetShell id="manufacturers" title={cfg.title} icon={cfg.icon} color={cfg.color}>
      <div className="px-5 py-4 grid grid-cols-2 gap-3">
        <Link href="/manufacturers"
          className="p-4 rounded-xl bg-purple-50 border border-purple-100 hover:border-purple-300 transition-colors">
          <p className="text-2xl font-bold text-purple-700">{stats.manufacturers.total}</p>
          <p className="text-xs text-purple-500 mt-0.5">Manufacturers</p>
        </Link>
        <Link href="/products"
          className="p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-300 transition-colors">
          <p className="text-2xl font-bold text-slate-700">{stats.products.total}</p>
          <p className="text-xs text-slate-500 mt-0.5">Products</p>
        </Link>
      </div>
      <div className="px-5 pb-4 flex gap-2">
        <Link href="/manufacturers" className="flex-1 py-2 text-xs font-semibold text-center rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-colors">
          Manufacturers
        </Link>
        <Link href="/products" className="flex-1 py-2 text-xs font-semibold text-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
          Products
        </Link>
      </div>
    </WidgetShell>
  );
}

function SalesRepsWidget({ stats }) {
  const cfg = WIDGET_REGISTRY.sales_reps;
  return (
    <WidgetShell id="sales_reps" title={cfg.title} icon={cfg.icon} color={cfg.color}
      count={stats.salesReps.total} countLabel="reps on record" href="/sales-reps">
      <div className="px-5 py-5">
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
          <p className="text-3xl font-bold text-emerald-700 mb-1">{stats.salesReps.total}</p>
          <p className="text-xs text-emerald-600">Reps from submittal history</p>
        </div>
        <Link href="/sales-reps"
          className="mt-3 flex items-center justify-center w-full py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
          View Rep Directory →
        </Link>
      </div>
    </WidgetShell>
  );
}

// Render any widget by ID
function renderWidget(id, stats) {
  switch (id) {
    case 'quick_stats':      return <QuickStatsWidget      stats={stats} />;
    case 'recent_projects':  return <RecentProjectsWidget  data={stats.projects} />;
    case 'open_pipeline':    return <OpenPipelineWidget    data={stats.deals} />;
    case 'clients':          return <ClientsWidget         data={stats.clients} />;
    case 'upcoming_actions': return <UpcomingActionsWidget data={stats.deals} />;
    case 'won_this_year':    return <WonThisYearWidget     data={stats.deals} />;
    case 'pipeline_by_stage':return <PipelineByStageWidget data={stats.deals} />;
    case 'manufacturers':    return <ManufacturersWidget   stats={stats} />;
    case 'sales_reps':       return <SalesRepsWidget       stats={stats} />;
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Panel (slide-in from right)
// ─────────────────────────────────────────────────────────────────────────────

function EditPanel({ widgets, onClose, onReorder, onRemove, onAdd, onToggleSize, saving }) {
  const allIds    = Object.keys(WIDGET_REGISTRY);
  const activeIds = widgets.map(w => w.id);
  const available = allIds.filter(id => !activeIds.includes(id));

  // Drag state for reordering
  const dragIdx  = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  function handleDragStart(i) { dragIdx.current = i; }
  function handleDragOver(e, i)  { e.preventDefault(); setDragOver(i); }
  function handleDrop(i) {
    setDragOver(null);
    if (dragIdx.current === null || dragIdx.current === i) return;
    onReorder(dragIdx.current, i);
    dragIdx.current = null;
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">

        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Edit Dashboard</h2>
            <p className="text-xs text-slate-400 mt-0.5">Drag to reorder · click × to remove</p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-slate-400">Saving…</span>}
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* Active widgets */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
              Active Widgets — {widgets.length} shown
            </p>
            <div className="space-y-1.5">
              {widgets.map((w, i) => {
                const meta = WIDGET_REGISTRY[w.id];
                if (!meta) return null;
                return (
                  <div
                    key={w.id}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={e => handleDragOver(e, i)}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => handleDrop(i)}
                    className={`flex items-center gap-3 p-3 rounded-xl border bg-white transition-all cursor-move select-none ${
                      dragOver === i ? 'border-orange-400 bg-orange-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Drag handle */}
                    <div className="shrink-0 text-slate-300 hover:text-slate-500">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9 12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9 19.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM18 4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM18 12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM18 19.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
                      </svg>
                    </div>

                    {/* Icon */}
                    <span className="text-base shrink-0">{meta.icon}</span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{meta.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{meta.description}</p>
                    </div>

                    {/* Size toggle */}
                    <button
                      onClick={() => onToggleSize(w.id)}
                      title={w.size === 'wide' ? 'Switch to normal width' : 'Switch to wide (2-col)'}
                      className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                        w.size === 'wide'
                          ? 'border-indigo-300 text-indigo-600 bg-indigo-50'
                          : 'border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {w.size === 'wide' ? '⬛ Wide' : '▪ Normal'}
                    </button>

                    {/* Remove */}
                    <button
                      onClick={() => onRemove(w.id)}
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
              {widgets.length === 0 && (
                <div className="text-center py-6 text-sm text-slate-400">
                  No widgets active. Add some below!
                </div>
              )}
            </div>
          </div>

          {/* Available widgets to add */}
          {available.length > 0 && (
            <div className="px-4 py-4 border-t border-slate-100 mt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
                Add Widgets
              </p>
              <div className="space-y-1.5">
                {available.map(id => {
                  const meta = WIDGET_REGISTRY[id];
                  return (
                    <button
                      key={id}
                      onClick={() => onAdd(id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-left group"
                    >
                      <span className="text-base shrink-0">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700 group-hover:text-orange-700 truncate">
                          {meta.title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{meta.description}</p>
                      </div>
                      <div className="shrink-0 w-6 h-6 rounded-full bg-slate-100 group-hover:bg-orange-500 flex items-center justify-center transition-colors">
                        <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <p className="text-[11px] text-slate-400 text-center">
            Changes save automatically · config syncs across devices
          </p>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main HomeClient
// ─────────────────────────────────────────────────────────────────────────────

function parseConfig(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    if (Array.isArray(parsed.widgets) && parsed.widgets.length > 0) {
      return parsed.widgets.map(w => ({
        id:   w.id,
        size: w.size || WIDGET_REGISTRY[w.id]?.defaultSize || 'normal',
      })).filter(w => WIDGET_REGISTRY[w.id]);
    }
  } catch {}
  return DEFAULT_WIDGETS.map(w => ({ ...w }));
}

export default function HomeClient({ initialConfig, user, stats }) {
  const [widgets,    setWidgets]    = useState(() => parseConfig(initialConfig));
  const [editOpen,   setEditOpen]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const saveTimer = useRef(null);

  // Save to server (debounced)
  const saveToServer = useCallback(async (newWidgets) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const config = JSON.stringify({ version: 1, widgets: newWidgets });
        await fetch('/api/user/preferences', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ dashboardConfig: config }),
        });
      } finally {
        setSaving(false);
      }
    }, 800);
  }, []);

  function update(newWidgets) {
    setWidgets(newWidgets);
    saveToServer(newWidgets);
  }

  function handleReorder(fromIdx, toIdx) {
    const next = [...widgets];
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    update(next);
  }

  function handleRemove(id) {
    update(widgets.filter(w => w.id !== id));
  }

  function handleAdd(id) {
    const defaultSize = WIDGET_REGISTRY[id]?.defaultSize || 'normal';
    update([...widgets, { id, size: defaultSize }]);
  }

  function handleToggleSize(id) {
    update(widgets.map(w => w.id === id
      ? { ...w, size: w.size === 'wide' ? 'normal' : 'wide' }
      : w
    ));
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold text-amber-500 uppercase tracking-wider mb-0.5">ILC Studios</p>
            <h1 className="text-2xl font-bold text-slate-900">{timeGreeting(user.name)}</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </p>
          </div>

          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Edit Dashboard
            {saving && <span className="text-slate-400 font-normal">· Saving…</span>}
          </button>
        </div>
      </div>

      {/* ── Widget grid ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl mb-3">🧩</div>
            <p className="text-slate-500 font-semibold mb-1">Your dashboard is empty</p>
            <p className="text-sm text-slate-400 mb-4">Add widgets to get started.</p>
            <button
              onClick={() => setEditOpen(true)}
              className="px-4 py-2 text-sm font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors"
            >
              Edit Dashboard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 auto-rows-min">
            {widgets.map(w => (
              <div
                key={w.id}
                className={w.size === 'wide' ? 'lg:col-span-2 xl:col-span-3' : ''}
              >
                {renderWidget(w.id, stats)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Edit panel ── */}
      {editOpen && (
        <EditPanel
          widgets={widgets}
          saving={saving}
          onClose={() => setEditOpen(false)}
          onReorder={handleReorder}
          onRemove={handleRemove}
          onAdd={handleAdd}
          onToggleSize={handleToggleSize}
        />
      )}
    </div>
  );
}
