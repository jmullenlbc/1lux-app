'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SectionTabs, { MARKET_INTEL_TABS } from '@/components/ui/SectionTabs';
import SignalCard from '@/components/market-intel/SignalCard';

/**
 * Permits tab (migration 0123, Mike 10-7). Building permits pulled from a
 * city's open data, shown with the same tags, filters, assignment and review
 * as the news tab. Denver first; another city is one profile in permitRules.js.
 */
const PERMIT_CLASSES = ['New Building', 'Addition', 'Phased Construction', 'Foundation Only/Excavation'];

export default function PermitsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading…</div>}>
      <PermitsInner />
    </Suspense>
  );
}

const EMPTY_FILTERS = {
  reviewStatus: 'UNREVIEWED',
  permitClass:  '',
  clientId:     '',
  metro:        '',
  state:        '',
  company:      '',
  assignedTo:   '',
  hasUnits:     '',
  signalId:     '',
};

function PermitsInner() {
  const searchParams = useSearchParams();
  const deepLinkId   = searchParams.get('signal') || '';
  const [signals,     setSignals]     = useState([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [page,        setPage]        = useState(1);
  const [search,      setSearch]      = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [clients,     setClients]     = useState([]);
  const [tagOptions,  setTagOptions]  = useState({ METRO: [], STATE: [] });
  const [salesUsers,  setSalesUsers]  = useState([]);
  const [polling,     setPolling]     = useState(false);
  const [pollNote,    setPollNote]    = useState('');
  const [filters,     setFilters]     = useState(() => deepLinkId ? { ...EMPTY_FILTERS, reviewStatus: '', signalId: deepLinkId } : EMPTY_FILTERS);
  const searchDebounce = useRef(null);

  useEffect(() => {
    fetch('/api/market-intel/clients').then(r => r.json()).then(d => setClients(d.clients || [])).catch(() => {});
    fetch('/api/market-intel/tags').then(r => r.json()).then(d => setTagOptions({ METRO: d.tags?.METRO || [], STATE: d.tags?.STATE || [] })).catch(() => {});
    fetch('/api/users?department=SALES_MARKETING').then(r => r.json()).then(d => setSalesUsers(d.users || [])).catch(() => {});
  }, []);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), kind: 'PERMIT' });
      for (const key of ['reviewStatus', 'permitClass', 'clientId', 'metro', 'state', 'company', 'assignedTo', 'hasUnits', 'signalId']) {
        if (filters[key]) params.set(key, filters[key]);
      }
      if (search) params.set('search', search);
      const res  = await fetch(`/api/market-intel/signals?${params}`);
      const data = await res.json();
      setSignals(data.signals || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [filters, page, search]);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value, signalId: '' }));
    setPage(1);
  }

  function filterByTag(tag) {
    const key = { COMPANY: 'company', METRO: 'metro', STATE: 'state' }[tag.kind];
    if (!key) return;
    setFilters(f => ({ ...f, [key]: tag.name, reviewStatus: '', signalId: '' }));
    setPage(1);
  }

  async function updateSignal(id, patch) {
    await fetch(`/api/market-intel/signals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    fetchSignals();
  }

  async function addToCrm(id, tagId) {
    const res  = await fetch(`/api/market-intel/signals/${id}/add-to-crm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagId }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'Could not add to CRM'); return; }
    fetchSignals();
  }

  // Pull the city feeds now. Same button as the Sources tab, permits only.
  async function pullPermits() {
    setPolling(true);
    setPollNote('');
    try {
      const res  = await fetch('/api/market-intel/permits/poll', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPollNote(data.error || 'Pull failed'); return; }
      const logs = data.logs || [];
      const ins  = logs.reduce((n, l) => n + (l.inserted || 0), 0);
      const errs = logs.flatMap(l => l.errors || []);
      setPollNote(`${ins} new permit${ins === 1 ? '' : 's'}${errs.length ? `, ${errs.length} error${errs.length === 1 ? '' : 's'}: ${errs[0].error}` : ''}`);
      fetchSignals();
    } finally {
      setPolling(false);
    }
  }

  function handleSearchChange(val) {
    setSearchInput(val);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => { setSearch(val.trim()); setPage(1); }, 350);
  }

  const totalPages       = Math.ceil(total / 50);
  const hasActiveFilters = Object.keys(EMPTY_FILTERS).some(k => filters[k] !== EMPTY_FILTERS[k]) || search;
  const SELECT_CLS = 'text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400';

  return (
    <div className="p-6">
      <SectionTabs tabs={MARKET_INTEL_TABS} />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Permits</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {total.toLocaleString()} permit{total !== 1 ? 's' : ''} · new buildings and additions from city open data, matched to clients
            </p>
            {pollNote && <p className="text-xs text-slate-500 mt-1">{pollNote}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search address, contractor…"
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 w-56 placeholder:text-slate-400"
              />
            </div>
            <button
              onClick={pullPermits}
              disabled={polling}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 whitespace-nowrap"
            >
              {polling ? 'Pulling…' : 'Pull permits now'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <select value={filters.reviewStatus} onChange={e => setFilter('reviewStatus', e.target.value)} className={SELECT_CLS}>
            <option value="UNREVIEWED">Unreviewed</option>
            <option value="">All</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
          <select value={filters.permitClass} onChange={e => setFilter('permitClass', e.target.value)} className={SELECT_CLS}>
            <option value="">All permit classes</option>
            {PERMIT_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.hasUnits} onChange={e => setFilter('hasUnits', e.target.value)} className={SELECT_CLS}>
            <option value="">With or without units</option>
            <option value="1">Has a unit count</option>
          </select>
          {clients.length > 0 && (
            <select value={filters.clientId} onChange={e => setFilter('clientId', e.target.value)} className={SELECT_CLS}>
              <option value="">All clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {tagOptions.METRO.length > 0 && (
            <select value={filters.metro} onChange={e => setFilter('metro', e.target.value)} className={SELECT_CLS}>
              <option value="">All metros</option>
              {tagOptions.METRO.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          )}
          {tagOptions.STATE.length > 0 && (
            <select value={filters.state} onChange={e => setFilter('state', e.target.value)} className={SELECT_CLS}>
              <option value="">All states</option>
              {tagOptions.STATE.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          )}
          <select value={filters.assignedTo} onChange={e => setFilter('assignedTo', e.target.value)} className={SELECT_CLS}>
            <option value="">Anyone's</option>
            <option value="me">Assigned to me</option>
            {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {filters.company && (
            <span className="text-sm bg-slate-100 text-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-2">
              {filters.company}
              <button onClick={() => setFilter('company', '')} className="text-slate-400 hover:text-slate-600" title="Remove">✗</button>
            </span>
          )}
          {hasActiveFilters && (
            <button onClick={() => { setFilters(EMPTY_FILTERS); setSearchInput(''); setSearch(''); setPage(1); }} className="text-sm text-slate-400 hover:text-slate-600 px-2">
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : signals.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="font-medium">No permits match these filters</p>
            <p className="text-xs mt-1">Press Pull permits now to read the city feeds. Denver is the first city.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {signals.map(signal => (
              <SignalCard key={signal.id} signal={signal} onUpdate={updateSignal} onTagClick={filterByTag} onAddToCrm={addToCrm} salesUsers={salesUsers} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Previous</button>
            <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
