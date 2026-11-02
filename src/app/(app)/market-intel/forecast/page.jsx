'use client';
import { useState, useEffect, useMemo, Fragment } from 'react';
import Link from 'next/link';
import SectionTabs, { MARKET_INTEL_TABS } from '@/components/ui/SectionTabs';
import { signalHref } from '@/components/market-intel/SignalCard';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { Th, sortRows } from '@/components/ui/SortHeader';
import { WidgetEmpty, WidgetLoading } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { H1, HELPER, CARD, INPUT, TD, TH } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';

/**
 * Pipeline forecast (0122).
 *
 * Units the press says are coming, rolled up by company, metro or state. One
 * project counts once per group at its largest printed number, so a building
 * that gets five articles is still one building. The figure is what was
 * announced, not what will be built: treat it as a weather report.
 */

const BY_OPTIONS = [
  { key: 'company', label: 'By company' },
  { key: 'metro',   label: 'By metro' },
  { key: 'state',   label: 'By state' },
];

const MONTH_OPTIONS = [3, 6, 12, 24];

// Filters and sort live in the page address (Mike 10-16). `by` and `months`
// ride along so a shared link opens the same view.
const FILTER_FIELDS = [
  { key: 'by',      label: 'Group by',     kind: 'pick' },
  { key: 'months',  label: 'Months',       kind: 'pick' },
  { key: 'metro',   label: 'Metro',        kind: 'pick' },
  { key: 'state',   label: 'State',        kind: 'pick' },
  { key: 'kind',    label: 'Source',       kind: 'pick' },
  { key: 'role',    label: 'Role',         kind: 'pick' },
  { key: 'clients', label: 'Clients only', kind: 'yesno' },
  { key: 'q',       label: 'Name',         kind: 'text' },
];
const SORT_DEFAULT = { key: 'units', dir: 'desc' };
const SORT_GETTERS = {
  label:    r => r.label,
  units:    r => r.units,
  projects: r => r.projects,
  articles: r => r.articles,
};

