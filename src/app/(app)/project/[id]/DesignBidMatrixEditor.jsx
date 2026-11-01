'use client';
import { useState, useEffect } from 'react';
import { lineTotal, sumCents } from '@/lib/money';
import { isCoVersion } from '@/lib/budgetVersions';

const RFQ_STATUSES = ['', 'Not Started', 'Sent', 'Received', 'Approved', 'N/A'];

function fmt(n, dec = 2) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCurrency(n) {
  if (n == null || n === '') return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PriceCell({ value, itemId, field, readOnly, onSave }) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(value != null ? String(value) : '');

  useEffect(() => { setLocal(value != null ? String(value) : ''); }, [value]);

  function commit() {
    setEditing(false);
    const num = local.trim() === '' ? null : parseFloat(local.replace(/[^0-9.]/g, ''));
    const curr = value != null ? Number(value) : null;
    if (num !== curr) onSave(num);
  }

  if (readOnly) return <span className="text-xs text-slate-600">{fmtCurrency(value)}</span>;

  if (editing) {
    return (
      <input
        autoFocus
        className="w-24 px-1.5 py-0.5 text-xs border border-blue-300 rounded bg-blue-50 outline-none"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocal(value != null ? String(value) : ''); setEditing(false); } }}
      />
    );
  }

  return (
    <span
      className={`text-xs cursor-text px-1 py-0.5 rounded hover:bg-slate-100 transition-colors ${value == null ? 'text-slate-300 italic' : 'text-slate-700 font-medium'}`}
      onClick={() => setEditing(true)}
    >
      {value != null ? fmtCurrency(value) : 'click to set'}
    </span>
  );
}

