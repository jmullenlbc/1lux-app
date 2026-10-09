'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SectionTabs, { MARKET_INTEL_TABS } from '@/components/ui/SectionTabs';
import SignalCard from '@/components/market-intel/SignalCard';
import { postParked } from '@/lib/parkedFetch';
import { STAGES, isEntitlementClass } from '@/lib/market-intel/stages';

/**
 * Municipal tab (was Permits; renamed and staged Mike 10-9). Migration 0123, Mike 10-7. Building permits pulled from a
 * city's open data, shown with the same tags, filters, assignment and review
 * as the news tab. Denver first; another city is one profile in permitRules.js.
 */
const PERMIT_CLASSES = ['New Building', 'Addition', 'Phased Construction', 'Foundation Only/Excavation'];
// Concept plans (Mike 10-8): the planning cases filed about a year before the permit.
const CONCEPT_CLASSES = ['Site Plan Administrative', 'Site Plan Commission', 'Site Plan Small Project', 'Zoning/Rezoning', 'Planned Unit Development (PUD)', 'Concept Plan', 'Design Review', 'Planned Development', 'Conditional Use'];
// Stage filter (Mike 10-9), earliest stage first. See stages.js.
const STAGE_OPTIONS = [{ value: 'ALL', label: 'All stages' }, ...STAGES.map(s => ({ value: s.value, label: s.label }))];
function classesFor(stage) {
  if (stage === 'PERMIT')      return PERMIT_CLASSES;
  if (stage === 'CONCEPT')     return CONCEPT_CLASSES.filter(c => !isEntitlementClass(c));
  if (stage === 'ENTITLEMENT') return CONCEPT_CLASSES.filter(isEntitlementClass);
  if (stage === 'COUNCIL')     return [];
  return [...CONCEPT_CLASSES, ...PERMIT_CLASSES];
}
const STAGE_NOUN = { ALL: 'filing', PERMIT: 'permit', CONCEPT: 'concept submission', ENTITLEMENT: 'site entitlement', COUNCIL: 'council approval' };

export default function PermitsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading…</div>}>
      <PermitsInner />
    </Suspense>
  );
}

