'use client';
import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import SectionTabs, { MARKET_INTEL_TABS } from '@/components/ui/SectionTabs';
import SignalCard from '@/components/market-intel/SignalCard';
import { postParked } from '@/lib/parkedFetch';
import { STAGES, isEntitlementClass, NOTICE_TYPE_OPTIONS } from '@/lib/market-intel/stages';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import { SortSelect } from '@/components/ui/SortHeader';
import { WidgetEmpty, WidgetLoading } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { H1, HELPER, LABEL, INPUT, CARD, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';

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
const STAGE_LABEL   = Object.fromEntries(STAGES.map(s => [s.value, s.chip]));
const ROLE_LABELS   = { DEVELOPER: 'developer', OWNER: 'owner', INVESTOR: 'investor', BUYER: 'likely land buyer', GC: 'GC', ARCHITECT: 'architect', LENDER: 'lender', OTHER: 'filer' };
function classesFor(stage) {
  if (stage === 'PERMIT')      return PERMIT_CLASSES;
  if (stage === 'CONCEPT')     return CONCEPT_CLASSES.filter(c => !isEntitlementClass(c));
  if (stage === 'ENTITLEMENT') return CONCEPT_CLASSES.filter(isEntitlementClass);
  if (stage === 'COUNCIL')     return [];
  if (stage === 'LAND')        return [];
  return [...CONCEPT_CLASSES, ...PERMIT_CLASSES];
}
const STAGE_NOUN = { ALL: 'filing', PERMIT: 'permit', CONCEPT: 'concept submission', ENTITLEMENT: 'site entitlement', COUNCIL: 'council approval', LAND: 'land sale' };

export default function PermitsPage() {
  return (
    <Suspense fallback={<WidgetLoading />}>
      <PermitsInner />
    </Suspense>
  );
}

// Filters live in the page address (Mike 10-16) so a reload or shared link keeps
// them. `stage` and `signal` are also the deep links a bell notification uses.
const FILTER_FIELDS = [
  { key: 'stage',        label: 'Stage',          kind: 'pick' },
  { key: 'reviewStatus', label: 'Review status',  kind: 'pick' },
  { key: 'permitClass',  label: 'Case type',      kind: 'pick' },
  { key: 'notice',       label: 'Notice type',    kind: 'pick' },
  { key: 'hasUnits',     label: 'Unit count',     kind: 'pick' },
  { key: 'buyer',        label: 'Filer',          kind: 'pick' },
  { key: 'clientId',     label: 'Client',         kind: 'pick' },
  { key: 'metro',        label: 'Metro',          kind: 'pick' },
  { key: 'state',        label: 'State',          kind: 'pick' },
  { key: 'assignedTo',   label: 'Assigned to',    kind: 'pick' },
  { key: 'company',      label: 'Company',        kind: 'text' },
  { key: 'project',      label: 'Project',        kind: 'text' },
  { key: 'signal',       label: 'Signal id',      kind: 'text' },
];
const PANEL_FIELDS = FILTER_FIELDS.filter(f => !['signal', 'stage', 'reviewStatus'].includes(f.key));
const SORT_FIELDS  = [
  { key: 'date',       label: 'Date' },
  { key: 'value',      label: 'Value' },
  { key: 'units',      label: 'Units' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'address',    label: 'Address' },
];
const SORT_DEFAULT = { key: 'date', dir: 'desc' };

// Sort is done by the server because the list is paged (Mike 10-8). Value and
// units come back highest first, contractor and address A to Z.
function serverSort(sort) {
  if (!sort?.key || sort.key === 'date') return sort?.dir === 'asc' ? 'oldest' : 'newest';
  return sort.key;
}

function PermitsInner() {
  const { filters, replaceFilters, clearFilters, sort, setSort, ready } = useUrlView({ fields: FILTER_FIELDS, sortDefault: SORT_DEFAULT });
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
  const [panelOpen,   setPanelOpen]   = useState(false);
  // By company (Mike 10-9): the same filters, grouped by the company behind them.
  const [view,        setView]        = useState('filing');
  const [companies,   setCompanies]   = useState([]);
  const searchDebounce = useRef(null);

  const stage        = STAGE_OPTIONS.some(k => k.value === filters.stage) ? filters.stage : 'ALL';
  // Unreviewed is the default view; a deep link to one filing shows it whatever its status.
  const reviewStatus = filters.reviewStatus || (filters.signal ? 'ALL' : 'UNREVIEWED');

  useEffect(() => {
    fetch('/api/market-intel/clients').then(r => r.json()).then(d => setClients(d.clients || [])).catch(() => {});
    fetch('/api/market-intel/tags').then(r => r.json()).then(d => setTagOptions({ METRO: d.tags?.METRO || [], STATE: d.tags?.STATE || [] })).catch(() => {});
    fetch('/api/users?department=SALES_MARKETING').then(r => r.json()).then(d => setSalesUsers(d.users || [])).catch(() => {});
  }, []);

  const fetchSignals = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), stage });
      for (const key of ['permitClass', 'clientId', 'metro', 'state', 'company', 'project', 'notice', 'assignedTo', 'hasUnits', 'buyer']) {
        if (filters[key]) params.set(key, filters[key]);
      }
      if (reviewStatus !== 'ALL') params.set('reviewStatus', reviewStatus);
      if (filters.signal) params.set('signalId', filters.signal);
      if (search) params.set('search', search);
      const sortValue = serverSort(sort);
      if (sortValue !== 'newest') params.set('sort', sortValue);
      if (view === 'company') params.set('view', 'company');
      const res  = await fetch(`/api/market-intel/signals?${params}`);
      const data = await res.json();
      setSignals(data.signals || []);
      setCompanies(data.companies || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [ready, filters, stage, reviewStatus, page, search, sort, view]);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  // Any filter change leaves the single-filing deep link behind.
  function setFilter(key, value, extra = {}) {
    const next = { ...filters, [key]: value, ...extra };
    delete next.signal;
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === null || next[k] === '') delete next[k];
    replaceFilters(next);
    setPage(1);
  }

  function filterByTag(tag) {
    const key = { COMPANY: 'company', PROJECT: 'project', NOTICE: 'notice', METRO: 'metro', STATE: 'state' }[tag.kind];
    if (!key) return;
    setFilter(key, tag.name, { reviewStatus: 'ALL' });
  }

  async function updateSignal(id, patch) {
    await fetch(`/api/market-intel/signals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    fetchSignals();
  }

  // Not relevant with a reason (0130): the row is hidden and the system learns.
  async function notRelevant(id, body) {
    const res  = await fetch(`/api/market-intel/signals/${id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'Could not save'); return; }
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

  const totalPages  = Math.ceil(total / 50);
  const filterCount = countFilters(filters, FILTER_FIELDS);

  const choices = useMemo(() => ({
    permitClass: classesFor(stage),
    notice:      NOTICE_TYPE_OPTIONS,
    hasUnits:    [['1', 'Has a unit count']],
    buyer:       [['1', 'Likely land buyer']],
    clientId:    clients.map(c => [c.id, c.name]),
    metro:       tagOptions.METRO.map(t => t.name),
    state:       tagOptions.STATE.map(t => t.name),
    assignedTo:  [['me', 'Assigned to me'], ...salesUsers.map(u => [u.id, u.name])],
  }), [stage, clients, tagOptions, salesUsers]);

  return (
    <div className="p-6">
      <SectionTabs tabs={MARKET_INTEL_TABS} />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className={H1}>Municipal filings</h1>
            <p className="text-sm text-slate-500 mt-0.5 tabular-nums">
              {total.toLocaleString()} {view === 'company' ? `compan${total === 1 ? 'y' : 'ies'}` : `${STAGE_NOUN[stage] || 'filing'}${total !== 1 ? 's' : ''}`} · land sales, concept submissions, site entitlements, council approvals and permits from city feeds, matched to clients
            </p>
            {pollNote && <p className={cn(HELPER, 'mt-1')}>{pollNote}</p>}
            {findNote && <p className={cn(HELPER, 'mt-1')}>{findNote}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={findOwners}
              disabled={finding}
              className={cn(BTN_SECONDARY, 'whitespace-nowrap')}
              title="Search the web for who is behind each permit or concept plan that does not name an owner yet, newest first, three at a time"
            >
              {finding ? 'Searching…' : 'Find owners'}
            </button>
            <button
              onClick={pullPermits}
              disabled={polling}
              className={cn(BTN_PRIMARY, 'whitespace-nowrap')}
            >
              {polling ? 'Loading...' : 'Pull city filings now'}
            </button>
          </div>
        </div>

        <div className="mb-5">
          <FilterToolbar
            count={filterCount}
            open={panelOpen}
            onToggle={() => setPanelOpen(o => !o)}
            onClear={() => { clearFilters(); setSearchInput(''); setSearch(''); setPage(1); }}
            right={
              <>
                <SortSelect fields={SORT_FIELDS} sort={sort} onChange={s => { setSort(s.key ? s : SORT_DEFAULT); setPage(1); }} />
                <SearchBox value={searchInput} onChange={handleSearchChange} placeholder="Search address, contractor, owner…" />
              </>
            }
          >
            <select value={view} onChange={e => { setView(e.target.value); setPage(1); }} className={cn(INPUT, 'w-auto py-1.5 text-xs')} title="One row per filing, or one per company">
              <option value="filing">By filing</option>
              <option value="company">By company</option>
            </select>
            <select value={stage} onChange={e => setFilter('stage', e.target.value === 'ALL' ? '' : e.target.value, { permitClass: '' })} className={cn(INPUT, 'w-auto py-1.5 text-xs')} title="Project stage">
              {STAGE_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            {search && !filterCount && (
              <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} className="text-xs font-semibold text-orange-600 hover:text-orange-700">
                Clear search
              </button>
            )}
          </FilterToolbar>
          <FilterPanel open={panelOpen} fields={PANEL_FIELDS} filters={filters} choices={choices} onChange={setFilter}>
            <div>
              <label htmlFor="flt-reviewStatus" className={LABEL}>Review status</label>
              <select id="flt-reviewStatus" className={cn(INPUT, 'mt-1')} value={reviewStatus} onChange={e => setFilter('reviewStatus', e.target.value)}>
                <option value="UNREVIEWED">Unreviewed</option>
                <option value="ALL">All</option>
                <option value="REVIEWED">Reviewed</option>
                <option value="DISMISSED">Dismissed</option>
              </select>
            </div>
          </FilterPanel>
        </div>

        {loading ? (
          <WidgetLoading />
        ) : signals.length === 0 ? (
          <WidgetEmpty>
            <span className="block font-medium">No {STAGE_NOUN[stage] || 'filing'}s match these filters</span>
            <span className={cn(HELPER, 'block mt-1')}>
              {stage === 'COUNCIL'
                ? 'Council rezonings come from the agendas of Denver, Phoenix, Mesa, Dallas, Austin, Jacksonville and Hillsborough County. Press Pull city filings now.'
                : stage === 'LAND'
                ? 'Land sales come from the Denver assessor: closed sales to a company on land zoned for apartments, mixed use or commercial. Press Pull city filings now.'
                : 'Press Pull city filings now to read the city feeds. One pull reads permits, planning cases and land sales together.'}
            </span>
          </WidgetEmpty>
        ) : view === 'company' ? (
          <div className="space-y-2">
            {companies.map(c => (
              <div key={c.tagId} className={cn(CARD, 'px-4 py-3')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button onClick={() => { setView('filing'); filterByTag({ kind: 'COMPANY', name: c.name }); }} className="text-sm font-semibold text-slate-800 hover:text-orange-600 text-left" title="Show this company's filings">
                      {c.name}
                    </button>
                    <div className={cn(HELPER, 'mt-0.5')}>
                      {c.roles.map(r => ROLE_LABELS[r] || r.toLowerCase()).join(', ')}
                      {c.cities.length > 0 && <> · {c.cities.join(', ')}</>}
                      {c.clientId && <span className="ml-2 text-green-600">In CRM</span>}
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-x-4 text-xs text-right shrink-0 tabular-nums">
                    <div><dt className={LABEL}>Filings</dt><dd className="font-medium text-slate-700">{c.filings}</dd></div>
                    <div><dt className={LABEL}>Units</dt><dd className="font-medium text-slate-700">{c.totalUnits ? c.totalUnits.toLocaleString() : 'None stated'}</dd></div>
                    <div><dt className={LABEL}>Latest</dt><dd className="font-medium text-slate-700">{c.latestAt ? new Date(c.latestAt).toLocaleDateString() : ''}</dd></div>
                  </dl>
                </div>
                <ul className="mt-2 space-y-0.5">
                  {c.signals.slice(0, 5).map(s => (
                    <li key={s.id} className="text-xs text-slate-600 truncate">
                      <span className="text-slate-500">{STAGE_LABEL[s.stage] || s.kind}</span> · {s.title}
                    </li>
                  ))}
                  {c.signals.length > 5 && <li className={HELPER}>and {c.signals.length - 5} more</li>}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {signals.map(signal => (
              <SignalCard key={signal.id} signal={signal} onUpdate={updateSignal} onTagClick={filterByTag} onAddToCrm={addToCrm} onFindOwner={findOwner} onNotRelevant={notRelevant} salesUsers={salesUsers} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className={BTN_COMPACT}>Previous</button>
            <span className="text-sm text-slate-500 tabular-nums">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className={BTN_COMPACT}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
