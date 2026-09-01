'use client';
import { useState, useRef } from 'react';
import { formatCurrency } from '@/lib/format';

/**
 * A row that shows a hover tooltip with a cost breakdown.
 * `details` = [{ label, value }] — zero-value rows are hidden.
 */
export function TooltipBudgetRow({ label, value, details = [], className = '', bold = false, highlight = false, zeroColor = 'text-slate-300' }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  const hasDetails = details.some(d => (d.value ?? 0) !== 0);

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      onMouseEnter={() => hasDetails && setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div className={`flex items-center justify-between py-1 ${hasDetails ? 'cursor-help' : ''}`}>
        <span className={`text-xs leading-tight ${bold ? 'font-bold text-slate-900' : highlight ? 'font-semibold text-slate-700' : 'text-slate-500'} ${hasDetails ? 'underline decoration-dotted underline-offset-2 decoration-slate-300' : ''}`}>
          {label}
        </span>
        <span className={`text-xs font-mono ${bold ? 'font-bold text-slate-900' : highlight ? 'font-semibold text-slate-800' : value === 0 ? zeroColor : 'text-slate-600'}`}>
          {formatCurrency(value)}
        </span>
      </div>

      {show && hasDetails && (
        <div className="absolute right-0 top-7 z-50 bg-slate-900 text-white rounded-xl shadow-2xl p-3 w-60 text-xs pointer-events-none">
          <div className="text-slate-400 font-semibold uppercase tracking-widest text-[10px] mb-2">{label}</div>
          <div className="space-y-1">
            {details.filter(d => (d.value ?? 0) !== 0).map(d => (
              <div key={d.label} className="flex justify-between gap-3">
                <span className="text-slate-300 leading-tight">{d.label}</span>
                <span className="font-mono text-white shrink-0">{formatCurrency(d.value)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-700 mt-2 pt-2 flex justify-between font-semibold">
            <span className="text-slate-300">Total</span>
            <span className="font-mono">{formatCurrency(details.filter(d => (d.value ?? 0) !== 0).reduce((s, d) => s + (d.value ?? 0), 0))}</span>
          </div>
          {/* Arrow */}
          <div className="absolute -top-1.5 right-4 w-3 h-3 bg-slate-900 rotate-45" />
        </div>
      )}
    </div>
  );
}
