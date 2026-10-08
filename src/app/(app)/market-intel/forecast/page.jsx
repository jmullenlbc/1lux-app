'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import SectionTabs, { MARKET_INTEL_TABS } from '@/components/ui/SectionTabs';

/**
 * Pipeline forecast (0122).
 *
 * Units the press says are coming, rolled up by company, metro or state. One
 * project counts once per group at its largest printed number, so a building
 * that gets five articles is still one building. The figure is what was
 * announced, not what will be built: treat it as a weather report.
 */

const BY_OPTIONS = [
  { key: 'company', label: 'By company' },
  { key: 'metro',   label: 'By metro' },
  { key: 'state',   label: 'By state' },
];

const MONTH_OPTIONS = [3, 6, 12, 24];

export default function ForecastPage() {
  const [by,      setBy]      = useState('company');
  const [months,  setMonths]  = useState(12);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/market-intel/forecast?by=${by}&months=${months}`)
      .then(r => r.json())
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [by, months]);

  const rows = data?.rows || [];
  const max  = rows[0]?.units || 1;
  const filterKey = { company: 'company', metro: 'metro', state: 'state' }[by];

  return (
    <div className="p-6">
      <SectionTabs tabs={MARKET_INTEL_TABS} />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Pipeline forecast</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {data ? `${data.totalUnits.toLocaleString()} units announced across ${data.articles.toLocaleString()} article${data.articles === 1 ? '' : 's'}` : 'Units announced in the press'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
            {BY_OPTIONS.map(o => (
              <button
                key={o.key}
                onClick={() => setBy(o.key)}
                className={`px-3 py-1.5 text-sm ${by === o.key ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <select
            value={months}
            onChange={e => setMonths(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {MONTH_OPTIONS.map(m => <option key={m} value={m}>Last {m} months</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="font-medium">No unit counts yet</p>
            <p className="text-xs mt-1">Articles get a unit count when they are read. Press "Re-read tags" on the Sources tab to fill in older ones.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">{by === 'company' ? 'Company' : by === 'metro' ? 'Metro' : 'State'}</th>
                  <th className="text-right px-4 py-2 font-semibold">Units</th>
                  <th className="text-right px-4 py-2 font-semibold">Projects</th>
                  <th className="text-right px-4 py-2 font-semibold">Articles</th>
                  {by === 'company' && <th className="text-left px-4 py-2 font-semibold">Where</th>}
                  <th className="px-4 py-2 w-40"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">
                      <Link href={`/market-intel?${filterKey}=${encodeURIComponent(r.label)}`} className="hover:text-amber-600">{r.label}</Link>
                      {r.clientId && <Link href={`/clients/${r.clientId}`} className="ml-2 text-[11px] text-green-600 hover:underline">client ✓</Link>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.units.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.projects}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.articles}</td>
                    {by === 'company' && <td className="px-4 py-2 text-xs text-slate-500">{(r.metros || []).slice(0, 3).join(', ')}{(r.metros || []).length > 3 ? ', +' + (r.metros.length - 3) : ''}</td>}
                    <td className="px-4 py-2">
                      <div className="h-2 rounded bg-amber-100">
                        <div className="h-2 rounded bg-amber-500" style={{ width: `${Math.max(2, Math.round(100 * r.units / max))}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
