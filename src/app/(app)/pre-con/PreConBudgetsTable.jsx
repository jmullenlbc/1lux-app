'use client';
import { useState } from 'react';
import Link from 'next/link';
import SortHeader from '@/components/ui/SortHeader';
import { WidgetEmpty } from '@/components/ui/WidgetFrame';
import { CARD, CARD_TITLE, HELPER, INPUT } from '@/components/ui/tokens';

const BUDGET_TYPE_META = {
  conceptual:  { label: 'Conceptual', color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400'   },
  design:      { label: 'Design',     color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500'   },
  peer_review: { label: 'Budget Matrix', color: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
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
    <div className={`${CARD} overflow-hidden`}>
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className={CARD_TITLE}>All Budgets</h2>
          <p className={`${HELPER} tabular-nums mt-0.5`}>{projects.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            type="search"
            placeholder="Search budgets..."
            className={`${INPUT} w-48`} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className={`${INPUT} w-auto`}>
            <option value="">All Types</option>
            <option value="conceptual">Conceptual</option>
            <option value="design">Design</option>
            <option value="peer_review">Budget Matrix</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {COLS.map(col => (
                <SortHeader key={col.key} label={col.label} field={col.key}
                  sort={{ key: sortKey, dir: sortDir }} onSort={handleSort}
                  align={col.align === 'right' ? 'right' : 'left'} className="whitespace-nowrap" />
              ))}
              <th className="w-8 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 1} className="px-4">
                  <WidgetEmpty>No budgets found</WidgetEmpty>
                </td>
              </tr>
            )}
            {filtered.map(p => {
              const meta = BUDGET_TYPE_META[p.budgetType] || BUDGET_TYPE_META.conceptual;
              const budgetRoute = `/project/${p.id}/wizard`;
              return (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors group cursor-pointer"
                  onClick={() => window.location.href = `/project/${p.id}/wizard`}>
                  <td className="px-3 py-2 text-sm text-slate-700" onClick={e => e.stopPropagation()}>
                    <Link href={budgetRoute}
                      className="font-mono font-bold text-sm tabular-nums text-orange-600 hover:text-orange-700 transition-colors leading-tight">
                      {p.budgetNumber || <span className="text-slate-400 font-sans font-normal text-sm">—</span>}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 max-w-[260px]" onClick={e => e.stopPropagation()}>
                    <Link href={`/project/${p.id}`}
                      className="text-sm text-slate-700 hover:text-orange-600 transition-colors truncate block">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700">
                    <span className="text-slate-500">{PHASE_LABELS[p.phase] || p.phase}</span>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 text-right font-mono font-semibold tabular-nums">
                    {fmtMoney(p.grandTotal)}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-500 text-right tabular-nums">{fmtDate(p.createdAt)}</td>
                  <td className="px-3 py-2 text-sm text-slate-500 text-right tabular-nums">{fmtDate(p.budgetSentDate || p.sentAt)}</td>
                  <td className="px-3 py-2 w-8" onClick={e => e.stopPropagation()}>
                    <Link href={budgetRoute}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-orange-600 flex items-center justify-center">
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
