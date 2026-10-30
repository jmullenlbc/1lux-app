'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, showSign = false) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (showSign && n < 0) return `−${str}`;
  if (showSign && n > 0) return `+${str}`;
  return str;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_META = {
  DRAFT:    { label: 'Draft',    bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200'  },
  SENT:     { label: 'Sent',     bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'   },
  APPROVED: { label: 'Approved', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200'  },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.DRAFT;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${m.bg} ${m.text} ${m.border}`}>
      {m.label}
    </span>
  );
}

// ── Contract Balance Bar ───────────────────────────────────────────────────────
function ContractBalanceBar({ balance }) {
  const items = [
    { label: 'Original Contract', value: balance.originalContract, color: 'text-slate-800' },
    { label: 'Approved COs',      value: balance.approvedCOTotal,  color: (balance.approvedCOTotal ?? 0) >= 0 ? 'text-green-700' : 'text-red-600', showSign: true },
    { label: 'Pending COs',       value: balance.pendingCOTotal,   color: 'text-amber-700', showSign: true },
    ...(balance.legacyTotal ? [{ label: 'Legacy CO PDFs', value: balance.legacyTotal, color: 'text-slate-500', showSign: true }] : []),
    { label: 'New Contract Total', value: balance.newContractTotal, color: 'text-blue-700', bold: true },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-5 mb-6">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-4">Contract Balance</p>
      <div className="flex flex-wrap gap-6">
        {items.map(item => (
          <div key={item.label} className="min-w-[140px]">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{item.label}</p>
            <p className={`text-base font-bold ${item.color} ${item.bold ? 'text-xl' : ''}`}>
              {fmt(item.value, item.showSign)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChangeOrdersTab({ projectId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error,   setError]   = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/change-orders`);
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]);

  async function createCO() {
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/change-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Change Order' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create');
      const co = await res.json();
      // Navigate to the detail page
      window.location.href = `/project/${projectId}/change-orders/${co.id}`;
    } catch (e) {
      setError(e.message);
      setCreating(false);
    }
  }

  async function deleteCO(coId) {
    if (!confirm('Delete this change order? This cannot be undone.')) return;
    setDeleting(coId);
    const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}`, { method: 'DELETE' });
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || 'Could not delete this change order.');
      setDeleting(null);
      return;
    }
    setData(prev => ({
      ...prev,
      changeOrders: prev.changeOrders.filter(c => c.id !== coId),
    }));
    setDeleting(null);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
      </svg>
      Loading change orders…
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
      {error} <button className="underline ml-2" onClick={load}>Retry</button>
    </div>
  );

  const { changeOrders = [], balance = {}, canEdit = true } = data || {};

  return (
    <div>
      {/* Contract Balance Bar */}
      <ContractBalanceBar balance={balance} />

      {!canEdit && (
        <div className="mb-4 rounded-lg bg-slate-100 border border-slate-200 px-4 py-2.5 text-xs text-slate-600">
          View only. Only Construction, Operations, Finance or an admin can create or change change orders.
        </div>
      )}

      {/* CO List Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          Change Orders
          {changeOrders.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">{changeOrders.length} total</span>
          )}
        </h2>
        {canEdit && <button
          onClick={createCO}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-60"
        >
          {creating ? (
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          )}
          New CO
        </button>}
      </div>

      {/* Empty state */}
      {changeOrders.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 py-16 flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">No change orders yet</p>
            <p className="text-xs text-slate-400 mt-1">Create your first CO to start tracking contract changes.</p>
          </div>
          {canEdit && <button onClick={createCO} className="px-5 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors">
            + New Change Order
          </button>}
        </div>
      )}

      {/* CO Table. Phones: the list scrolls sideways (Mike 10-29) */}
      {changeOrders.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto md:overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['CO #', 'Title', 'Date', 'Status', 'Options', 'Value', 'Last Sent', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {changeOrders.map((co, idx) => {
                const lastSend = co.sends?.[0];
                const optCount = co.optionGroups?.length ?? 0;
                const hasMultiple = optCount > 1;
                const isNeg = co.totalValue < 0;

                return (
                  <tr key={co.id} className={`border-b last:border-0 hover:bg-slate-50/50 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-slate-600">{co.coNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/project/${projectId}/change-orders/${co.id}`}
                        className="font-medium text-slate-800 hover:text-orange-600 transition-colors">
                        {co.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(co.date)}</td>
                    <td className="px-4 py-3"><StatusBadge status={co.status} /></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {hasMultiple ? `${optCount} options` : '—'}
                    </td>
                    <td className={`px-4 py-3 font-semibold text-sm ${isNeg ? 'text-red-600' : 'text-green-700'}`}>
                      {co.totalValue !== 0 ? fmt(co.totalValue, true) : <span className="text-slate-300 italic text-xs">no option selected</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {lastSend ? fmtDate(lastSend.sentAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Link href={`/project/${projectId}/change-orders/${co.id}`}
                          className="px-2.5 py-1 rounded text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                          {co.status === 'DRAFT' && canEdit ? 'Edit' : 'View'}
                        </Link>
                        {co.status === 'DRAFT' && canEdit && (
                          <button
                            onClick={() => deleteCO(co.id)}
                            disabled={deleting === co.id}
                            className="p-1.5 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
