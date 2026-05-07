'use client';
import { useMemo, useState } from 'react';

const PHASE_ORDER = ['SD', 'DD', 'CD', 'IFC', 'ASI', 'RFI'];

function parseTags(raw) {
  if (!raw) return [];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function parseData(raw) {
  if (!raw) return {};
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function getPhase(file) {
  const tags = parseTags(file.tags);
  return PHASE_ORDER.find(p => tags.includes(p)) ?? null;
}

function sortedFiles(files) {
  return [...files].sort((a, b) => {
    const pa = PHASE_ORDER.indexOf(getPhase(a));
    const pb = PHASE_ORDER.indexOf(getPhase(b));
    const oa = pa === -1 ? 999 : pa;
    const ob = pb === -1 ? 999 : pb;
    if (oa !== ob) return oa - ob;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function ColLabel({ file, index }) {
  const phase = getPhase(file);
  const date = new Date(file.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  return (
    <div className="text-center">
      {phase && (
        <span className="block text-[10px] font-bold uppercase tracking-wide text-amber-600 mb-0.5">{phase}</span>
      )}
      <span className="block text-[10px] text-slate-400">{date}</span>
    </div>
  );
}

function DeltaBar({ value, max }) {
  const pct = max === 0 ? 0 : Math.min(Math.abs(value) / max, 1) * 100;
  const isPos = value > 0;
  const isNeg = value < 0;
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 flex justify-end">
        {isNeg && (
          <div className="h-4 rounded-l" style={{ width: `${pct}%`, backgroundColor: '#ef4444' }} />
        )}
      </div>
      <div className="w-px h-4 bg-slate-300 shrink-0" />
      <div className="flex-1">
        {isPos && (
          <div className="h-4 rounded-r" style={{ width: `${pct}%`, backgroundColor: '#22c55e' }} />
        )}
      </div>
    </div>
  );
}

export default function TakeoffDashboard({ files }) {
  const [phaseFilter, setPhaseFilter] = useState(null);

  const takeoffFiles = useMemo(() => {
    const withData = files.filter(f => f.takeoffData);
    const sorted = sortedFiles(withData);
    return phaseFilter ? sorted.filter(f => getPhase(f) === phaseFilter) : sorted;
  }, [files, phaseFilter]);

  const presentPhases = useMemo(() => {
    const phases = new Set(files.filter(f => f.takeoffData).map(getPhase).filter(Boolean));
    return PHASE_ORDER.filter(p => phases.has(p));
  }, [files]);

  const allTypes = useMemo(() => {
    const set = new Set();
    takeoffFiles.forEach(f => Object.keys(parseData(f.takeoffData)).forEach(t => set.add(t)));
    // Sort: non-$ items first (alphabetical), then $ items
    return [...set].sort((a, b) => {
      const aS = a.startsWith('$'), bS = b.startsWith('$');
      if (aS !== bS) return aS ? 1 : -1;
      return a.localeCompare(b);
    });
  }, [takeoffFiles]);

  const topChanges = useMemo(() => {
    if (takeoffFiles.length < 2) return [];
    const first = parseData(takeoffFiles[0].takeoffData);
    const last  = parseData(takeoffFiles[takeoffFiles.length - 1].takeoffData);
    const allK  = new Set([...Object.keys(first), ...Object.keys(last)]);
    return [...allK]
      .map(type => ({ type, first: first[type] ?? 0, last: last[type] ?? 0, delta: (last[type] ?? 0) - (first[type] ?? 0) }))
      .filter(c => c.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10);
  }, [takeoffFiles]);

  const maxDelta = useMemo(() => Math.max(...topChanges.map(c => Math.abs(c.delta)), 1), [topChanges]);

  if (files.filter(f => f.takeoffData).length === 0) return null;

  const firstLabel = takeoffFiles[0] ? (getPhase(takeoffFiles[0]) ?? 'First') : 'First';
  const lastLabel  = takeoffFiles.length > 1 ? (getPhase(takeoffFiles[takeoffFiles.length - 1]) ?? 'Last') : null;

  return (
    <div className="space-y-5 mb-6">

      {/* Phase filter chips */}
      {presentPhases.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setPhaseFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${!phaseFilter ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
          >
            All
          </button>
          {presentPhases.map(p => (
            <button key={p} onClick={() => setPhaseFilter(prev => prev === p ? null : p)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${phaseFilter === p ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Top 10 changes bar chart */}
      {topChanges.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Top Changes by Quantity</h3>
              <p className="text-xs text-slate-400 mt-0.5">{firstLabel} → {lastLabel ?? firstLabel} · absolute change in fixture count</p>
            </div>
          </div>
          <div className="px-5 py-4 space-y-2.5">
            {topChanges.map(c => (
              <div key={c.type} className="flex items-center gap-3">
                <span className="w-16 text-xs font-mono font-semibold text-slate-700 shrink-0">{c.type}</span>
                <DeltaBar value={c.delta} max={maxDelta} />
                <div className="w-28 text-xs text-right shrink-0">
                  <span className="text-slate-400">{c.first} → {c.last}</span>
                  <span className={`ml-2 font-bold ${c.delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {c.delta > 0 ? `+${c.delta}` : c.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparison table */}
      {takeoffFiles.length > 0 && allTypes.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Fixture Count Comparison</h3>
            <p className="text-xs text-slate-400 mt-0.5">{allTypes.length} fixture types · {takeoffFiles.length} submission{takeoffFiles.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-slate-500 font-semibold sticky left-0 bg-slate-50 min-w-[100px]">
                    Type
                  </th>
                  {takeoffFiles.map((f, i) => (
                    <th key={f.id} className="text-center px-3 py-2 min-w-[80px]">
                      <ColLabel file={f} index={i} />
                    </th>
                  ))}
                  {takeoffFiles.length > 1 && (
                    <th className="text-center px-3 py-2 text-slate-500 font-semibold min-w-[60px]">Δ</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {allTypes.map(type => {
                  const qtys = takeoffFiles.map(f => parseData(f.takeoffData)[type] ?? 0);
                  const delta = qtys.length > 1 ? qtys[qtys.length - 1] - qtys[0] : null;
                  const hasChange = delta !== null && delta !== 0;
                  return (
                    <tr key={type} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 font-mono font-semibold text-slate-700 sticky left-0 bg-white">
                        {type}
                      </td>
                      {qtys.map((qty, i) => {
                        const prev = i > 0 ? qtys[i - 1] : null;
                        const changed = prev !== null && qty !== prev;
                        return (
                          <td key={i} className="px-3 py-2 text-center tabular-nums">
                            <span className={`
                              ${qty === 0 ? 'text-slate-300' : 'text-slate-700'}
                              ${changed && qty > prev ? 'text-green-600 font-semibold' : ''}
                              ${changed && qty < prev ? 'text-red-500 font-semibold' : ''}
                            `}>
                              {qty}
                            </span>
                          </td>
                        );
                      })}
                      {takeoffFiles.length > 1 && (
                        <td className="px-3 py-2 text-center tabular-nums font-semibold">
                          {hasChange ? (
                            <span className={delta > 0 ? 'text-green-600' : 'text-red-500'}>
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