function TextCell({ value, readOnly, onSave, options, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(value || '');

  useEffect(() => { setLocal(value || ''); }, [value]);

  function commit() {
    setEditing(false);
    const trimmed = local.trim();
    if (trimmed !== (value || '').trim()) onSave(trimmed || null);
  }

  if (readOnly) return <span className="text-xs text-slate-600">{value || '—'}</span>;

  if (editing && options) {
    return (
      <select
        autoFocus
        className="text-xs border border-blue-300 rounded px-1.5 py-0.5 bg-blue-50 outline-none"
        value={local}
        onChange={e => { setLocal(e.target.value); }}
        onBlur={e => { setLocal(e.target.value); setTimeout(commit, 0); }}
      >
        {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="w-28 px-1.5 py-0.5 text-xs border border-blue-300 rounded bg-blue-50 outline-none"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocal(value || ''); setEditing(false); } }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      className={`text-xs cursor-text px-1 py-0.5 rounded hover:bg-slate-100 transition-colors ${!value ? 'text-slate-300 italic' : 'text-slate-700'}`}
      onClick={() => setEditing(true)}
    >
      {value || '—'}
    </span>
  );
}

function ChangeSummaryBadge({ changeSummary }) {
  const [open, setOpen] = useState(false);
  if (!changeSummary) return null;
  let summary;
  try { summary = JSON.parse(changeSummary); } catch { return null; }
  if (summary.source === 'change_order') return null;
  const added   = summary.added?.length   ?? 0;
  const removed = summary.removed?.length ?? 0;
  if (added === 0 && removed === 0) return <span className="text-xs text-slate-400">No changes from previous</span>;

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 text-xs focus:outline-none"
        onClick={() => setOpen(v => !v)}
      >
        {added   > 0 && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium hover:bg-green-200 transition-colors">+{added} added</span>}
        {removed > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium hover:bg-red-200 transition-colors">−{removed} removed</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-3 min-w-[280px] max-w-[400px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700">Changes from previous version</span>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {summary.added?.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1">Added</p>
              {summary.added.map((item, i) => (
                <div key={i} className="text-xs text-slate-600 py-0.5">
                  <span className="font-medium text-green-700">{item.type || '—'}</span>
                  {item.location && <span className="text-slate-400"> · {item.location}</span>}
                  {item.catalogNumber && <span className="font-mono text-slate-400"> {item.catalogNumber}</span>}
                </div>
              ))}
            </div>
          )}
          {summary.removed?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide mb-1">Removed</p>
              {summary.removed.map((item, i) => (
                <div key={i} className="text-xs text-slate-600 py-0.5">
                  <span className="font-medium text-red-700">{item.type || '—'}</span>
                  {item.location && <span className="text-slate-400"> · {item.location}</span>}
                  {item.catalogNumber && <span className="font-mono text-slate-400"> {item.catalogNumber}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DesignBidMatrixEditor({ projectId }) {
  const [matrices,    setMatrices]    = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/design-bid-matrix`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setMatrices(data.matrices);
      setSelectedIdx(Math.max(0, data.matrices.findIndex(m => !isCoVersion(m))));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]);

  const matrix    = matrices[selectedIdx];
  const currentIdx = matrices.findIndex(m => !isCoVersion(m)); // a change order version is never the budget
  const isLatest  = selectedIdx === currentIdx;
  const isReadOnly = !isLatest;

  async function saveItemField(itemId, field, value) {
    try {
      const res = await fetch(`/api/projects/${projectId}/design-bid-matrix/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const updated = await res.json();
      setMatrices(prev => prev.map((m, i) =>
        i !== selectedIdx ? m : {
          ...m,
          items: m.items.map(it => it.id === itemId ? { ...it, ...updated } : it),
        }
      ));
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading bid matrix…</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
        {error} <button className="underline ml-2" onClick={load}>Retry</button>
      </div>
    );
  }

  if (matrices.length === 0) {
    return (
      <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-700 mb-1">No bid matrix yet</p>
        <p className="text-xs text-slate-400">Go to the Fixture Schedule tab and click <strong>Push to Bid</strong> to create the first version</p>
      </div>
    );
  }

  const visibleItems = showArchived ? matrix.items : matrix.items.filter(i => !i.isArchived);

  // Compute totals for latest, the same way the PDF does: quantity times unit
  const totalDN = sumCents(visibleItems.map(i => lineTotal(i.qty ?? 1, i.dnPerUnit)));
  const totalCN = sumCents(visibleItems.map(i => i.cnTotal ?? lineTotal(i.qty ?? 1, i.cnPerUnit)));

  return (
    <div className="space-y-4">
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
            value={selectedIdx}
            onChange={e => setSelectedIdx(Number(e.target.value))}
          >
            {matrices.map((m, i) => (
              <option key={m.id} value={i}>
                v{m.version}{m.submissionTag ? ` · ${m.submissionTag}` : ''} · {new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {i === currentIdx ? ' (current)' : ''}
              </option>
            ))}
          </select>

          {matrix.changeSummary && <ChangeSummaryBadge changeSummary={matrix.changeSummary} />}

          {isReadOnly && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">{isCoVersion(matrix) ? 'Change order, read-only' : 'Historical, read-only'}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/projects/${projectId}/design-bid-matrix/export?version=${matrix.version}`}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5 no-underline"
            download
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export Excel
          </a>

          <a
            href={`/api/projects/${projectId}/design-bid-matrix/pdf?version=${matrix.version}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5 no-underline"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Print / PDF
          </a>

          <button
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            onClick={() => setShowArchived(v => !v)}
          >
            {showArchived ? 'Hide' : 'Show'} Archived
          </button>

          <span className="text-xs text-slate-400">
            Pushed by {matrix.pushedBy?.name ?? 'Unknown'} ·{' '}
            {new Date(matrix.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {[
                { label: 'Type',        cls: 'w-20'  },
                { label: 'Description', cls: 'w-48'  },
                { label: 'Location',    cls: 'w-28'  },
                { label: 'Mfr',         cls: 'w-24'  },
                { label: 'Part #',      cls: 'w-36'  },
                { label: 'Sales Rep',   cls: 'w-28'  },
                { label: 'RFQ Status',  cls: 'w-28'  },
                { label: 'DN/Unit',     cls: 'w-24 text-right' },
                { label: 'CN/Unit',     cls: 'w-24 text-right' },
                { label: 'Pricing Date',cls: 'w-28'  },
                { label: 'Notes',       cls: 'w-40'  },
              ].map(h => (
                <th key={h.label} className={`${h.cls} px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap`}>
                  {h.label}
                </th>
              ))}
              {!isReadOnly && <th className="w-7" />}
            </tr>
          </thead>
          <tbody>
            {visibleItems.length === 0 && (
              <tr>
                <td colSpan={12} className="py-16 text-center text-sm text-slate-400">
                  {isReadOnly ? 'No items in this version' : 'No items, push a fixture schedule to populate'}
                </td>
              </tr>
            )}
            {visibleItems.map((item, idx) => (
              <tr
                key={item.id}
                className={`border-b border-slate-100 last:border-0 transition-colors
                  ${item.isArchived ? 'opacity-40' : ''}
                  ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                `}
              >
                <td className="px-2 py-1.5 text-xs text-slate-700 font-medium">{item.type || '—'}</td>
                <td className="px-2 py-1.5 text-xs text-slate-600 max-w-[192px] truncate" title={item.description}>{item.description || '—'}</td>
                <td className="px-2 py-1.5 text-xs text-slate-500">{item.locationTag || '—'}</td>
                <td className="px-2 py-1.5 text-xs text-slate-600">{item.manufacturer || '—'}</td>
                <td className="px-2 py-1.5 font-mono text-xs text-slate-700">{item.partNumber || '—'}</td>
                <td className="px-2 py-1.5">
                  <TextCell value={item.salesRep} readOnly={isReadOnly} onSave={v => saveItemField(item.id, 'salesRep', v)} placeholder="name" />
                </td>
                <td className="px-2 py-1.5">
                  <TextCell value={item.rfqStatus} readOnly={isReadOnly} options={RFQ_STATUSES} onSave={v => saveItemField(item.id, 'rfqStatus', v)} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <PriceCell value={item.dnPerUnit} itemId={item.id} field="dnPerUnit" readOnly={isReadOnly} onSave={v => saveItemField(item.id, 'dnPerUnit', v)} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <PriceCell value={item.cnPerUnit} itemId={item.id} field="cnPerUnit" readOnly={isReadOnly} onSave={v => saveItemField(item.id, 'cnPerUnit', v)} />
                </td>
                <td className="px-2 py-1.5 text-xs text-slate-400">
                  {item.pricingLastUpdated
                    ? new Date(item.pricingLastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—'}
                </td>
                <td className="px-2 py-1.5">
                  <TextCell value={item.notes} readOnly={isReadOnly} onSave={v => saveItemField(item.id, 'notes', v)} placeholder="notes" />
                </td>
                {!isReadOnly && (
                  <td className="px-1 py-1">
                    <button
                      className={`w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors`}
                      title={item.isArchived ? 'Restore' : 'Archive'}
                      onClick={() => saveItemField(item.id, 'isArchived', !item.isArchived)}
                    >
                      {item.isArchived ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      )}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {!isReadOnly && visibleItems.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={7} className="px-2 py-2 text-xs font-semibold text-slate-500">
                  {visibleItems.length} line item{visibleItems.length !== 1 ? 's' : ''}
                </td>
                <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700">{fmtCurrency(totalDN)}</td>
                <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700">{fmtCurrency(totalCN)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!isReadOnly && (
        <p className="text-xs text-slate-400 px-1">
          Click any DN/CN cell to enter pricing · Click Sales Rep or RFQ Status to edit · Archive rows that are no longer needed
        </p>
      )}
    </div>
  );
}