const EMPTY_FILTERS = {
  stage:        'ALL',
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
  const deepLinkKind = STAGE_OPTIONS.some(k => k.value === searchParams.get('stage')) ? searchParams.get('stage') : '';
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
  const [filters,     setFilters]     = useState(() => {
    const base = deepLinkKind ? { ...EMPTY_FILTERS, stage: deepLinkKind } : EMPTY_FILTERS;
    return deepLinkId ? { ...base, reviewStatus: '', signalId: deepLinkId } : base;
  });
  const [sort,        setSort]        = useState('newest');
  const searchDebounce = useRef(null);

  useEffect(() => {
    fetch('/api/market-intel/clients').then(r => r.json()).then(d => setClients(d.clients || [])).catch(() => {});
    fetch('/api/market-intel/tags').then(r => r.json()).then(d => setTagOptions({ METRO: d.tags?.METRO || [], STATE: d.tags?.STATE || [] })).catch(() => {});
    fetch('/api/users?department=SALES_MARKETING').then(r => r.json()).then(d => setSalesUsers(d.users || [])).catch(() => {});
  }, []);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), stage: filters.stage || 'ALL' });
      for (const key of ['reviewStatus', 'permitClass', 'clientId', 'metro', 'state', 'company', 'assignedTo', 'hasUnits', 'signalId']) {
        if (filters[key]) params.set(key, filters[key]);
      }
      if (search) params.set('search', search);
      if (sort !== 'newest') params.set('sort', sort);
      const res  = await fetch(`/api/market-intel/signals?${params}`);
      const data = await res.json();
      setSignals(data.signals || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [filters, page, search, sort]);

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
  // The server works in 22 s slices (Amplify cuts longer requests), so keep
  // pressing for it until it says it is done. A first pull of a city is a few
  // hundred rows and takes several slices.
  async function pullPermits() {
    setPolling(true);
    setPollNote('');
    let ins = 0;
    const errs = [];
    try {
      for (let round = 0; round < 60; round++) {
        const res  = await fetch('/api/market-intel/permits/poll', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setPollNote(data.error || `Pull failed after ${ins} new filing${ins === 1 ? '' : 's'}. Press again to continue.`); return; }
        const logs = data.logs || [];
        ins += logs.reduce((n, l) => n + (l.inserted || 0), 0);
        errs.push(...logs.flatMap(l => l.errors || []));
        fetchSignals();
        if (!data.more) break;
        setPollNote(`${ins} new filing${ins === 1 ? '' : 's'} so far, still pulling…`);
      }
      setPollNote(`${ins} new filing${ins === 1 ? '' : 's'}${errs.length ? `, ${errs.length} error${errs.length === 1 ? '' : 's'}: ${errs[0].error}` : ''}`);
    } finally {
      setPolling(false);
    }
  }

  // Who is behind a permit, from the web (0126). One card, or the whole
  // backlog three at a time; each call is a web research job that can run
  // past the front door's ~30 s, so it is parked and polled.
  const [finding,  setFinding]  = useState(false);
  const [findNote, setFindNote] = useState('');
  async function findOwner(id) {
    const res  = await postParked('/api/market-intel/owner-lookup', { signalId: id });
    const data = await res.json().catch(() => ({}));
    const log  = data.log || {};
    if (!res.ok) alert(data.message || data.error || 'The lookup failed');
    else if (log.readError) alert(`The web search could not run: ${log.readError}`);
    fetchSignals();
  }
  async function findOwners() {
    setFinding(true);
    setFindNote('');
    const total = { looked: 0, found: 0, readFailed: 0, readError: null, remaining: 0 };
    try {
      for (let round = 0; round < 40; round++) {
        const res  = await postParked('/api/market-intel/owner-lookup', {});
        const data = await res.json().catch(() => ({}));
        const log  = data.log || {};
        if (!res.ok) { setFindNote(data.message || data.error || 'The lookup failed. Press again to continue.'); return; }
        total.looked     += log.looked     || 0;
        total.found      += log.found      || 0;
        total.readFailed += log.readFailed || 0;
        total.readError   = total.readError || log.readError || null;
        total.remaining   = log.remaining ?? 0;
        fetchSignals();
        setFindNote(`Looked up ${total.looked}, found ${total.found}, ${total.remaining} still waiting${total.readError ? `. The web search could not run: ${total.readError}` : ''}`);
        if (!total.remaining) break;
        // The search is failing and nothing moved: pressing on burns calls.
        if (log.readFailed && !log.looked) break;
      }
    } finally {
      setFinding(false);
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
            <h1 className="text-xl font-semibold text-slate-900">Municipal filings</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {total.toLocaleString()} {STAGE_NOUN[filters.stage] || 'filing'}{total !== 1 ? 's' : ''} · concept submissions, site entitlements, council approvals and permits from city feeds, matched to clients
            </p>
            {pollNote && <p className="text-xs text-slate-500 mt-1">{pollNote}</p>}
            {findNote && <p className="text-xs text-slate-500 mt-1">{findNote}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search address, contractor, owner…"
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 w-56 placeholder:text-slate-400"
              />
            </div>
            <button
              onClick={findOwners}
              disabled={finding}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              title="Search the web for who is behind each permit or concept plan that does not name an owner yet, newest first, three at a time"
            >
              {finding ? 'Searching…' : 'Find owners'}
            </button>
            <button
              onClick={pullPermits}
              disabled={polling}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 whitespace-nowrap"
            >
              {polling ? 'Pulling…' : 'Pull city filings now'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <select value={filters.stage} onChange={e => { setFilter('stage', e.target.value); setFilter('permitClass', ''); }} className={SELECT_CLS} title="Project stage">
            {STAGE_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <select value={filters.reviewStatus} onChange={e => setFilter('reviewStatus', e.target.value)} className={SELECT_CLS}>
            <option value="UNREVIEWED">Unreviewed</option>
            <option value="">All</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
          <select value={filters.permitClass} onChange={e => setFilter('permitClass', e.target.value)} className={SELECT_CLS}>
            <option value="">All {filters.stage === 'PERMIT' ? 'permit' : 'case'} types</option>
            {classesFor(filters.stage).map(c => <option key={c} value={c}>{c}</option>)}
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
          {/* Sort is done by the server because the list is paged (Mike 10-8). */}
          <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }} className={SELECT_CLS} title="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="value">Highest value</option>
            <option value="units">Most units</option>
            <option value="contractor">Contractor A to Z</option>
            <option value="address">Address A to Z</option>
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
            <p className="font-medium">No {STAGE_NOUN[filters.stage] || 'filing'}s match these filters</p>
            <p className="text-xs mt-1">
              {filters.stage === 'COUNCIL'
                ? 'Council approvals come from city council agendas, which are not read yet.'
                : 'Press Pull city filings now to read the city feeds. One pull reads permits and planning cases together.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {signals.map(signal => (
              <SignalCard key={signal.id} signal={signal} onUpdate={updateSignal} onTagClick={filterByTag} onAddToCrm={addToCrm} onFindOwner={findOwner} salesUsers={salesUsers} />
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
