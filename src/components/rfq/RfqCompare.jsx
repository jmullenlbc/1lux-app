'use client';
import { useMemo, useState } from 'react';
import WidgetFrame, { WidgetEmpty } from '@/components/ui/WidgetFrame';
import { compareSentence, compareSnapshots, snapshotOfRound } from '@/lib/rfq/compare';
import { roundLabel } from '@/lib/rfq/format';
import { money } from './rfqApi';
import { SELECT } from './RepSelect';

// One side of a compare row: quantity times price, and the part when it moved.
function Side({ side, showPart }) {
  if (!side) return <span className="text-slate-400">Not on this round</span>;
  return (
    <div>
      <div className="tabular-nums text-slate-800">
        {side.qty ?? ''}{side.price != null ? ` x ${money(side.price)}` : ' x waiting'}
        {side.ext != null && <span className="text-slate-500"> = {money(side.ext)}</span>}
      </div>
      {showPart && side.partNumber && <div className="text-xs text-slate-500 truncate max-w-[14rem]">{side.partNumber}</div>}
    </div>
  );
}

// Any two rounds on the job, newest two first. Reps left out of a round carry
// their last prices forward, so each side is the whole job at that point.
export default function RfqCompare({ state }) {
  const rounds = useMemo(() => [...(state.rounds || [])].sort((a, b) => a.number - b.number), [state.rounds]);
  const [aId, setAId] = useState(null);
  const [bId, setBId] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const a = rounds.find((r) => r.id === aId) || rounds[rounds.length - 2];
  const b = rounds.find((r) => r.id === bId) || rounds[rounds.length - 1];
  const cmp = useMemo(() => (a && b ? compareSnapshots(snapshotOfRound(a), snapshotOfRound(b)) : null), [a, b]);

  if (rounds.length < 2 || !cmp) {
    return (
      <WidgetFrame title="Compare rounds">
        <WidgetEmpty>Start a second round to compare.</WidgetEmpty>
      </WidgetFrame>
    );
  }

  const unchanged = cmp.rows.filter((r) => r.change === 'Unchanged');
  const rows = showAll ? cmp.rows : cmp.rows.filter((r) => r.change !== 'Unchanged');
  const picker = (value, set, label) => (
    <select className={SELECT} value={value.id} onChange={(e) => set(e.target.value)} aria-label={label}>
      {rounds.map((r) => <option key={r.id} value={r.id}>{roundLabel(r)}</option>)}
    </select>
  );

  return (
    <WidgetFrame title="Compare rounds" flush>
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-2">{picker(a, setAId, 'Older round')}<span className="text-sm text-slate-500">to</span>{picker(b, setBId, 'Newer round')}</div>
        <p className="text-sm text-slate-700 mt-2">{compareSentence(cmp, roundLabel(a), roundLabel(b))}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] md:min-w-0 text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {['Type', 'Change', roundLabel(a), roundLabel(b), 'Difference'].map((h, i) => <th key={i} className={`font-semibold px-3 py-1.5 ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const showPart = r.change.startsWith('Part') || r.change === 'Added' || r.change === 'Removed';
              return (
                <tr key={r.key} className="align-top">
                  <td className="px-3 py-1.5 font-mono text-slate-700 whitespace-nowrap">{r.typeCode}{r.manufacturer ? <div className="font-sans text-xs text-slate-400">{r.manufacturer}</div> : null}</td>
                  <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.waiting ? 'Waiting on price' : r.change}</td>
                  <td className="px-3 py-1.5"><Side side={r.a} showPart={showPart} /></td>
                  <td className="px-3 py-1.5"><Side side={r.b} showPart={showPart} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-800">{r.difference ? `${r.difference < 0 ? '-' : ''}${money(Math.abs(r.difference))}` : ''}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} className="px-3 py-3 text-slate-500">Nothing changed between these rounds.</td></tr>}
          </tbody>
        </table>
      </div>
      {unchanged.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-100">
          <button type="button" onClick={() => setShowAll((s) => !s)} className="text-sm text-slate-600 hover:text-slate-800">
            {showAll ? 'Hide' : 'Show'} {unchanged.length} unchanged
          </button>
        </div>
      )}
    </WidgetFrame>
  );
}
