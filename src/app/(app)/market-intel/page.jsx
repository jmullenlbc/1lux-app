'use client';
import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import Link from 'next/link';
import AskPanel from './AskPanel';
import SectionTabs, { MARKET_INTEL_TABS } from '@/components/ui/SectionTabs';
import SignalCard, { PROJECT_TYPE_LABELS, SIGNAL_TYPE_META } from '@/components/market-intel/SignalCard';
import MacroStrip from '@/components/market-intel/MacroStrip';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import { SortSelect } from '@/components/ui/SortHeader';
import { WidgetEmpty, WidgetLoading } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { H1, HELPER, LABEL, INPUT, BTN_PRIMARY, BTN_COMPACT, TONE } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';

// A bell notification links to /market-intel?signal=<id>. The address is read
// by useUrlView, so the page keeps a thin Suspense wrapper.
export default function MarketIntelPage() {
  return (
    <Suspense fallback={<WidgetLoading />}>
      <MarketIntelInner />
    </Suspense>
  );
}

// Filters live in the page address (Mike 10-16) so a reload or shared link keeps them.
// `signal` is the single-article deep link; any filter change leaves it behind.
const FILTER_FIELDS = [
  { key: 'reviewStatus', label: 'Review status', kind: 'pick' },
  { key: 'signalType',   label: 'Signal type',   kind: 'pick' },
  { key: 'projectType',  label: 'Project type',  kind: 'pick' },
  { key: 'clientId',     label: 'Client',        kind: 'pick' },
  { key: 'metro',        label: 'Metro',         kind: 'pick' },
  { key: 'state',        label: 'State',         kind: 'pick' },
  { key: 'assignedTo',   label: 'Assigned to',   kind: 'pick' },
  { key: 'screened',     label: 'Screened out',  kind: 'pick' },
  { key: 'company',      label: 'Company',       kind: 'text' },
  { key: 'project',      label: 'Project',       kind: 'text' },
  { key: 'signal',       label: 'Signal id',     kind: 'text' },
];
const PANEL_FIELDS = FILTER_FIELDS.filter(f => f.key !== 'signal' && f.key !== 'reviewStatus');
const SORT_FIELDS  = [{ key: 'date', label: 'Date' }, { key: 'relevance', label: 'Relevance' }];
const SORT_DEFAULT = { key: 'date', dir: 'desc' };

// Sort is done by the server because the list is paged (Mike 10-8).
function serverSort(sort) {
  if (sort?.key === 'relevance') return 'relevant';
  return sort?.dir === 'asc' ? 'oldest' : 'newest';
}

