'use client';
import { useEffect, useState } from 'react';
import { formatMacroValue, formatMacroDelta, formatMacroDate } from '@/lib/market-intel/macroSeries';

/**
 * The national numbers at the top of Market Intelligence (migration 0128,
 * Mike 10-8). Nine FRED series plus two of our own from the permit feeds.
 * Green means the move helps us sell lighting (more starts, more permits,
 * cheaper money), red the reverse; a cost or rate going up is red.
 */
const GOOD_WHEN_UP = { HOUST5F: true, COMPU5MUSA: true, PERMIT5: true, CUUR0000SEHA: true };
const GOOD_WHEN_DOWN = { DFF: true, DGS10: true, MORTGAGE30US: true, WPUSI012011: true, RRVRUSQ156N: true };

function tone(id, direction) {
  if (direction === 'flat') return 'text-slate-500';
  const good = (direction === 'up' && GOOD_WHEN_UP[id]) || (direction === 'down' && GOOD_WHEN_DOWN[id]);
  return good ? 'text-emerald-600' : 'text-red-600';
}

function Card({ s }) {
  const delta = formatMacroDelta(s.unit, s.latest?.value, s.yearAgo?.value);
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 min-w-0" title={s.blurb}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 truncate">{s.label}</div>
      <div className="text-lg font-semibold text-slate-900 leading-tight">{s.latest ? formatMacroValue(s.unit, s.latest.value) : <span className="text-slate-300">no data</span>}</div>
      <div className="text-[11px] text-slate-400 truncate">
        {s.note ? s.note : s.latest ? formatMacroDate(s.cadence, s.latest.date) : ''}
      </div>
      {delta.text && <div className={`text-[11px] ${tone(s.id, delta.direction)} truncate`}>{delta.text}</div>}
    </div>
  );
}

export default function MacroStrip() {
  const [data,    setData]    = useState(null);
  const [busy,    setBusy]    = useState(false);
  const [failed,  setFailed]  = useState(false);

  async function load(method = 'GET') {
    setBusy(true);
    try {
      const res = await fetch('/api/market-intel/macro', { method });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error || 'failed');
      setData(d);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  const cards = [...(data?.stats || []), ...(data?.ours || [])];
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium text-slate-600">
          National market numbers
          {data?.fetchedAt && <span className="text-slate-400 font-normal"> · FRED, pulled {new Date(data.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
          {failed && <span className="text-red-600 font-normal"> · could not load</span>}
        </div>
        <button type="button" onClick={() => load('POST')} disabled={busy} className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50">
          {busy ? 'Pulling…' : 'Refresh numbers'}
        </button>
      </div>
      {cards.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {cards.map(s => <Card key={s.id} s={s} />)}
        </div>
      ) : (
        <div className="text-xs text-slate-400">{busy ? 'Pulling the first numbers from FRED…' : 'No numbers yet.'}</div>
      )}
    </div>
  );
}
