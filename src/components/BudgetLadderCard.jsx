'use client';
import { useState } from 'react';
import { BUDGET_TIERS, BUDGET_TIER_LABELS, BUDGET_SOURCE_LABELS, budgetLadder, currentBudgetAmount, cleanAmount } from '@/lib/budgetAmounts';

/**
 * Conceptual, then Budget, then Signed PO (0116, Mike 2026-10-03). Each later
 * number replaces the one before it as the project's number; the earlier ones
 * stay, so we can see later how close our guesses were. Uploads fill these on
 * their own (a budget PDF, a signed supply contract); any step can be typed.
 */
const money = v => (v == null ? null : `$${Math.round(Number(v)).toLocaleString('en-US')}`);
const day = v => (v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export default function BudgetLadderCard({ projectId, amounts, onChange, onContractValue, contractFiles = [] }) {
  const ladder = budgetLadder(amounts);
  const now = currentBudgetAmount(amounts);
  const conceptual = ladder.conceptual ? Number(ladder.conceptual.amount) : null;
  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState('');
  const [fileId, setFileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    const amount = cleanAmount(value);
    if (amount == null) { setErr('Type a dollar amount above zero.'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget-amounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: editing, amount, fileId: editing === 'po' && fileId ? fileId : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
      onChange?.([data.amount, ...(amounts || []).map(a => (a.tier === editing && !a.archivedAt ? { ...a, archivedAt: new Date().toISOString() } : a))]);
      if (data.contractValue != null) onContractValue?.(data.contractValue);
      setEditing(null); setValue(''); setFileId('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Number Ladder</p>
        <span className="text-[10px] text-slate-400">Each step replaces the one before it</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {BUDGET_TIERS.map(tier => {
          const row = ladder[tier];
          const isNow = now?.tier === tier;
          const diff = row && conceptual && tier !== 'conceptual' ? Number(row.amount) / conceptual - 1 : null;
          return (
            <div key={tier} className={`rounded-xl border px-4 py-3 ${isNow ? 'border-orange-300 bg-orange-50' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">{BUDGET_TIER_LABELS[tier]}</span>
                {isNow && <span className="text-[10px] font-semibold text-orange-700">Current</span>}
              </div>
              <p className={`text-lg font-bold mt-1 ${row ? 'text-slate-900' : 'text-slate-300'}`}>{money(row?.amount) || 'None yet'}</p>
              {row && (
                <p className="text-[11px] text-slate-500">
                  {BUDGET_SOURCE_LABELS[row.source] || row.source} · {day(row.createdAt)}
                  {row.file?.originalName ? ` · ${row.file.originalName}` : ''}
                </p>
              )}
              {diff != null && (
                <p className={`text-[11px] font-semibold ${diff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {diff > 0 ? '+' : ''}{Math.round(diff * 100)}% vs conceptual
                </p>
              )}
              {editing === tier ? (
                <div className="mt-2 space-y-2">
                  <input
                    autoFocus value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" placeholder="$ amount"
                    onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(null); }}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm"
                  />
                  {tier === 'po' && contractFiles.length > 0 && (
                    <select value={fileId} onChange={e => setFileId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
                      <option value="">No file</option>
                      {contractFiles.map(f => <option key={f.id} value={f.id}>{f.originalName}</option>)}
                    </select>
                  )}
                  {tier === 'po' && <p className="text-[11px] text-slate-500">Enter the PO as first signed. Approved change orders add on their own.</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={save} disabled={busy} className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => { setEditing(null); setErr(null); }} className="text-xs text-slate-500">Cancel</button>
                  </div>
                  {err && <p className="text-[11px] text-red-600">{err}</p>}
                </div>
              ) : (
                <button type="button" onClick={() => { setEditing(tier); setValue(''); setErr(null); }} className="mt-2 text-xs font-semibold text-blue-600 hover:underline">
                  {row ? 'Enter a new amount' : 'Enter amount'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
