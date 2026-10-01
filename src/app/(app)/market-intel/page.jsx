'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import AskPanel from './AskPanel';

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

export default function MarketIntelPage() {
  const [signals,      setSignals]      = useState([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [searchInput,  setSearchInput]  = useState('');
  const [clients,      setClients]      = useState([]);  // clients with matched signals
  const [filters,      setFilters]      = useState({
    projectType:  '',
    signalType:   '',
    reviewStatus: 'UNREVIEWED',
    clientId:     '',
  });
  const searchDebounce = useRef(null);

  // Load clients with signals once
  useEffect(() => {
    fetch('/api/market-intel/clients')
      .then(r => r.json())
      .then(d => setClients(d.clients || []))
      .catch(() => {});
  }, []);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (filters.projectType)  params.set('projectType',  filters.projectType);
      if (filters.signalType)   params.set('signalType',   filters.signalType);
      if (filters.reviewStatus) params.set('reviewStatus', filters.reviewStatus);
      if (filters.clientId)     params.set('clientId',     filters.clientId);
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
    setFilters(f => ({ ...f, [key]: value }));
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

  const hasActiveFilters = filters.projectType || filters.signalType || filters.reviewStatus !== 'UNREVIEWED' || filters.clientId || search;

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Market Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total.toLocaleString()} signal{total !== 1 ? 's' : ''} · industry news matched to clients
          </p>
        </div>
        {/* Top-right: Manage Sources + Search */}
        <div className="flex flex-col items-end gap-2">
          <Link
            href="/market-intel/sources"
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Manage Sources
          </Link>
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

        {hasActiveFilters && (
          <button
            onClick={() => {
              setFilters({ projectType: '', signalType: '', reviewStatus: 'UNREVIEWED', clientId: '' });
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
            <SignalCard key={signal.id} signal={signal} onUpdate={updateSignal} />
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
  );
}

function SignalCard({ signal, onUpdate }) {
  const meta         = SIGNAL_TYPE_META[signal.signalType] || SIGNAL_TYPE_META.NEWS;
  const developers   = (() => { try { return JSON.parse(signal.developerNames || '[]'); } catch { return []; } })();
  const isDismissed  = signal.reviewStatus === 'DISMISSED';

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
            {developers.length > 0 && !signal.linkedClient && signal.matchStatus !== 'REJECTED' && (
              <span className="text-xs text-slate-400 italic">{developers.join(', ')}</span>
            )}
          </div>
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
