'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AskPanel from './AskPanel';
import SectionTabs, { MARKET_INTEL_TABS } from '@/components/ui/SectionTabs';

const PROJECT_TYPE_LABELS = {
  MARKET_RATE:    'Market Rate',
  AFFORDABLE:     'Affordable',
  STUDENT_HOUSING:'Student Housing',
  SENIOR_LIVING:  'Senior Living',
};

const SIGNAL_TYPE_META = {
  GROUNDBREAKING:  { label: 'Groundbreaking', color: 'bg-green-100 text-green-700'  },
  FINANCING:       { label: 'Financing',       color: 'bg-blue-100 text-blue-700'   },
  ACQUISITION:     { label: 'Acquisition',     color: 'bg-purple-100 text-purple-700'},
  DEVELOPER_AWARD: { label: 'Award',           color: 'bg-amber-100 text-amber-700' },
  NEWS:            { label: 'News',            color: 'bg-slate-100 text-slate-600' },
};

// A bell notification links to /market-intel?signal=<id>. useSearchParams needs
// a Suspense boundary in Next 14, so the page is a thin wrapper.
export default function MarketIntelPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading…</div>}>
      <MarketIntelInner />
    </Suspense>
  );
}

const EMPTY_FILTERS = {
  projectType:  '',
  signalType:   '',
  reviewStatus: 'UNREVIEWED',
  clientId:     '',
  metro:        '',
  state:        '',
  company:      '',
  project:      '',
  assignedTo:   '',
  signalId:     '',
};

