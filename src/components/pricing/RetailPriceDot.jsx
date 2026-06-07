'use client';
import { useState } from 'react';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmt(n) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Colored dot shown next to unit price for Amenity items with retail cache data.
// cache: { lowestRetail, retailResults, lastChecked }
// unitPrice: number (ILC budget price)
// onRefresh: async () => void
export default function RetailPriceDot({ cache, unitPrice, manufacturer, partNumber, onRefresh }) {
  const [show,       setShow]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (!cache) return null;

  const { lowestRetail, retailResults, lastChecked } = cache;
  const results = (() => { try { return Array.isArray(retailResults) ? retailResults : JSON.parse(retailResults || '[]'); } catch { return []; } })();

  // Dot color
  let dotCls, pctLabel, pctCls;
  if (results.length === 0) {
    dotCls = 'bg-slate-300';
    pctLabel = 'No results';
    pctCls = 'text-slate-400';
  } else if (unitPrice < lowestRetail * 0.90) {
    const pct = Math.round(((lowestRetail - unitPrice) / lowestRetail) * 100);
    dotCls = 'bg-green-500';
    pctLabel = `✓ ${pct}% below retail`;
    pctCls = 'text-green-400';
  } else if (unitPrice < lowestRetail) {
    const pct = Math.round(((lowestRetail - unitPrice) / lowestRetail) * 100);
    dotCls = 'bg-amber-500';
    pctLabel = `${pct}% below retail`;
    pctCls = 'text-amber-400';
  } else {
    const pct = Math.round(((unitPrice - lowestRetail) / lowestRetail) * 100);
    dotCls = 'bg-red-500';
    pctLabel = `${pct}% above retail`;
    pctCls = 'text-red-400';
  }

  async function handleRefresh(e) {
    e.stopPropagation();
    setRefreshing(true);
    try { await onRefresh?.(); } finally { setRefreshing(false); }
  }

  const lowestResult = results.reduce((min, r) => (!min || r.price < min.price) ? r : min, null);

  return (
    <span className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className={`w-2 h-2 rounded-full inline-block cursor-default ${dotCls} flex-shrink-0`} />

      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 bg-slate-900 text-white rounded-lg shadow-xl text-[11px] leading-relaxed overflow-hidden pointer-events-auto">
          <div className="px-3 py-2 font-semibold border-b border-slate-700">Retail Price Check</div>

          {results.length === 0 ? (
            <div className="px-3 py-2 text-slate-400">No shopping results found</div>
          ) : (
            <div className="px-3 py-2 space-y-1">
              {results.map((r, i) => (
                <div key={i} className="flex justify-between items-center">
                  {r.link
                    ? <a href={r.link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline truncate max-w-[130px]">{r.source}</a>
                    : <span className="text-slate-300 truncate max-w-[130px]">{r.source}</span>
                  }
                  <span className={`font-mono ${r === lowestResult ? 'text-white font-bold' : 'text-slate-300'}`}>
                    {fmt(r.price)}{r === lowestResult ? ' ← lowest' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="px-3 py-2 border-t border-slate-700 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Your price</span>
              <span className={`font-semibold ${pctCls}`}>{fmt(unitPrice)} · {pctLabel}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Last checked {fmtDate(lastChecked)}</span>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {refreshing
                  ? <span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                  : '↻'
                }
                Refresh
              </button>
            </div>
          </div>

          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </span>
  );
}
