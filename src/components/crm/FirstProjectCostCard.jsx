'use client';
import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/sales/expenses';

// Client > Overview (0129): what it took, or has taken so far, to land this
// company's first project. Reads /api/clients/[id]/first-project-cost.

function fmt(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FirstProjectCostCard({ clientId }) {
  const [row, setRow] = useState(null);
  useEffect(() => {
    if (!clientId) return;
    let live = true;
    fetch(`/api/clients/${clientId}/first-project-cost`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live) setRow(d); })
      .catch(() => {});
    return () => { live = false; };
  }, [clientId]);

  if (!row) return null;
  const nothing = !row.won && row.meetings === 0 && row.spentCents === 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cost to First Project</h3>
        {row.won ? (
          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            Won {fmt(row.firstWinAt)}{row.approximated ? ' (date is a guess)' : ''}
          </span>
        ) : (
          <span className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">No project yet</span>
        )}
      </div>
      {nothing ? (
        <p className="text-xs text-slate-400">No published sales notes or expenses name this company yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-xl font-bold text-slate-800">{row.meetings}</div>
            <div className="text-[11px] text-slate-500">Meetings{row.won ? ' before the win' : ' so far'}</div>
          </div>
          <div>
            <div className="text-xl font-bold text-slate-800">{row.inPerson}</div>
            <div className="text-[11px] text-slate-500">In person</div>
          </div>
          <div>
            <div className="text-xl font-bold text-slate-800">{formatMoney(row.spentCents || 0)}</div>
            <div className="text-[11px] text-slate-500">Spent{row.won ? ' before the win' : ' so far'}</div>
          </div>
          <div>
            <div className="text-xl font-bold text-slate-800">{row.won && row.daysToWin !== null && row.daysToWin !== undefined ? row.daysToWin : '—'}</div>
            <div className="text-[11px] text-slate-500">Days from first meeting{row.firstTouchAt ? ` (${fmt(row.firstTouchAt)})` : ''}</div>
          </div>
        </div>
      )}
      {row.won && row.firstProjectName && (
        <p className="text-[11px] text-slate-400 mt-2">First project: {row.firstProjectName}{row.salesUserName ? ` · ${row.salesUserName}` : ''}</p>
      )}
    </div>
  );
}