export default function ForecastPage() {
  const { filters, setFilter, replaceFilters, sort, toggleSort, ready } = useUrlView({ fields: FILTER_FIELDS, sortDefault: SORT_DEFAULT });
  const [panelOpen, setPanelOpen] = useState(false);
  const by     = BY_OPTIONS.some(o => o.key === filters.by) ? filters.by : 'company';
  const months = MONTH_OPTIONS.includes(Number(filters.months)) ? Number(filters.months) : 12;
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  // Filters (Mike 10-8: "I still need the pipeline tab to have filterability").
  // Metro and state narrow the articles counted (server side); clients only
  // and the name box narrow the rows shown.
  const metro       = filters.metro || '';
  const state       = filters.state || '';
  const clientsOnly = filters.clients === 'yes';
  const nameFilter  = filters.q || '';
  // Permits or press, and which company role (Mike 10-8: contractors were mixed in with developers).
  const kind        = filters.kind || '';
  const role        = filters.role || '';
  const [tagOptions,  setTagOptions]  = useState({ METRO: [], STATE: [] });
  useEffect(() => {
    fetch('/api/market-intel/tags')
      .then(r => r.json())
      .then(d => setTagOptions({ METRO: d.tags?.METRO || [], STATE: d.tags?.STATE || [] }))
      .catch(() => {});
  }, []);
  // Click a row to drop open the projects that made its number (Mike 10-8:
  // "I think I like the collapse and uncollapse better").
  const [open, setOpen] = useState(() => new Set());
  function toggleOpen(key) {
    setOpen(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }
  useEffect(() => { setOpen(new Set()); }, [by, months, metro, state, kind, role]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ by, months: String(months) });
    if (metro) params.set('metro', metro);
    if (state) params.set('state', state);
    if (kind)  params.set('kind', kind);
    if (role && by === 'company') params.set('role', role);
    fetch(`/api/market-intel/forecast?${params}`)
      .then(r => r.json())
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ready, by, months, metro, state, kind, role]);

  // Click a column header to sort; click again to flip (Mike 10-8).
  const rows = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    const list = (data?.rows || []).filter(r =>
      (!clientsOnly || r.clientId) &&
      (!needle || String(r.label || '').toLowerCase().includes(needle))
    );
    return sortRows(list, sort, SORT_GETTERS);
  }, [data, sort, clientsOnly, nameFilter]);
  const filterCount = countFilters(filters, FILTER_FIELDS.filter(f => f.key !== 'by' && f.key !== 'months'));
  const hasFilters  = filterCount > 0;
  const max  = Math.max(1, ...(data?.rows || []).map(r => r.units || 0));
  const choices = useMemo(() => ({
    metro: tagOptions.METRO.map(t => t.name),
    state: tagOptions.STATE.map(t => t.name),
    kind:  [['PERMIT', 'Permits only'], ['CONCEPT', 'Concept plans only'], ['ARTICLE', 'Articles only']],
    role:  [['DEVELOPER', 'Developers and owners'], ['GC', 'Contractors'], ['OTHER', 'Architects, lenders, others']],
  }), [tagOptions]);
  const panelFields = FILTER_FIELDS.filter(f => !['by', 'months', 'q'].includes(f.key) && (by === 'company' || (f.key !== 'role' && f.key !== 'clients')));

  return (
    <div className="p-4 sm:p-6">
      <SectionTabs tabs={MARKET_INTEL_TABS} />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className={H1}>Pipeline forecast</h1>
            <p className="text-sm text-slate-500 mt-0.5 tabular-nums">
              {data ? `${data.totalUnits.toLocaleString()} units announced across ${data.articles.toLocaleString()} article${data.articles === 1 ? '' : 's'}` : 'Units announced in the press'}
            </p>
          </div>
        </div>

        <div className="mb-5">
          <FilterToolbar
            count={filterCount}
            open={panelOpen}
            onToggle={() => setPanelOpen(o => !o)}
            onClear={() => { const keep = {}; if (filters.by) keep.by = filters.by; if (filters.months) keep.months = filters.months; replaceFilters(keep); }}
            right={<SearchBox value={nameFilter} onChange={v => setFilter('q', v)} placeholder={by === 'company' ? 'Company name…' : by === 'metro' ? 'Metro…' : 'State…'} />}
          >
            <div className="flex rounded-lg border border-slate-300 bg-white overflow-hidden">
              {BY_OPTIONS.map(o => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setFilter('by', o.key === 'company' ? '' : o.key)}
                  className={cn('px-3 py-1.5 text-xs font-semibold', by === o.key ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50')}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <select value={months} onChange={e => setFilter('months', Number(e.target.value) === 12 ? '' : e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')}>
              {MONTH_OPTIONS.map(m => <option key={m} value={m}>Last {m} months</option>)}
            </select>
          </FilterToolbar>
          <FilterPanel open={panelOpen} fields={panelFields} filters={filters} choices={choices} onChange={setFilter} />
        </div>

        {loading ? (
          <WidgetLoading />
        ) : rows.length === 0 ? (
          <WidgetEmpty>
            <span className="block font-medium">{hasFilters ? 'Nothing matches these filters' : 'No unit counts yet'}</span>
            <span className={cn(HELPER, 'block mt-1')}>{hasFilters ? 'Clear a filter to widen the list.' : 'Articles get a unit count when they are read. Press "Screen articles" on the Sources tab to fill in older ones.'}</span>
          </WidgetEmpty>
        ) : (
          <div className={cn(CARD, 'overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <SortHeader label={by === 'company' ? 'Company' : by === 'metro' ? 'Metro' : 'State'} field="label" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Units" field="units" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Projects" field="projects" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Articles" field="articles" sort={sort} onSort={toggleSort} align="right" className="hidden sm:table-cell" />
                  {by === 'company' && <Th className="hidden sm:table-cell">Where</Th>}
                  <th className={cn(TH, 'w-40 hidden sm:table-cell')}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <Fragment key={r.key}>
                  <tr
                    onClick={() => toggleOpen(r.key)}
                    className={cn('border-t border-slate-100 cursor-pointer', open.has(r.key) ? 'bg-orange-50/40' : 'hover:bg-slate-50')}
                  >
                    <td className={cn(TD, 'font-medium text-slate-800')}>
                      <span className="inline-block w-4 text-slate-400 text-xs">{open.has(r.key) ? '▾' : '▸'}</span>
                      {r.label}
                      {r.clientId && <Link href={`/clients/${r.clientId}`} onClick={e => e.stopPropagation()} className="ml-2 text-[11px] text-green-600 hover:underline">client ✓</Link>}
                      {by === 'company' && (r.metros || []).length > 0 && <div className="sm:hidden pl-4 text-xs font-normal text-slate-500">{r.metros.slice(0, 3).join(', ')}</div>}
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{r.units.toLocaleString()}</td>
                    <td className={cn(TD, 'text-right tabular-nums text-slate-500')}>{r.projects}</td>
                    <td className={cn(TD, 'text-right tabular-nums text-slate-500 hidden sm:table-cell')}>{r.articles}</td>
                    {by === 'company' && <td className={cn(TD, 'text-xs text-slate-500 hidden sm:table-cell')}>{(r.metros || []).slice(0, 3).join(', ')}{(r.metros || []).length > 3 ? ', +' + (r.metros.length - 3) : ''}</td>}
                    <td className={cn(TD, 'hidden sm:table-cell')}>
                      <div className="h-2 rounded bg-orange-100">
                        <div className="h-2 rounded bg-orange-500" style={{ width: `${Math.max(2, Math.round(100 * r.units / max))}%` }} />
                      </div>
                    </td>
                  </tr>
                  {open.has(r.key) && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={by === 'company' ? 6 : 5} className="px-4 pb-3 pt-1">
                        <table className="w-full text-xs">
                          <thead>
                            <tr>
                              <th className={cn(TH, 'pl-4 pr-2 py-1')}>Project</th>
                              <th className={cn(TH, 'text-right px-2 py-1')}>Units</th>
                              <th className={cn(TH, 'px-2 py-1 hidden sm:table-cell')}>Where</th>
                              <th className={cn(TH, 'px-2 py-1 hidden sm:table-cell')}>From</th>
                              <th className={cn(TH, 'px-2 py-1')}>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(r.items || []).map(it => (
                              <tr key={it.signalId || it.label} className="border-t border-slate-100">
                                <td className="pl-4 pr-2 py-1 text-slate-700">
                                  <Link
                                    href={signalHref({ id: it.signalId, kind: it.kind })}
                                    onClick={e => e.stopPropagation()}
                                    className="hover:text-orange-600"
                                  >
                                    {it.label}
                                  </Link>
                                  {it.sources > 1 && <span className="ml-1 text-slate-500">({it.sources} articles, biggest figure counted)</span>}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums">{it.units.toLocaleString()}</td>
                                <td className="px-2 py-1 text-slate-500 hidden sm:table-cell">{it.metro || ''}</td>
                                <td className="px-2 py-1 text-slate-500 hidden sm:table-cell">{it.kind === 'PERMIT' ? 'Permit' : it.kind === 'CONCEPT' ? 'Concept plan' : 'Article'}</td>
                                <td className="px-2 py-1 text-slate-500 whitespace-nowrap tabular-nums">{it.publishedAt ? new Date(it.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
