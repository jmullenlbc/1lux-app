'use client';
import { useState } from 'react';
import Link from 'next/link';

const BUDGET_TYPE_META = {
  conceptual:  { label: 'Conceptual', color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400'   },
  design:      { label: 'Design',     color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500'   },
  peer_review: { label: 'Bid Matrix', color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500'    },
};

const PHASE_LABELS = {
  sd: 'SD', dd: 'DD', cd: 'CD', ifc: 'IFC',
  construction: 'Construction', closeout: 'Closeout',
};

function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const COLS = [
  { key: 'budgetNumber', label: 'Budget #' },
  { key: 'name',         label: 'Project' },
  { key: 'budgetType',   label: 'Type' },
  { key: 'phase',        label: 'Phase' },
  { key: 'grandTotal',   label: 'Grand Total',      align: 'right' },
  { key: 'createdAt',    label: 'Created',          align: 'right' },
  { key: 'sentAt',       label: 'Sent',             align: 'right' },
];

export default function PreConBudgetsTable({ projects }) {
  const [search,   setSearch]   = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortKey,  setSortKey]  = useState('createdAt');
  const [sortDir,  setSortDir]  = useState('desc');

  const filtered = projects
    .filter(p => {
      if (typeFilter && p.budgetType !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.budgetNumber || '').toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      if (sortKey === 'grandTotal') {
        av = a.grandTotal ?? -1;
        bv = b.grandTotal ?? -1;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-slate-900">All Budgets</h2>
          <p className="text-[10px] text-slate-400 mt-0.5">{projects.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search budgets…"
              className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 w-48" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
            <option value="">All Types</option>
            <option value="conceptual">Conceptual</option>
            <option value="design">Design</option>
            <option value="peer_review">Bid Matrix</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {COLS.map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  className={`px-4 py-2.5 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                  <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    {col.align === 'right' && sortKey === col.key && (
                      <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={sortDir === 'asc' ? 'M4.5 15.75l7.5-7.5 7.5 7.5' : 'M19.5 8.25l-7.5 7.5-7.5-7.5'} />
                      </svg>
                    )}
                    {col.align === 'right' && sortKey !== col.key && (
                      <svg className="w-3 h-3 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
                      </svg>
                    )}
                    {col.label}
                    {col.align !== 'right' && sortKey === col.key && (
                      <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={sortDir === 'asc' ? 'M4.5 15.75l7.5-7.5 7.5 7.5' : 'M19.5 8.25l-7.5 7.5-7.5-7.5'} />
                      </svg>
                    )}
                    {col.align !== 'right' && sortKey !== col.key && (
                      <svg className="w-3 h-3 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
                      </svg>
                    )}
                  </span>
                </th>
              ))}
              <th className="w-8 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 1} className="px-4 py-10 text-center text-slate-400 text-xs">
                  No budgets found
                </td>
              </tr>
            )}
            {filtered.map(p => {
              const meta = BUDGET_TYPE_META[p.budgetType] || BUDGET_TYPE_META.conceptual;
              const budgetRoute = `/project/${p.id}/wizard`;
              return (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors group cursor-pointer"
                  onClick={() => window.location.href = `/project/${p.id}/wizard`}>
                  <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    <Link href={budgetRoute}
                      className="font-mono font-extrabold text-base text-blue-700 hover:text-blue-500 transition-colors leading-tight">
                      {p.budgetNumber || <span className="text-slate-300 font-sans font-normal text-sm">—</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 max-w-[260px]" onClick={e => e.stopPropagation()}>
                    <Link href={`/project/${p.id}`}
                      className="text-sm text-slate-600 hover:text-blue-600 transition-colors truncate block">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-slate-500">{PHASE_LABELS[p.phase] || p.phase}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-700">
                    {fmtMoney(p.grandTotal)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{fmtDate(p.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{fmtDate(p.budgetSentDate || p.sentAt)}</td>
                  <td className="px-3 py-2.5 w-8" onClick={e => e.stopPropagation()}>
                    <Link href={budgetRoute}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-600 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
