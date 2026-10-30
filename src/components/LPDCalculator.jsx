'use client';
import { useState, useEffect, useCallback } from 'react';

function fmtLpd(v) {
  if (v == null) return '—';
  return v.toFixed(3);
}

function fmtWatts(v) {
  if (v == null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(1)} kW` : `${Math.round(v)} W`;
}

function StatusBadge({ compliant }) {
  if (compliant === true)  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">PASS</span>;
  if (compliant === false) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">FAIL</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400">—</span>;
}

function AreaRow({ area, onAreaSfChange }) {
  const [localSf, setLocalSf] = useState(area.areaSf ? String(Math.round(area.areaSf)) : '');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLocalSf(area.areaSf ? String(Math.round(area.areaSf)) : '');
  }, [area.areaSf]);

  function commit() {
    setEditing(false);
    const v = parseFloat(localSf);
    onAreaSfChange(area.slug, isNaN(v) || v <= 0 ? null : v);
  }

  const missingQty = area.fixtures.some(f => f.qty == null);

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
      {/* Location */}
      <td className="px-4 py-3">
        <span className="text-sm font-semibold text-slate-800">{area.label}</span>
        {area.rawLocations && (
          <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[160px]" title={area.rawLocations}>
            {area.rawLocations}
          </p>
        )}
      </td>

      {/* Fixtures */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {area.fixtures.map((f, i) => (
            <span
              key={i}
              title={`${f.type}${f.description ? `, ${f.description}` : ''}: ${f.wattage}W × ${f.qty ?? '?'} = ${f.totalWatts != null ? `${Math.round(f.totalWatts)}W` : '?'}`}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                f.qty != null ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              {f.type} {f.qty != null ? `×${f.qty}` : '×?'}
            </span>
          ))}
        </div>
      </td>

      {/* Total Watts */}
      <td className="px-4 py-3 text-right">
        <span className={`text-sm font-semibold ${area.totalWatts != null ? 'text-slate-800' : 'text-slate-300'}`}>
          {fmtWatts(area.totalWatts)}
        </span>
        {missingQty && (
          <p className="text-[10px] text-amber-500 mt-0.5">qty missing</p>
        )}
      </td>

      {/* Area SF, editable */}
      <td className="px-4 py-3 text-right">
        {editing ? (
          <input
            autoFocus
            type="number"
            className="w-24 text-sm font-semibold text-right bg-blue-50 border border-blue-300 rounded px-2 py-0.5 outline-none"
            value={localSf}
            onChange={e => setLocalSf(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocalSf(area.areaSf ? String(Math.round(area.areaSf)) : ''); setEditing(false); } }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className={`text-sm font-semibold rounded px-1.5 py-0.5 transition-colors hover:bg-slate-100 ${localSf ? 'text-slate-800' : 'text-slate-300 italic'}`}
            title="Click to edit area (sq ft)"
          >
            {localSf ? Number(localSf).toLocaleString() : 'enter SF'}
          </button>
        )}
      </td>

      {/* LPD */}
      <td className="px-4 py-3 text-right">
        <span className={`text-sm font-mono font-bold ${
          area.compliant === true  ? 'text-green-600' :
          area.compliant === false ? 'text-red-600'   : 'text-slate-400'
        }`}>
          {fmtLpd(area.lpd)}
        </span>
        {area.lpd != null && <span className="text-[10px] text-slate-400 ml-0.5">W/ft²</span>}
      </td>

      {/* ASHRAE limit */}
      <td className="px-4 py-3 text-right">
        {area.ashraeLimit != null ? (
          <span className="text-sm font-mono text-slate-500">{area.ashraeLimit.toFixed(2)}</span>
        ) : (
          <span className="text-xs text-slate-300">N/A</span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3 text-center">
        <StatusBadge compliant={area.compliant} />
      </td>
    </tr>
  );
}

export default function LPDCalculator({ projectId }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Local SF overrides: slug → number
  const [sfOverrides, setSfOverrides] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/lpd-summary`);
      if (!res.ok) throw new Error('Failed to load LPD data');
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { if (open && !data) load(); }, [open, data, load]);

  function handleAreaSfChange(slug, value) {
    setSfOverrides(prev => ({ ...prev, [slug]: value }));
  }

  // Merge API data with local overrides, recompute LPD
  const mergedAreas = data?.areas?.map(area => {
    const sf = sfOverrides[area.slug] !== undefined ? sfOverrides[area.slug] : area.areaSf;
    const hasAllQtys = area.fixtures.every(f => f.qty != null);
    const lpd = sf && sf > 0 && hasAllQtys && area.totalWatts != null ? area.totalWatts / sf : null;
    const compliant = lpd != null && area.ashraeLimit != null ? lpd <= area.ashraeLimit : null;
    return { ...area, areaSf: sf, lpd, compliant };
  }) ?? [];

  const passCount = mergedAreas.filter(a => a.compliant === true).length;
  const failCount = mergedAreas.filter(a => a.compliant === false).length;
  const pendingCount = mergedAreas.filter(a => a.compliant === null && a.ashraeLimit != null).length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header, always visible */}
      {/* Phones: tighter side padding, header badges wrap (Mike 10-29) */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-4 hover:bg-slate-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-amber-600" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="16" height="12" rx="1.5" />
              <path d="M6 8h8M6 12h5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">LPD Calculator</p>
            <p className="text-xs text-slate-400 mt-0.5">Lighting Power Density by area · ASHRAE 90.1</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {failCount > 0  && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{failCount} fail</span>}
              {passCount > 0  && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{passCount} pass</span>}
              {pendingCount > 0 && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">{pendingCount} need data</span>}
            </div>
          )}
          <svg
            viewBox="0 0 20 20" fill="currentColor"
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="border-t border-slate-100">
          {loading && (
            <div className="flex items-center gap-2 px-4 md:px-6 py-8 text-slate-400 text-sm">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              Loading…
            </div>
          )}

          {error && (
            <div className="px-4 md:px-6 py-4 text-sm text-red-600">{error}</div>
          )}

          {!loading && !error && data && (
            <>
              {/* Status bar */}
              <div className="flex flex-wrap items-center gap-4 px-4 md:px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
                <span className={`flex items-center gap-1 ${data.hasSchedule ? 'text-green-600' : 'text-amber-500'}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${data.hasSchedule ? 'bg-green-500' : 'bg-amber-400'}`} />
                  {data.hasSchedule ? 'Fixture schedule loaded' : 'No fixture schedule, add fixtures first'}
                </span>
                <span className={`flex items-center gap-1 ${data.hasTakeoff ? 'text-green-600' : 'text-amber-500'}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${data.hasTakeoff ? 'bg-green-500' : 'bg-amber-400'}`} />
                  {data.hasTakeoff
                    ? `Takeoff: ${data.takeoffFile?.name ?? 'loaded'}`
                    : 'No takeoff, upload a Countfire export for quantities'}
                </span>
                <span className={`flex items-center gap-1 ${data.hasAreas ? 'text-green-600' : 'text-amber-500'}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${data.hasAreas ? 'bg-green-500' : 'bg-amber-400'}`} />
                  {data.hasAreas ? 'Area SF from project data' : 'Area SF not set, enter manually below'}
                </span>
                <button
                  onClick={load}
                  className="ml-auto text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                  title="Refresh"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H5.498a.75.75 0 00-.75.75v3.236a.75.75 0 001.5 0v-1.83l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.388zm-3.564-9.324a7 7 0 00-11.712 3.138.75.75 0 001.449.388 5.5 5.5 0 019.201-2.466l.312.311H8.564a.75.75 0 000 1.5h3.432a.75.75 0 00.75-.75V1.018a.75.75 0 00-1.5 0v1.83l-.498-.748z" clipRule="evenodd" />
                  </svg>
                  Refresh
                </button>
              </div>

              {mergedAreas.length === 0 ? (
                <div className="px-4 md:px-6 py-8 text-center text-sm text-slate-400">
                  No fixture schedule data yet. Add fixtures with wattage values in the Fixture Schedule tab.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2.5">Location</th>
                        <th className="px-4 py-2.5">Fixture Types</th>
                        <th className="px-4 py-2.5 text-right">Total Watts</th>
                        <th className="px-4 py-2.5 text-right">
                          Area (ft²)
                          <span className="ml-1 text-slate-300 normal-case font-normal">(click to edit)</span>
                        </th>
                        <th className="px-4 py-2.5 text-right">LPD</th>
                        <th className="px-4 py-2.5 text-right">ASHRAE Limit</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mergedAreas.map(area => (
                        <AreaRow
                          key={area.slug}
                          area={area}
                          onAreaSfChange={handleAreaSfChange}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="px-4 md:px-6 py-3 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50">
                ASHRAE 90.1-2022 §9.5.1 limits shown. Residential units (R-2) are exempt. Click any area value to override. Quantities from latest Countfire takeoff. Fixtures shown in amber have no matching takeoff key.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
