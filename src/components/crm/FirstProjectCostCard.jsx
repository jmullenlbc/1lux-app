'use client';
import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/sales/expenses';
import { CARD, LABEL, STAT_VALUE, HELPER } from '@/components/ui/tokens';

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
    <div className={`${CARD} px-4 py-4`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className={LABEL}>Cost to First Project</h3>
        {row.won ? (
          <span className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            Won {fmt(row.firstWinAt)}{row.approximated ? ' (date is a guess)' : ''}
          </span>
        ) : (
          <span className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">No project yet</span>
        )}
      </div>
      {nothing ? (
        <p className={HELPER}>No published sales notes or expenses name this company yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className={STAT_VALUE}>{row.meetings}</div>
            <div className={HELPER}>Meetings{row.won ? ' before the win' : ' so far'}</div>
          </div>
          <div>
            <div className={STAT_VALUE}>{row.inPerson}</div>
            <div className={HELPER}>In person</div>
          </div>
          <div>
            <div className={STAT_VALUE}>{formatMoney(row.spentCents || 0)}</div>
            <div className={HELPER}>Spent{row.won ? ' before the win' : ' so far'}</div>
          </div>
          <div>
            <div className={STAT_VALUE}>{row.won && row.daysToWin !== null && row.daysToWin !== undefined ? row.daysToWin : '—'}</div>
            <div className={HELPER}>Days from first meeting{row.firstTouchAt ? ` (${fmt(row.firstTouchAt)})` : ''}</div>
          </div>
        </div>
      )}
      {row.won && row.firstProjectName && (
        <p className={`${HELPER} mt-2`}>First project: {row.firstProjectName}{row.salesUserName ? ` · ${row.salesUserName}` : ''}</p>
      )}
    </div>
  );
}
