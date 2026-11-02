'use client';
import { useCallback, useEffect, useState } from 'react';
import StatTile from '@/components/ui/StatTile';
import { NumberTile } from '@/components/ui/AutoNumber';
import { formatMoney } from '@/lib/sales/expenses';
import { cents } from '@/lib/money';

const dollars = (n) => (n == null ? 'Not set' : formatMoney(Math.round(cents(n) * 100)));

/** Who filter moves the spend. Budgets are the whole team's, so they stay put. */
export default function ExpenseNumbers({ userId, rows }) {
  const [n, setN] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sales/expenses/summary${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `The top numbers did not load on our server. Your expenses are fine. Refresh to try again. (HTTP ${res.status})`);
      setN(body);
      setErr('');
    } catch (e) {
      setErr(e instanceof TypeError ? 'No signal reaching our server. Your expenses are fine. Check your connection and refresh.' : e.message);
    }
  }, [userId]);
  useEffect(() => { load(); }, [load, rows]);

  async function save(year, field, v) {
    setErr('');
    try {
      const res = await fetch('/api/sales/annual-budgets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area: 'EXPENSES', year, [field]: v }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `That number did not save on our server. Try again. (HTTP ${res.status})`);
      await load();
      return true;
    } catch (e) {
      setErr(e instanceof TypeError ? 'No signal reaching our server. That number was not saved. Check your connection and try again.' : e.message);
      return false;
    }
  }

  if (err && !n) return <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>;
  if (!n) return null;

  const lastYear = n.year - 1;
  const typed = userId ? null : n.lastYearTyped;
  const left = n.thisYearBudget == null || userId ? null : Math.round(cents(n.thisYearBudget) * 100) - n.ytdCents;

  return (
    <div className="space-y-2">
      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <NumberTile label="Last year spend" value={typed} shown={typed != null ? dollars(typed) : formatMoney(n.lastYearCents)} canEdit={n.canEdit && !userId}
          sub={`${lastYear}, ${typed != null ? 'typed' : 'from expenses'}`} placeholder={String(n.lastYearCents / 100)} onSave={v => save(lastYear, 'typedSpend', v)} />
        <NumberTile label="Last year budget" value={n.lastYearBudget} shown={dollars(n.lastYearBudget)} canEdit={n.canEdit} sub={String(lastYear)}
          placeholder="Not set" onSave={v => save(lastYear, 'budget', v)} />
        <StatTile label="YTD spend" value={formatMoney(n.ytdCents)} tone={left != null && left < 0 ? 'danger' : 'default'}
          sub={left == null ? String(n.year) : `${formatMoney(Math.abs(left))} ${left < 0 ? 'over' : 'left of'} budget`} />
        <NumberTile label="This year budget" value={n.thisYearBudget} shown={dollars(n.thisYearBudget)} canEdit={n.canEdit} sub={`${n.year}, whole team`}
          placeholder="Not set" onSave={v => save(n.year, 'budget', v)} />
        <StatTile label="Top client spend" value={n.topClient ? formatMoney(n.topClient.cents) : 'None yet'} sub={n.topClient ? `${n.topClient.name}, ${n.year}` : String(n.year)} />
      </div>
    </div>
  );
}
