'use client';
// "My Desk" on the Sales dashboard (Mike 9-26). A window onto /sales/desk:
// the counts and the few most pressing reminders. All the doing happens on the
// desk page itself, so a salesperson has one place to work from.
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DeskCard() {
  const [desk, setDesk] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/sales/desk').then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setDesk(d);
    }).catch(e => setErr(e.message));
  }, []);

  if (err) return <p className="text-xs text-red-500 px-2">{err}</p>;
  if (!desk) return <p className="text-xs text-slate-400 px-2">Loading…</p>;

  const count = key => desk.groups.find(g => g.key === key)?.items.length || 0;
  const top = desk.groups.filter(g => g.key === 'OVERDUE' || g.key === 'TODAY').flatMap(g => g.items.map(a => ({ ...a, g: g.key }))).slice(0, 5);
  const tiles = [
    { label: 'Overdue', n: count('OVERDUE'), tone: 'text-rose-600' },
    { label: 'Today', n: count('TODAY'), tone: 'text-slate-800' },
    { label: 'This week', n: count('WEEK'), tone: 'text-slate-800' },
    { label: 'Waiting on them', n: count('WAITING'), tone: 'text-slate-800' },
    { label: 'Emails to review', n: desk.drafts.length, tone: 'text-emerald-700' },
  ];

  return (
    <div className="px-2">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        {tiles.map(t => (
          <Link key={t.label} href="/sales/desk" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
            <div className={`text-xl font-semibold ${t.n ? t.tone : 'text-slate-300'}`}>{t.n}</div>
            <div className="text-[11px] text-slate-500">{t.label}</div>
          </Link>
        ))}
      </div>
      {top.length > 0 && (
        <ul className="divide-y divide-slate-100 mb-2">
          {top.map(a => (
            <li key={a.id} className="py-1.5 flex gap-2 text-xs">
              <span className={a.g === 'OVERDUE' ? 'text-rose-600 font-semibold shrink-0' : 'text-slate-400 shrink-0'}>{a.g === 'OVERDUE' ? 'Late' : 'Today'}</span>
              <span className="text-slate-700 truncate">{a.detail || a.rawText}</span>
              {a.who && <span className="text-slate-400 shrink-0 ml-auto">{a.who}</span>}
            </li>
          ))}
        </ul>
      )}
      <Link href="/sales/desk" className="text-xs text-emerald-700 hover:underline">Open My Desk</Link>
    </div>
  );
}