function MarketIntelInner() {
  const searchParams = useSearchParams();
  const deepLinkId   = searchParams.get('signal') || '';
  const [signals,      setSignals]      = useState([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [searchInput,  setSearchInput]  = useState('');
  const [clients,      setClients]      = useState([]);  // clients with matched signals
  const [tagOptions,   setTagOptions]   = useState({ METRO: [], STATE: [] });
  const [salesUsers,   setSalesUsers]   = useState([]);
  const [filters,      setFilters]      = useState(() => deepLinkId ? { ...EMPTY_FILTERS, reviewStatus: '', signalId: deepLinkId } : EMPTY_FILTERS);
  const searchDebounce = useRef(null);

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
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      for (const key of ['projectType', 'signalType', 'reviewStatus', 'clientId', 'metro', 'state', 'company', 'project', 'assignedTo', 'signalId']) {
        if (filters[key]) params.set(key, filters[key]);
      }
      if (search)               params.set('search',       search);
      const res  = await fetch(`/api/market-intel/signals?${params}`);
      const data = await res.json();
      setSignals(data.signals || []);
      setTotal(data.total   || 0);
    } finally {
      setLoading(false);
    }
  }, [filters, page, search]);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  function setFilter(key, value) {
    // Any filter change leaves the single-article deep link behind.
    setFilters(f => ({ ...f, [key]: value, signalId: '' }));
    setPage(1);
  }

  // Clicking a chip on a card filters the list by that tag (0122).
  function filterByTag(tag) {
    const key = { COMPANY: 'company', PROJECT: 'project', METRO: 'metro', STATE: 'state' }[tag.kind];
    if (!key) return;
    setFilters(f => ({ ...f, [key]: tag.name, reviewStatus: '', signalId: '' }));
    setPage(1);
  }

  async function updateSignal(id, patch) {
    await fetch(`/api/market-intel/signals/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
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

  const hasActiveFilters = Object.keys(EMPTY_FILTERS).some(k => filters[k] !== EMPTY_FILTERS[k]) || search;
  const SELECT_CLS = 'text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400';

  return (
    <div className="p-6">
      {/* Market Intelligence / Sources tabs (Mike 10-6) replace the Manage Sources button. */}
      <SectionTabs tabs={MARKET_INTEL_TABS} />
      <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Market Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total.toLocaleString()} signal{total !== 1 ? 's' : ''} · industry news matched to clients
          </p>
        </div>
        {/* Top-right: Search */}
        <div className="flex flex-col items-end gap-2">
          {/* Search bar */}
          <div className="relative">
            <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search signals…"
              className="text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 w-52 placeholder:text-slate-400"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <AskPanel />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <select
          value={filters.reviewStatus}
          onChange={e => setFilter('reviewStatus', e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="UNREVIEWED">Unreviewed</option>
          <option value="">All</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="DISMISSED">Dismissed</option>
        </select>

        <select
          value={filters.signalType}
          onChange={e => setFilter('signalType', e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">All signal types</option>
          {Object.entries(SIGNAL_TYPE_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select
          value={filters.projectType}
          onChange={e => setFilter('projectType', e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">All project types</option>
          {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Client filter — only shows clients that have matched signals */}
        {clients.length > 0 && (
          <select
            value={filters.clientId}
            onChange={e => setFilter('clientId', e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">All clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {/* Place filters come from the tags articles actually carry (0122). */}
        {tagOptions.METRO.length > 0 && (
          <select value={filters.metro} onChange={e => setFilter('metro', e.target.value)} className={SELECT_CLS}>
            <option value="">All metros</option>
            {tagOptions.METRO.map(t => <option key={t.id} value={t.name}>{t.name} ({t.count})</option>)}
          </select>
        )}
        {tagOptions.STATE.length > 0 && (
          <select value={filters.state} onChange={e => setFilter('state', e.target.value)} className={SELECT_CLS}>
            <option value="">All states</option>
            {tagOptions.STATE.map(t => <option key={t.id} value={t.name}>{t.name} ({t.count})</option>)}
          </select>
        )}
        <select value={filters.assignedTo} onChange={e => setFilter('assignedTo', e.target.value)} className={SELECT_CLS}>
          <option value="">Anyone's</option>
          <option value="me">Assigned to me</option>
          {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(filters.company || filters.project) && (
          <span className="text-sm bg-slate-100 text-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-2">
            {filters.company || filters.project}
            <button onClick={() => setFilter(filters.company ? 'company' : 'project', '')} className="text-slate-400 hover:text-slate-600" title="Remove">✗</button>
          </span>
        )}

        {hasActiveFilters && (
          <button
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setSearchInput('');
              setSearch('');
              setPage(1);
            }}
            className="text-sm text-slate-400 hover:text-slate-600 px-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Signal list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : signals.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="font-medium">No signals match these filters</p>
          <p className="text-xs mt-1">Run a poll from Manage Sources to fetch fresh articles</p>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map(signal => (
            <SignalCard key={signal.id} signal={signal} onUpdate={updateSignal} onTagClick={filterByTag} salesUsers={salesUsers} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
          >
            Next
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

const ROLE_LABELS = { DEVELOPER: 'developer', OWNER: 'owner', INVESTOR: 'investor', GC: 'GC', ARCHITECT: 'architect', LENDER: 'lender' };
const TAG_STYLES  = {
  COMPANY: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  PROJECT: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
  METRO:   'bg-teal-50 text-teal-700 hover:bg-teal-100',
  STATE:   'bg-teal-50 text-teal-700 hover:bg-teal-100',
};

function SignalCard({ signal, onUpdate, onTagClick, salesUsers = [] }) {
  const meta         = SIGNAL_TYPE_META[signal.signalType] || SIGNAL_TYPE_META.NEWS;
  const developers   = (() => { try { return JSON.parse(signal.developerNames || '[]'); } catch { return []; } })();
  const isDismissed  = signal.reviewStatus === 'DISMISSED';
  const tagLinks     = signal.tags || [];
  // Hide the STATE chip when a METRO chip already names it ("Denver, CO").
  const metroStates  = new Set(tagLinks.filter(l => l.tag.kind === 'METRO').map(l => l.tag.name.split(',').pop()?.trim()));
  const chips        = tagLinks.filter(l => !(l.tag.kind === 'STATE' && metroStates.has(l.tag.name)));

  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 transition-opacity ${isDismissed ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Title + type chips */}
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
              {meta.label}
            </span>
            {signal.projectType && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {PROJECT_TYPE_LABELS[signal.projectType] || signal.projectType}
              </span>
            )}
            {signal.reviewStatus === 'REVIEWED' && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600">✓ Reviewed</span>
            )}
          </div>

          <a
            href={signal.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-slate-800 hover:text-amber-600 transition-colors line-clamp-2"
          >
            {signal.title}
          </a>

          {signal.summary && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{signal.summary}</p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className="text-xs text-slate-400">
              {signal.source?.name} · {signal.publishedAt ? new Date(signal.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
            </span>

            {/* Client match */}
            {signal.matchStatus === 'AUTO_LINKED' && signal.linkedClient && (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5 group">
                <Link href={`/clients/${signal.linkedClient.id}`} className="hover:underline">
                  ✓ {signal.linkedClient.name}
                </Link>
                <button
                  onClick={() => onUpdate(signal.id, { linkedClientId: null, matchStatus: 'REJECTED' })}
                  className="opacity-0 group-hover:opacity-100 text-green-400 hover:text-red-600 transition-all ml-0.5"
                  title="Wrong match — reject"
                >✗</button>
              </span>
            )}
            {signal.matchStatus === 'SUGGESTED' && signal.linkedClient && (
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                Possible: {signal.linkedClient.name}?
                <button
                  onClick={() => onUpdate(signal.id, { linkedClientId: signal.linkedClientId })}
                  className="ml-1 hover:text-green-700" title="Confirm match"
                >✓</button>
                <button
                  onClick={() => onUpdate(signal.id, { linkedClientId: null, matchStatus: 'REJECTED' })}
                  className="hover:text-red-600" title="Reject match"
                >✗</button>
              </span>
            )}
            {signal.matchStatus === 'REJECTED' && (
              <span className="text-xs text-slate-300 italic">No match</span>
            )}
            {/* Project match — a separate claim from the client match. "This is
                Zocalo" and "this is Trailhead" can be right and wrong independently,
                so each is confirmed or rejected on its own. */}
            {signal.projectMatchStatus === 'AUTO_LINKED' && signal.linkedProject && (
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5 group">
                <Link href={`/projects/${signal.linkedProject.id}`} className="hover:underline">
                  ✓ {signal.linkedProject.name}
                </Link>
                <button
                  onClick={() => onUpdate(signal.id, { linkedProjectId: null })}
                  className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-red-600 transition-all ml-0.5"
                  title="Not this job — reject"
                >✗</button>
              </span>
            )}
            {signal.projectMatchStatus === 'CONFIRMED' && signal.linkedProject && (
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5 group">
                <Link href={`/projects/${signal.linkedProject.id}`} className="hover:underline">
                  ✓ {signal.linkedProject.name}
                </Link>
                <button
                  onClick={() => onUpdate(signal.id, { linkedProjectId: null })}
                  className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-red-600 transition-all ml-0.5"
                  title="Not this job — reject"
                >✗</button>
              </span>
            )}
            {signal.projectMatchStatus === 'SUGGESTED' && signal.linkedProject && (
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                Our job: {signal.linkedProject.name}?
                <button
                  onClick={() => onUpdate(signal.id, { linkedProjectId: signal.linkedProjectId })}
                  className="ml-1 hover:text-green-700" title="Yes, this is that job"
                >✓</button>
                <button
                  onClick={() => onUpdate(signal.id, { linkedProjectId: null })}
                  className="hover:text-red-600" title="No, different job"
                >✗</button>
              </span>
            )}
            {developers.length > 0 && !signal.linkedClient && signal.matchStatus !== 'REJECTED' && chips.length === 0 && (
              <span className="text-xs text-slate-400 italic">{developers.join(', ')}</span>
            )}
          </div>

          {/* Tag chips (0122): company, project, place, units. Click one to filter. */}
          {(chips.length > 0 || signal.unitCount) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {chips.map(l => (
                <button
                  key={l.tag.id}
                  onClick={() => onTagClick?.(l.tag)}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${TAG_STYLES[l.tag.kind] || TAG_STYLES.COMPANY}`}
                  title={`Show all ${l.tag.kind === 'COMPANY' ? 'articles naming' : 'articles tagged'} ${l.tag.name}`}
                >
                  {l.tag.name}
                  {l.tag.kind === 'COMPANY' && l.role && ROLE_LABELS[l.role] ? <span className="opacity-60"> · {ROLE_LABELS[l.role]}</span> : null}
                  {l.tag.kind === 'COMPANY' && l.tag.clientId ? <span className="text-green-600"> ✓</span> : null}
                </button>
              ))}
              {signal.unitCount ? (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                  {signal.unitCount.toLocaleString()} units
                </span>
              ) : null}
            </div>
          )}

          {/* Hand it to a salesperson. They get a bell notification. */}
          {salesUsers.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <select
                value={signal.assignedToId || ''}
                onChange={e => onUpdate(signal.id, { assignedToId: e.target.value || null })}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">Assign to…</option>
                {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {signal.assignedTo && signal.assignedAt && (
                <span className="text-[11px] text-slate-400">
                  since {new Date(signal.assignedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {!isDismissed && signal.reviewStatus !== 'REVIEWED' && (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => onUpdate(signal.id, { reviewStatus: 'REVIEWED' })}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 whitespace-nowrap"
            >
              Mark reviewed
            </button>
            <button
              onClick={() => onUpdate(signal.id, { reviewStatus: 'DISMISSED' })}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
            >
              Dismiss
            </button>
          </div>
        )}
        {isDismissed && (
          <button
            onClick={() => onUpdate(signal.id, { reviewStatus: 'UNREVIEWED' })}
            className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 shrink-0"
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
