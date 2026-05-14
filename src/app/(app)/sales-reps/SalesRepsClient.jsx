'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';

export default function SalesRepsClient({ reps, currentUser }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return reps;
    const q = search.toLowerCase();
    return reps.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      r.projects.some(p => p.name.toLowerCase().includes(q))
    );
  }, [reps, search]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold text-amber-500 uppercase tracking-wider mb-0.5">ILC Studios</p>
            <h1 className="text-xl font-bold text-slate-900">Sales Reps</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {reps.length} rep{reps.length !== 1 ? 's' : ''} on record from submittal history
            </p>
          </div>

          {/* Search */}
          <div className="relative w-56">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reps or projects…"
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {reps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl mb-4">🤝</div>
            <p className="text-slate-500 font-semibold mb-1">No sales reps on record yet</p>
            <p className="text-sm text-slate-400 max-w-xs">
              Sales rep names are captured from submittal tracking. They'll appear here once peer review items are added.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-slate-400">No reps match "{search}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(rep => (
              <div key={rep.name}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md hover:border-slate-300 transition-all">

                {/* Card header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-emerald-700">
                      {rep.name.slice(0, 1).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{rep.name}</p>
                    {rep.email ? (
                      <a href={`mailto:${rep.email}`}
                        className="text-xs text-blue-600 hover:underline truncate block"
                        onClick={e => e.stopPropagation()}>
                        {rep.email}
                      </a>
                    ) : (
                      <p className="text-xs text-slate-400">No email on record</p>
                    )}
                  </div>
                  {rep.email && (
                    <a href={`mailto:${rep.email}`}
                      className="shrink-0 w-8 h-8 rounded-lg bg-slate-50 hover:bg-blue-50 flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors border border-slate-200"
                      onClick={e => e.stopPropagation()}
                      title={`Email ${rep.name}`}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </a>
                  )}
                </div>

                {/* Projects */}
                <div className="px-5 py-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    {rep.projects.length} project{rep.projects.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-1">
                    {rep.projects.slice(0, 4).map(p => (
                      <Link key={p.id} href={`/project/${p.id}`}
                        className="flex items-center gap-2 group">
                        <div className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                        <span className="text-xs text-slate-600 group-hover:text-amber-600 transition-colors truncate">
                          {p.name}
                          {p.client ? <span className="text-slate-400"> · {p.client.name}</span> : ''}
                        </span>
                      </Link>
                    ))}
                    {rep.projects.length > 4 && (
                      <p className="text-[11px] text-slate-400 pl-3">
                        +{rep.projects.length - 4} more
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
