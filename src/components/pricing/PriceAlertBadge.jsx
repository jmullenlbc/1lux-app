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

// Amber badge shown next to a unit price cell when cross-project price increase detected.
// flag: { manufacturer, partNumber, currentPrice, priorPrice, priorProjectName, priorRecordedAt, pctIncrease, flagged }
export default function PriceAlertBadge({ flag }) {
  const [show, setShow] = useState(false);
  if (!flag?.flagged) return null;

  const pct = flag.pctIncrease != null ? Math.round(flag.pctIncrease) : null;

  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 cursor-default whitespace-nowrap">
        ⚠ {pct != null ? `+${pct}%` : '↑'}
      </span>

      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-52 bg-slate-900 text-white rounded-lg shadow-xl text-[11px] leading-relaxed overflow-hidden pointer-events-none">
          <div className="px-3 py-2 font-semibold border-b border-slate-700 text-amber-300">
            Price increased {pct != null ? `${pct}%` : ''} vs. prior budget
          </div>
          <div className="px-3 py-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Prior price</span>
              <span>{fmt(flag.priorPrice)} <span className="text-slate-500">({fmtDate(flag.priorRecordedAt)})</span></span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Current price</span>
              <span className="text-amber-300 font-semibold">{fmt(flag.currentPrice)}</span>
            </div>
            {flag.priorProjectName && (
              <div className="flex justify-between">
                <span className="text-slate-400">Source project</span>
                <span className="text-slate-300 truncate ml-2 max-w-[110px]">{flag.priorProjectName}</span>
              </div>
            )}
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </span>
  );
}
