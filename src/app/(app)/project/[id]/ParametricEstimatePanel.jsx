'use client';
import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '@/lib/calculations';

const TIER_ORDER  = ['LOW_COST', 'STANDARD', 'UPGRADE'];
const TIER_LABELS = { LOW_COST: 'Low Cost', STANDARD: 'Standard', UPGRADE: 'Upgrade' };
const TIER_COLORS = {
  LOW_COST: 'bg-slate-100 text-slate-600',
  STANDARD: 'bg-blue-50 text-blue-700',
  UPGRADE:  'bg-violet-50 text-violet-700',
};

function TierPill({ tier }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${TIER_COLORS[tier] || TIER_COLORS.STANDARD}`}>
      {TIER_LABELS[tier] || tier}
    </span>
  );
}

function CostCell({ value }) {
  if (value == null) return <span className="text-slate-300 text-xs italic">—</span>;
  return <span>{formatCurrency(value, false)}</span>;
}

function TierSelect({ code, current, available, onChange }) {
  const tiers = [...new Set(available.map(s => s.tier || 'STANDARD'))].sort(
    (a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b),
  );
  if (tiers.length <= 1) return <TierPill tier={current} />;
  return (
    <select value={current} onChange={e => onChange(code, e.target.value)}
      className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer">
      {tiers.map(t => (
        <option key={t} value={t}>{TIER_LABELS[t] || t}</option>
      ))}
    </select>
  );
}

function SpecCell({ spec }) {
  if (!spec) return <span className="text-slate-300 text-xs italic">No spec assigned</span>;
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-700 font-medium leading-tight truncate">{spec.description}</p>
      <p className="text-[11px] text-slate-400 truncate">{spec.manufacturer} · {spec.base_catalog}</p>
    </div>
  );
}

function SummaryRow({ label, value, className = '', bold = false }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${className}`}>
      <span className={bold ? 'font-semibold text-slate-800' : 'text-slate-500'}>{label}</span>
      <span className={bold ? 'font-bold text-slate-900 text-base' : 'text-slate-700'}>
        {value != null ? formatCurrency(value) : '—'}
      </span>
    </div>
  );
}

