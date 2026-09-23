'use client';
// Rate-drift table for the Pre-Con dashboard's calibration widget.
// props: { table:{columns, rows, empty}, isAdmin, onApplied }
// Each row is one budget line; expanding it lists the projects behind it.
// Admins get an "Apply" button that writes the suggested rate to pricing.
import { useState } from 'react';

const fmtMoney = (v) => (v == null ? '—' : `$${Math.round(v).toLocaleString()}`);
const fmtPct   = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}%`);
const fmtRate  = (v, unit) => {
  if (v == null) return '—';
  const s = Math.abs(v) < 1 ? v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : (Math.abs(v) < 100 ? v.toFixed(2) : Math.round(v).toLocaleString());
  return unit ? `$${s}/${unit === 'sf' ? 'SF' : unit.replace(/s$/, '')}` : `$${s}`;
};
const driftClass = (v) => v == null ? 'text-slate-400' : Math.abs(v) >= 15 ? 'text-red-600 font-bold' : Math.abs(v) >= 5 ? 'text-amber-600 font-semibold' : 'text-emerald-600';
const FLAG = { review: ['Review', 'bg-red-50 text-red-700'], watch: ['Watch', 'bg-amber-50 text-amber-700'], ok: ['OK', 'bg-emerald-50 text-emerald-700'] };

/**
 * A column-driven table for the calibration widgets that are NOT rate drift —
 * the two Phase 3 driver views. Rate drift earns its own hand-built layout
 * because it has an Apply button and a nested breakdown; these do not, and a
 * generic renderer keeps a new report from needing a new component.
 */
function PlainTable({ table }) {
  const cols = table?.columns || [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
            {cols.map(c => (
              <th key={c.key} className={`px-3 py-2 font-semibold ${c.unit ? 'text-right' : 'text-left'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
              {cols.map(c => {
                const v = r[c.key];
                const text = c.unit === 'rate' ? fmtRate(v, r.bestUnit || r.unit)
                  : c.unit === '$' ? fmtMoney(v)
                  : c.unit === '%' ? fmtPct(v)
                  : (v == null || v === '' ? '—' : String(v));
                return (
                  <td key={c.key} className={`px-3 py-2 ${c.unit ? 'text-right tabular-nums text-slate-700' : 'text-slate-600'} ${c.key === 'label' ? 'font-semibold text-slate-700' : ''}`}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CalibrationTable({ table, isAdmin, onApplied }) {
  const [open, setOpen]       = useState({});
  const [busy, setBusy]       = useState(null);
  const [applied, setApplied] = useState({});
  const [err, setErr]         = useState(null);
  const rows = table?.rows || [];

  if (!rows.length) {
    return <p className="text-xs text-slate-400 italic px-3 py-6 text-center">{table?.empty || 'No data'}</p>;
  }

  // Anything that is not the rate-drift table renders off its own columns.
  if (table?.kind && table.kind !== 'drift') return <PlainTable table={table} />;

  async function apply(row) {
    if (!row.pricingKey || row.suggestedRate == null) return;
    if (!confirm(`Set ${row.label} rate to ${fmtRate(row.suggestedRate, row.quantityUnit)} on the master pricing sheet?\n\nCurrent: ${fmtRate(row.rateUsed, row.quantityUnit)}. Every budget without a pricing snapshot will use the new rate.`)) return;
    setBusy(row.lineKey); setErr(null);
    try {
      const res = await fetch('/api/calibration/apply-rate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricingKey: row.pricingKey, rate: row.suggestedRate }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setApplied(a => ({ ...a, [row.lineKey]: j.rate }));
      onApplied?.(row, j);
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  return (
    <div className="overflow-x-auto">
      {err && <p className="text-xs text-red-600 px-3 pb-2">{err}</p>}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
            <th className="text-left px-3 py-2 font-semibold">Budget line</th>
            <th className="text-right px-2 py-2 font-semibold">Projects</th>
            <th className="text-right px-2 py-2 font-semibold">Model $</th>
            <th className="text-right px-2 py-2 font-semibold">Actual $</th>
            <th className="text-right px-2 py-2 font-semibold">Drift</th>
            <th className="text-right px-2 py-2 font-semibold">Rate used</th>
            <th className="text-right px-2 py-2 font-semibold">Suggested</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isOpen = !!open[r.lineKey];
            const [flagLabel, flagCls] = FLAG[r.flag] || FLAG.ok;
            const done = applied[r.lineKey] != null;
            return [
              <tr key={r.lineKey} className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpen(o => ({ ...o, [r.lineKey]: !isOpen }))}>
                <td className="px-3 py-2 text-slate-700 font-semibold">
                  <span className="text-slate-300 mr-1">{isOpen ? '▾' : '▸'}</span>{r.label}
                  <span className={`ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${flagCls}`}>{flagLabel}</span>
                </td>
                <td className="px-2 py-2 text-right text-slate-500">{r.projects}</td>
                <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{fmtMoney(r.modelSum)}</td>
                <td className="px-2 py-2 text-right text-slate-800 tabular-nums">{fmtMoney(r.actualSum)}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${driftClass(r.driftPct)}`}>{fmtPct(r.driftPct)}</td>
                <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{fmtRate(r.rateUsed, r.quantityUnit)}</td>
                <td className="px-2 py-2 text-right text-slate-800 font-semibold tabular-nums">{done ? fmtRate(applied[r.lineKey], r.quantityUnit) : fmtRate(r.suggestedRate, r.quantityUnit)}</td>
                <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                  {isAdmin && r.pricingKey && r.suggestedRate != null && !done && (
                    <button disabled={busy === r.lineKey} onClick={() => apply(r)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-md bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40">
                      {busy === r.lineKey ? 'Saving…' : 'Apply'}
                    </button>
                  )}
                  {done && <span className="text-[10px] font-semibold text-emerald-600">Applied</span>}
                  {!r.pricingKey && <span className="text-[10px] text-slate-300" title="This line is not a single rate × quantity — tune it on the pricing page">manual</span>}
                </td>
              </tr>,
              isOpen && (
                <tr key={`${r.lineKey}-detail`} className="bg-slate-50/70">
                  <td colSpan={8} className="px-6 py-2">
                    <table className="w-full text-[11px]">
                      <thead><tr className="text-slate-400"><th className="text-left py-1 font-medium">Project</th><th className="text-left py-1 font-medium">Type</th><th className="text-right py-1 font-medium">Qty</th><th className="text-right py-1 font-medium">Model</th><th className="text-right py-1 font-medium">Actual</th><th className="text-right py-1 font-medium">Drift</th><th className="text-left py-1 pl-3 font-medium">Note</th></tr></thead>
                      <tbody>
                        {r.details.map((d, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="py-1 text-slate-700"><a href={`/project/${d.projectId}/summary`} className="hover:underline" onClick={e => e.stopPropagation()}>{d.projectName}</a></td>
                            <td className="py-1 text-slate-500">{d.buildingType || '—'}</td>
                            <td className="py-1 text-right text-slate-500 tabular-nums">{d.quantity != null ? `${Math.round(d.quantity).toLocaleString()} ${d.quantityUnit || ''}` : '—'}</td>
                            <td className="py-1 text-right tabular-nums">{fmtMoney(d.modelAmount)}</td>
                            <td className="py-1 text-right tabular-nums">{fmtMoney(d.actualAmount)}</td>
                            <td className={`py-1 text-right tabular-nums ${driftClass(d.driftPct)}`}>{fmtPct(d.driftPct)}</td>
                            <td className="py-1 pl-3 text-slate-400">{d.source !== 'engine' ? <span className="mr-1 text-[9px] uppercase font-bold text-slate-400">{d.source}</span> : null}{d.note || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 px-3 pt-2">Drift = (actual − model) ÷ model. Positive means the engine prices low. Suggested = the rate that would have matched the actuals on these projects.</p>
    </div>
  );
}