function MarketIntelInner() {
  const { filters, setFilter, replaceFilters, clearFilters, sort, setSort, ready } = useUrlView({ fields: FILTER_FIELDS, sortDefault: SORT_DEFAULT });
  const [signals,      setSignals]      = useState([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [searchInput,  setSearchInput]  = useState('');
  const [clients,      setClients]      = useState([]);  // clients with matched signals
  const [tagOptions,   setTagOptions]   = useState({ METRO: [], STATE: [] });
  const [salesUsers,   setSalesUsers]   = useState([]);
  const [panelOpen,    setPanelOpen]    = useState(false);
  const searchDebounce = useRef(null);

  // Unreviewed is the default view; a deep link to one article shows it whatever its status.
  const reviewStatus = filters.reviewStatus || (filters.signal ? 'ALL' : 'UNREVIEWED');

  // Load clients with signals, the place tags and the sales team once
  useEffect(() => {
    fetch('/api/market-intel/clients')
      .then(r => r.json())
      .then(d => setClients(d.clients || []))
      .catch(() => {});
    fetch('/api/market-intel/tags')
      .then(r => r.json())
      .then(d => setTagOptions({ METRO: d.tags?.METRO || [], STATE: d.tags?.STATE || [] }))
      .catch(() => {});
    fetch('/api/users?department=SALES_MARKETING')
      .then(r => r.json())
      .then(d => setSalesUsers(d.users || []))
      .catch(() => {});
  }, []);

  const fetchSignals = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      for (const key of ['projectType', 'signalType', 'clientId', 'metro', 'state', 'company', 'project', 'assignedTo', 'screened']) {
        if (filters[key]) params.set(key, filters[key]);
      }
      if (reviewStatus !== 'ALL') params.set('reviewStatus', reviewStatus);
      if (filters.signal)         params.set('signalId',     filters.signal);
      if (search)                 params.set('search',       search);
      const sortValue = serverSort(sort);
      if (sortValue !== 'newest') params.set('sort',         sortValue);
      const res  = await fetch(`/api/market-intel/signals?${params}`);
      const data = await res.json();
      setSignals(data.signals || []);
      setTotal(data.total   || 0);
    } finally {
      setLoading(false);
    }
  }, [ready, filters, reviewStatus, page, search, sort]);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  function changeFilter(key, value) {
    // Any filter change leaves the single-article deep link behind.
    const next = { ...filters, [key]: value };
    delete next.signal;
    if (value === undefined || value === null || value === '') delete next[key];
    replaceFilters(next);
    setPage(1);
  }

  // Clicking a chip on a card filters the list by that tag (0122).
  function filterByTag(tag) {
    const key = { COMPANY: 'company', PROJECT: 'project', METRO: 'metro', STATE: 'state' }[tag.kind];
    if (!key) return;
    const next = { ...filters, [key]: tag.name, reviewStatus: 'ALL' };
    delete next.signal;
    replaceFilters(next);
    setPage(1);
  }

  // Articles not read for tags yet (Mike 10-9: "I still do not see tags").
  // Every read failed 10-5 to 10-9 for lack of credit, so a backlog waits;
  // the button reads it 25 per call, looping until none are left.
  const [unread,   setUnread]   = useState(0);
  const [reading,  setReading]  = useState(false);
  const [readNote, setReadNote] = useState('');
  useEffect(() => {
    fetch('/api/market-intel/retag').then(r => r.json()).then(d => setUnread(d.remaining || 0)).catch(() => {});
  }, []);
  async function readTags() {
    setReading(true);
    setReadNote('');
    let tagged = 0, hidden = 0;
    try {
      for (let i = 0; i < 80; i++) {
        const res  = await fetch('/api/market-intel/retag', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        const log  = data.log || {};
        if (!res.ok) { setReadNote('The read stopped. Press again to continue.'); break; }
        tagged += log.tagged || 0;
        hidden += log.screenedOut || 0;
        setUnread(log.remaining ?? 0);
        setReadNote(`Tagged ${tagged}, hid ${hidden} not about a project${log.remaining ? `, ${log.remaining} still waiting` : ''}`);
        if (log.readFailed && !(log.tagged || log.screenedOut)) { setReadNote(`The reader could not run: ${log.readError || 'unknown error'}`); break; }
        if (i % 3 === 2) fetchSignals();
        if (!log.remaining) break;
      }
    } finally {
      setReading(false);
      fetchSignals();
    }
  }

  async function updateSignal(id, patch) {
    await fetch(`/api/market-intel/signals/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    fetchSignals();
  }

  // Not relevant with a reason (0130): the row is hidden and the system learns.
  async function notRelevant(id, body) {
    const res  = await fetch(`/api/market-intel/signals/${id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'Could not save'); return; }
    fetchSignals();
  }

  // Add to CRM (Mike 10-7): the named company becomes a client, the article links to it.
  async function addToCrm(id, tagId) {
    const res  = await fetch(`/api/market-intel/signals/${id}/add-to-crm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagId }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'Could not add to CRM'); return; }
    fetchSignals();
  }

  const totalPages = Math.ceil(total / 50);

  function handleSearchChange(val) {
    setSearchInput(val);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(val.trim());
      setPage(1);
    }, 350);
  }

  const filterCount = countFilters(filters, FILTER_FIELDS);
  const hasActiveFilters = filterCount > 0 || !!search;

  // Choices for the pick fields; place filters come from the tags articles actually carry (0122).
  const choices = useMemo(() => ({
    signalType:  Object.entries(SIGNAL_TYPE_META).filter(([k]) => k !== 'PERMIT').map(([k, v]) => [k, v.label]),
    projectType: Object.entries(PROJECT_TYPE_LABELS),
    clientId:    clients.map(c => [c.id, c.name]),
    metro:       tagOptions.METRO.map(t => [t.name, `${t.name} (${t.count})`]),
    state:       tagOptions.STATE.map(t => [t.name, `${t.name} (${t.count})`]),
    assignedTo:  [['me', 'Assigned to me'], ...salesUsers.map(u => [u.id, u.name])],
    // The reader hides articles that are not about a project (0125). This
    // shows only those, so a wrong call can be kept.
    screened:    [['1', 'Only screened out']],
  }), [clients, tagOptions, salesUsers]);

  return (
    <div className="p-6">
      {/* Market Intelligence / Sources tabs (Mike 10-6) replace the Manage Sources button. */}
      <SectionTabs tabs={MARKET_INTEL_TABS} />
      <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className={H1}>Market Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5 tabular-nums">
            {total.toLocaleString()} signal{total !== 1 ? 's' : ''} · industry news matched to clients
          </p>
        </div>
      </div>

      {/* National numbers (0128): rates, 5+ unit starts, permits, costs, rents. */}
      <MacroStrip />

      <AskPanel />

      {(unread > 0 || readNote) && (
        <div className={cn('flex flex-wrap items-center justify-between gap-3 mb-4 rounded-xl border px-4 py-3', TONE.warning)}>
          <p className="text-sm">
            {readNote || `${unread.toLocaleString()} article${unread === 1 ? '' : 's'} not read for tags yet. Tags (companies, projects, project type, place) show once an article is read.`}
          </p>
          {unread > 0 && (
            <button onClick={readTags} disabled={reading} className={cn(BTN_PRIMARY, 'whitespace-nowrap')}>
              {reading ? 'Reading…' : 'Read tags now'}
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-5">
        <FilterToolbar
          count={filterCount}
          open={panelOpen}
          onToggle={() => setPanelOpen(o => !o)}
          onClear={() => { clearFilters(); setSearchInput(''); setSearch(''); setPage(1); }}
          right={
            <>
              <SortSelect fields={SORT_FIELDS} sort={sort} onChange={s => { setSort(s.key ? s : SORT_DEFAULT); setPage(1); }} />
              <SearchBox value={searchInput} onChange={handleSearchChange} placeholder="Search signals…" />
            </>
          }
        >
          {hasActiveFilters && !filterCount && (
            <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} className="text-xs font-semibold text-orange-600 hover:text-orange-700">
              Clear search
            </button>
          )}
        </FilterToolbar>
        <FilterPanel open={panelOpen} fields={PANEL_FIELDS} filters={filters} choices={choices} onChange={changeFilter}>
          <div>
            <label htmlFor="flt-reviewStatus" className={LABEL}>Review status</label>
            <select id="flt-reviewStatus" className={cn(INPUT, 'mt-1')} value={reviewStatus} onChange={e => changeFilter('reviewStatus', e.target.value)}>
              <option value="UNREVIEWED">Unreviewed</option>
              <option value="ALL">All</option>
              <option value="REVIEWED">Reviewed</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
          </div>
        </FilterPanel>
      </div>

      {/* Signal list */}
      {loading ? (
        <WidgetLoading />
      ) : signals.length === 0 ? (
        <WidgetEmpty>
          <span className="block font-medium">No signals match these filters</span>
          <span className={cn(HELPER, 'block mt-1')}>Run a poll from Manage Sources to fetch fresh articles</span>
        </WidgetEmpty>
      ) : (
        <div className="space-y-2">
          {signals.map(signal => (
            <SignalCard key={signal.id} signal={signal} onUpdate={updateSignal} onTagClick={filterByTag} onProjectTypeClick={t => changeFilter('projectType', t)} onAddToCrm={addToCrm} onNotRelevant={notRelevant} salesUsers={salesUsers} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className={BTN_COMPACT}
          >
            Previous
          </button>
          <span className="text-sm text-slate-500 tabular-nums">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className={BTN_COMPACT}
          >
            Next
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
