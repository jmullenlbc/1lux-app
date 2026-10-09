'use client';
import { useState, useEffect, useMemo, Fragment } from 'react';
import Link from 'next/link';
import SectionTabs, { MARKET_INTEL_TABS } from '@/components/ui/SectionTabs';
import { signalHref } from '@/components/market-intel/SignalCard';

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
const SELECT_CLS = 'text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400';

export default function ForecastPage() {
  const [by,      setBy]      = useState('company');
  const [months,  setMonths]  = useState(12);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  // Filters (Mike 10-8: "I still need the pipeline tab to have filterability").
  // Metro and state narrow the articles counted (server side); clients only
  // and the name box narrow the rows shown.
  const [metro,       setMetro]       = useState('');
  const [state,       setState]       = useState('');
  const [clientsOnly, setClientsOnly] = useState(false);
  const [nameFilter,  setNameFilter]  = useState('');
  // Permits or press, and which company role (Mike 10-8: contractors were mixed in with developers).
  const [kind,        setKind]        = useState('');
  const [role,        setRole]        = useState('');
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
  // Click a column header to sort; click again to flip (Mike 10-8).
  const [sortKey, setSortKey] = useState('units');
  const [sortDir, setSortDir] = useState('desc');
  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'label' ? 'asc' : 'desc'); }
  }

  useEffect(() => {
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
  }, [by, months, metro, state, kind, role]);

  const rows = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    const list = (data?.rows || []).filter(r =>
      (!clientsOnly || r.clientId) &&
      (!needle || String(r.label || '').toLowerCase().includes(needle))
    );
    const dir  = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string' || typeof bv === 'string') return dir * String(av || '').localeCompare(String(bv || ''));
      return dir * ((av || 0) - (bv || 0));
    });
    return list;
  }, [data, sortKey, sortDir, clientsOnly, nameFilter]);
  const hasFilters = metro || state || clientsOnly || nameFilter || kind || role;
  const max  = Math.max(1, ...(data?.rows || []).map(r => r.units || 0));
  const filterKey = { company: 'company', metro: 'metro', state: 'state' }[by];
  const Th = ({ col, children, right }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`${right ? 'text-right' : 'text-left'} px-4 py-2 font-semibold cursor-pointer select-none hover:text-slate-800`}
    >
      {children}{sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div className="p-6">
      <SectionTabs tabs={MARKET_INTEL_TABS} />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Pipeline forecast</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {data ? `${data.totalUnits.toLocaleString()} units announced across ${data.articles.toLocaleString()} article${data.articles === 1 ? '' : 's'}` : 'Units announced in the press'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
            {BY_OPTIONS.map(o => (
              <button
                key={o.key}
                onClick={() => setBy(o.key)}
                className={`px-3 py-1.5 text-sm ${by === o.key ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <select value={months} onChange={e => setMonths(Number(e.target.value))} className={SELECT_CLS}>
            {MONTH_OPTIONS.map(m => <option key={m} value={m}>Last {m} months</option>)}
          </select>
          {tagOptions.METRO.length > 0 && (
            <select value={metro} onChange={e => setMetro(e.target.value)} className={SELECT_CLS}>
              <option value="">All metros</option>
              {tagOptions.METRO.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          )}
          {tagOptions.STATE.length > 0 && (
            <select value={state} onChange={e => setState(e.target.value)} className={SELECT_CLS}>
              <option value="">All states</option>
              {tagOptions.STATE.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          )}
          <select value={kind} onChange={e => setKind(e.target.value)} className={SELECT_CLS}>
            <option value="">Permits, concept plans and articles</option>
            <option value="PERMIT">Permits only</option>
            <option value="CONCEPT">Concept plans only</option>
            <option value="ARTICLE">Articles only</option>
          </select>
          {by === 'company' && (
            <select value={role} onChange={e => setRole(e.target.value)} className={SELECT_CLS}>
              <option value="">All roles</option>
              <option value="DEVELOPER">Developers and owners</option>
              <option value="GC">Contractors</option>
              <option value="OTHER">Architects, lenders, others</option>
            </select>
          )}
          <input
            type="text"
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder={by === 'company' ? 'Company name…' : by === 'metro' ? 'Metro…' : 'State…'}
            className={`${SELECT_CLS} w-44`}
          />
          {by === 'company' && (
            <label className={`${SELECT_CLS} flex items-center gap-2 cursor-pointer ${clientsOnly ? 'bg-amber-50 border-amber-300' : ''}`}>
              <input type="checkbox" checked={clientsOnly} onChange={e => setClientsOnly(e.target.checked)} className="accent-amber-500" />
              Clients only
            </label>
          )}
          {hasFilters && (
            <button
              onClick={() => { setMetro(''); setState(''); setClientsOnly(false); setNameFilter(''); setKind(''); setRole(''); }}
              className="text-sm text-slate-400 hover:text-slate-600 px-2"
            >
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="font-medium">{hasFilters ? 'Nothing matches these filters' : 'No unit counts yet'}</p>
            <p className="text-xs mt-1">{hasFilters ? 'Clear a filter to widen the list.' : 'Articles get a unit count when they are read. Press "Screen articles" on the Sources tab to fill in older ones.'}</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <Th col="label">{by === 'company' ? 'Company' : by === 'metro' ? 'Metro' : 'State'}</Th>
                  <Th col="units" right>Units</Th>
                  <Th col="projects" right>Projects</Th>
                  <Th col="articles" right>Articles</Th>
                  {by === 'company' && <th className="text-left px-4 py-2 font-semibold">Where</th>}
                  <th className="px-4 py-2 w-40"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <Fragment key={r.key}>
                  <tr
                    onClick={() => toggleOpen(r.key)}
                    className={`border-t border-slate-100 cursor-pointer ${open.has(r.key) ? 'bg-amber-50/40' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-4 py-2 font-medium text-slate-800">
                      <span className="inline-block w-4 text-slate-400 text-xs">{open.has(r.key) ? '▾' : '▸'}</span>
                      {r.label}
                      {r.clientId && <Link href={`/clients/${r.clientId}`} onClick={e => e.stopPropagation()} className="ml-2 text-[11px] text-green-600 hover:underline">client ✓</Link>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.units.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.projects}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.articles}</td>
                    {by === 'company' && <td className="px-4 py-2 text-xs text-slate-500">{(r.metros || []).slice(0, 3).join(', ')}{(r.metros || []).length > 3 ? ', +' + (r.metros.length - 3) : ''}</td>}
                    <td className="px-4 py-2">
                      <div className="h-2 rounded bg-amber-100">
                        <div className="h-2 rounded bg-amber-500" style={{ width: `${Math.max(2, Math.round(100 * r.units / max))}%` }} />
                      </div>
                    </td>
                  </tr>
                  {open.has(r.key) && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={by === 'company' ? 6 : 5} className="px-4 pb-3 pt-1">
                        <table className="w-full text-xs">
                          <thead className="text-[11px] uppercase text-slate-400">
                            <tr>
                              <th className="text-left pl-4 pr-2 py-1 font-semibold">Project</th>
                              <th className="text-right px-2 py-1 font-semibold">Units</th>
                              <th className="text-left px-2 py-1 font-semibold">Where</th>
                              <th className="text-left px-2 py-1 font-semibold">From</th>
                              <th className="text-left px-2 py-1 font-semibold">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(r.items || []).map(it => (
                              <tr key={it.signalId || it.label} className="border-t border-slate-100">
                                <td className="pl-4 pr-2 py-1 text-slate-700">
                                  <Link
                                    href={signalHref({ id: it.signalId, kind: it.kind })}
                                    onClick={e => e.stopPropagation()}
                                    className="hover:text-amber-600"
                                  >
                                    {it.label}
                                  </Link>
                                  {it.sources > 1 && <span className="ml-1 text-slate-400">({it.sources} articles, biggest figure counted)</span>}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums">{it.units.toLocaleString()}</td>
                                <td className="px-2 py-1 text-slate-500">{it.metro || ''}</td>
                                <td className="px-2 py-1 text-slate-500">{it.kind === 'PERMIT' ? 'Permit' : it.kind === 'CONCEPT' ? 'Concept plan' : 'Article'}</td>
                                <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{it.publishedAt ? new Date(it.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</td>
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