export default function ParametricEstimatePanel({ projectId }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [tierPrefs,  setTierPrefs]  = useState({});
  const [applying,   setApplying]   = useState(false);
  const [applied,    setApplied]    = useState(false);

  const fetchEstimate = useCallback(async (prefs = tierPrefs) => {
    setLoading(true);
    setError(null);
    try {
      const qs  = Object.keys(prefs).length ? `?tierPrefs=${encodeURIComponent(JSON.stringify(prefs))}` : '';
      const res = await fetch(`/api/projects/${projectId}/estimate${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, tierPrefs]);

  useEffect(() => { fetchEstimate({}); }, [projectId]);

  function handleTierChange(code, tier) {
    const next = { ...tierPrefs, [code]: tier };
    setTierPrefs(next);
    fetchEstimate(next);
  }

  async function applyToWizard() {
    if (!data?.wizardCounts || Object.keys(data.wizardCounts).length === 0) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data.wizardCounts),
      });
      if (res.ok) { setApplied(true); setTimeout(() => setApplied(false), 3000); }
    } finally {
      setApplying(false);
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mr-3" />
        <span className="text-sm text-slate-400">Loading estimate…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-red-500">
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        {error}
      </div>
    );
  }

  const { estimate, wizardCounts, confirmedCount, totalCount } = data || {};

  if (!confirmedCount) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
          </svg>
        </div>
        <h3 className="font-semibold text-slate-700 mb-1">No confirmed fixtures yet</h3>
        <p className="text-sm text-slate-400 max-w-sm">
          {totalCount > 0
            ? `${totalCount} fixture${totalCount !== 1 ? 's' : ''} placed but none confirmed. Open a drawing and confirm fixtures to generate an estimate.`
            : 'Mark up a drawing and confirm fixtures to generate a bottom-up estimate from your ILC spec library.'}
        </p>
      </div>
    );
  }

  const { lineItems = [], subtotal, freight, warehousing, tax, grandTotal, missingCosts, freightRate, warehousingRate, salesTaxPct } = estimate || {};

  // Group line items: unit types first, then exterior
  const unitItems    = lineItems.filter(li => {
    const mt = li.spec?.master_type_id || li.code;
    return !['EB','EC','ED','EF','EH','EL','EN','EP','ER','ES','EU','EW','EZ'].includes(mt) &&
      !mt.startsWith('E');
  });
  const exteriorItems = lineItems.filter(li => {
    const code = li.code;
    return code.startsWith('E') && code.length > 1;
  });
  const otherItems   = lineItems.filter(li => !unitItems.includes(li) && !exteriorItems.includes(li));

  function renderGroup(label, items) {
    if (!items.length) return null;
    return (
      <tbody>
        <tr>
          <td colSpan={7} className="px-4 pt-4 pb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
          </td>
        </tr>
        {items.map(li => (
          <tr key={li.code} className="border-b border-slate-100 hover:bg-slate-50/50">
            {/* Type code */}
            <td className="px-4 py-2.5 font-mono font-bold text-sm text-slate-800 w-12">{li.code}</td>
            {/* Family */}
            <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[120px]">
              <span className="line-clamp-2">{li.family}</span>
            </td>
            {/* Spec */}
            <td className="px-3 py-2.5 max-w-[200px]">
              <SpecCell spec={li.spec} />
            </td>
            {/* Tier selector */}
            <td className="px-3 py-2.5">
              <TierSelect code={li.code} current={li.tierPref} available={li.availableSpecs} onChange={handleTierChange} />
            </td>
            {/* Qty */}
            <td className="px-3 py-2.5 text-center">
              <span className="text-sm font-semibold text-slate-800 tabular-nums">{li.qty}</span>
            </td>
            {/* Unit cost */}
            <td className="px-3 py-2.5 text-right tabular-nums">
              {li.hasCost ? (
                <span className="text-sm text-slate-700">{formatCurrency(li.unitCost)}</span>
              ) : (
                <span className="text-xs text-orange-400 font-medium">No cost</span>
              )}
            </td>
            {/* Line total */}
            <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
              {li.hasCost ? (
                <span className="text-sm text-slate-900">{formatCurrency(li.total)}</span>
              ) : (
                <span className="text-xs text-slate-300">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header strip ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Parametric Estimate</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {confirmedCount} confirmed fixture{confirmedCount !== 1 ? 's' : ''} · bottom-up from ILC spec library
          </p>
        </div>
        <div className="flex items-center gap-3">
          {missingCosts && (
            <span className="flex items-center gap-1.5 text-xs text-orange-500 font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              Some types have no cost assigned
            </span>
          )}
          {loading && (
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          )}
          <button onClick={() => fetchEstimate(tierPrefs)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-600 font-medium transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Line items table ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-12">Type</th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Family</th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Spec</th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tier</th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Unit Cost</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          {renderGroup('Interior / Unit', unitItems)}
          {renderGroup('Exterior', exteriorItems)}
          {renderGroup('Other', otherItems)}
        </table>
      </div>

      {/* ── Summary + Apply ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Totals card */}
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Cost Summary</p>
          <div className="divide-y divide-slate-100">
            <SummaryRow label="Fixture product subtotal" value={subtotal} />
            <SummaryRow label={`Freight (${Math.round((freightRate || 0) * 100)}%)`} value={freight} />
            <SummaryRow label={`Warehousing (${Math.round((warehousingRate || 0) * 100)}%)`} value={warehousing} />
            {salesTaxPct > 0 && (
              <SummaryRow label={`Sales tax (${(salesTaxPct * 100).toFixed(2)}%)`} value={tax} />
            )}
            <div className="pt-2">
              <SummaryRow label="Estimate total" value={grandTotal} bold />
            </div>
          </div>
          {missingCosts && (
            <p className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-orange-500 leading-relaxed">
              Some fixture types have no budget cost assigned. Set costs in the{' '}
              <a href="/fixture-library" className="underline hover:text-orange-600">Fixture Library</a>.
              The total above covers only types with costs.
            </p>
          )}
        </div>

        {/* Apply to wizard */}
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Sync to Wizard</p>
          {Object.keys(wizardCounts || {}).length > 0 ? (
            <>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Write confirmed fixture counts back to the project wizard so the top-down budget reflects actual placed quantities.
              </p>
              <div className="space-y-1.5 mb-4">
                {Object.entries(wizardCounts).map(([field, value]) => {
                  const labels = { numFans: 'Fan count (numFans)', numVanities: 'Vanity count (numVanities)' };
                  return (
                    <div key={field} className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{labels[field] || field}</span>
                      <span className="font-semibold text-slate-800 tabular-nums">{value}</span>
                    </div>
                  );
                })}
              </div>
              <button onClick={applyToWizard} disabled={applying || applied}
                className={`w-full py-2 rounded-xl text-sm font-semibold transition-colors ${
                  applied
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-500 hover:bg-amber-400 text-white disabled:opacity-60'
                }`}>
                {applied ? '✓ Applied to wizard' : applying ? 'Applying…' : 'Apply counts to wizard'}
              </button>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                No fixture types map directly to wizard fields yet.
              </p>
              <p className="text-xs text-slate-300 mt-1">
                Fans (F) and vanities (V) will appear here once confirmed.
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
