'use client';
import { useState, useEffect } from 'react';
import { CARD, LABEL, NUM, TH, TD } from '@/components/ui/tokens';
import { WidgetLoading } from '@/components/ui/WidgetFrame';

function fmt(n, showSign = false) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (showSign && n < 0) return `−${str}`;
  if (showSign && n > 0) return `+${str}`;
  return str;
}
function pct(n) { return n != null ? `${(Number(n) * 100).toFixed(2).replace(/\.?0+$/, '')}%` : '—'; }

const STATUS_META = {
  DRAFT:    'bg-amber-50 text-amber-700 border-amber-200',
  SENT:     'bg-slate-50 text-slate-700 border-slate-200',
  APPROVED: 'bg-green-50 text-green-700 border-green-200',
};

export default function SharedCOView({ token }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetch(`/api/share/co/${token}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [token]);

  const co    = data?.co;
  const rates = data?.rates || {};

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-950 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-black tracking-tight">ILC<span className="text-orange-400">.</span>Studios</span>
          <span className="text-slate-400 text-xs">Change Order</span>
        </div>
        <span className="text-xs bg-slate-700 px-3 py-1 rounded-full text-slate-300 font-semibold">
          View-only: pricing shown net of ILC costs
        </span>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {loading && <div className="py-10"><WidgetLoading /></div>}
        {error   && <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700">{error}</div>}

        {!loading && !error && co && (
          <>
            {/* CO info */}
            <div className={`${CARD} p-5 mb-6`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-slate-500">{co.coNumber}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_META[co.status] || ''}`}>
                      {co.status}
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-900">{co.title}</h1>
                  {co.project?.name && <p className="text-sm text-slate-500 mt-1">{co.project.name}</p>}
                  {co.notes && <p className="text-sm text-slate-500 mt-2 italic">"{co.notes}"</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={LABEL}>Date</p>
                  <p className={`text-sm text-slate-700 ${NUM}`}>{new Date(co.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>
            </div>

            {/* Option groups */}
            <div className="space-y-6">
              {co.optionGroups?.map(group => (
                <div key={group.id} className={`${CARD} overflow-hidden ${group.isSelected ? 'border-orange-400' : ''}`}>
                  <div className={`flex items-center gap-3 px-5 py-3 ${group.isSelected ? 'bg-orange-50 border-b border-orange-200' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-semibold ${group.isSelected ? 'text-orange-700' : 'text-slate-700'}`}>{group.label}</h3>
                    {group.isSelected && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white">SELECTED</span>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-white">
                          {['Type', 'Qty', 'Manufacturer', 'Part #', 'Description', 'CN Unit', 'Total CN', 'Quote Ref', 'Lead Time'].map(h => (
                            <th key={h} className={`${TH} whitespace-nowrap`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(group.lineItems || []).map((li, idx) => (
                          <tr key={li.id} className={`border-b last:border-0 ${li.qty < 0 ? 'text-red-600 bg-red-50/20' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                            <td className="px-3 py-2 font-semibold">{li.fixtureType || '—'}</td>
                            <td className={`px-3 py-2 text-right ${NUM}`}>{li.qty}</td>
                            <td className="px-3 py-2">{li.manufacturer || '—'}</td>
                            <td className="px-3 py-2 font-mono text-[11px]">{li.partNumber || '—'}</td>
                            <td className="px-3 py-2">{li.description || '—'}</td>
                            <td className={`px-3 py-2 text-right ${NUM}`}>{fmt(li.cnUnitPrice)}</td>
                            <td className={`px-3 py-2 text-right font-bold ${NUM} ${li.totalCN < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmt(li.totalCN, true)}</td>
                            <td className="px-3 py-2 text-[11px]">{li.quoteReference || '—'}</td>
                            <td className="px-3 py-2 text-[11px]">{li.leadTime || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer */}
                  <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
                    <div className={`ml-auto w-64 space-y-1 text-xs ${NUM}`}>
                      {[
                        { label: 'Subtotal', val: group.footer?.subtotal },
                        !!group.footer?.discount && { label: `Discount${group.discountPct != null ? ` (${pct(group.discountPct)})` : ''}`, val: -group.footer.discount, note: group.discountNote },
                        rates.salesTaxPct != null && { label: `Sales Tax (${pct(rates.salesTaxPct)})`, val: group.footer?.tax },
                        rates.freightPct != null && { label: `Freight (${pct(rates.freightPct)})`, val: group.footer?.freight },
                        rates.warehousingPct != null && { label: `Warehousing (${pct(rates.warehousingPct)})`, val: group.footer?.warehousing },
                      ].filter(Boolean).map((row, i) => (
                        <div key={i} className="text-slate-500">
                          <div className="flex justify-between"><span>{row.label}</span><span>{fmt(row.val, true)}</span></div>
                          {row.note && <p className="text-[11px] text-slate-400">{row.note}</p>}
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-slate-300 pt-1 font-bold text-sm">
                        <span>TOTAL</span>
                        <span className={group.footer?.total < 0 ? 'text-red-600' : 'text-slate-900'}>{fmt(group.footer?.total, true)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 text-center mt-8">
              Shared by ILC Studios · View-only · {new Date().getFullYear()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
