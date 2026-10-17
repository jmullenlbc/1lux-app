'use client';
import { useState, useRef, useCallback } from 'react';
import { oversizeMessage, uploadErrorMessage } from '@/lib/uploadErrorMessage';
import { appendUpload } from '@/lib/uploadClient';

const ASHRAE_LIMITS = {
  corridor: 0.66, garage: 0.21, parking: 0.21, boh: 0.75,
  amenity: 0.80, office: 0.98, lobby: 0.90, classroom: 1.24,
  retail: 1.05, warehouse: 0.33,
};

function fmtLpd(v) { return v == null ? '—' : v.toFixed(3); }
function fmtWatts(v) { if (v == null) return '—'; return v >= 1000 ? `${(v / 1000).toFixed(1)} kW` : `${Math.round(v)} W`; }

// ── Dropzone ──────────────────────────────────────────────────────────────────
function Dropzone({ onFile, loading }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => !loading && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 transition-colors cursor-pointer select-none
        ${loading ? 'border-orange-200 bg-orange-50 pointer-events-none' :
          drag ? "border-orange-400 bg-orange-50" :
          'border-slate-200 hover:border-slate-400 hover:bg-slate-50'}`}
    >
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f); e.target.value = ''; } }} />

      {loading ? (
        <>
          <svg className="animate-spin w-10 h-10 text-orange-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          <p className="text-sm font-medium text-slate-700">Parsing fixture schedule…</p>
        </>
      ) : (
        <>
          <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-orange-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-slate-800">Drop your fixture schedule here</p>
            <p className="text-sm text-slate-500 mt-1">CSV, Excel (.xlsx, .xls), any format with Type, Wattage, Qty, Location columns</p>
          </div>
          <span className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors">
            Browse file
          </span>
        </>
      )}
    </div>
  );
}

// ── Column map preview ────────────────────────────────────────────────────────
function ColumnMapPreview({ columnMap, headers, onRemap }) {
  const FIELDS = [
    { key: 'type',        label: 'Type / Mark',    required: true  },
    { key: 'wattage',     label: 'Wattage (W)',     required: true  },
    { key: 'qty',         label: 'Quantity',        required: true  },
    { key: 'location',    label: 'Location / Space',required: true  },
    { key: 'description', label: 'Description',     required: false },
    { key: 'areaSf',      label: 'Area SF',         required: false },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
        <p className="text-xs font-semibold text-slate-600">Detected column mapping, correct if needed</p>
      </div>
      <div className="divide-y divide-slate-100">
        {FIELDS.map(f => (
          <div key={f.key} className="flex items-center gap-3 px-5 py-2.5">
            <span className="w-36 text-xs font-medium text-slate-600 shrink-0">
              {f.label}
              {f.required && <span className="text-red-400 ml-0.5">*</span>}
            </span>
            <select
              className="flex-1 text-xs font-mono bg-white border border-slate-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-orange-500"
              value={columnMap[f.key] || ''}
              onChange={e => onRemap(f.key, e.target.value || undefined)}
            >
              <option value="">Not mapped</option>
              {headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            {columnMap[f.key]
              ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold shrink-0">✓</span>
              : f.required
                ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold shrink-0">needed</span>
                : <span className="text-[11px] text-slate-500 shrink-0">optional</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Area result row ───────────────────────────────────────────────────────────
function AreaRow({ area, sfOverride, onSfChange, qtyOverrides, onQtyChange }) {
  const [editSf, setEditSf] = useState(false);
  const [localSf, setLocalSf] = useState(sfOverride != null ? String(Math.round(sfOverride)) : area.areaSf ? String(Math.round(area.areaSf)) : '');

  const sf = sfOverride ?? area.areaSf ?? null;
  const limit = area.ashraeLimit;

  // Compute local totals using qty overrides
  const fixtures = area.fixtures.map(f => {
    const qty = qtyOverrides?.[`${area.slug}::${f.type}`] ?? f.qty;
    return { ...f, qty, totalWatts: f.wattage != null && qty != null ? f.wattage * qty : null };
  });
  const allHaveWatts = fixtures.every(f => f.wattage != null);
  const allHaveQty   = fixtures.every(f => f.qty != null);
  const totalWatts   = allHaveWatts && allHaveQty ? fixtures.reduce((s, f) => s + (f.totalWatts ?? 0), 0) : null;
  const lpd          = totalWatts != null && sf != null && sf > 0 ? totalWatts / sf : null;
  const compliant    = lpd != null && limit != null ? lpd <= limit : null;

  function commitSf() {
    setEditSf(false);
    const v = parseFloat(localSf);
    onSfChange(area.slug, isNaN(v) || v <= 0 ? null : v);
  }

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/50">
      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">{area.label}</p>
        {area.rawLocations && <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[160px]" title={area.rawLocations}>{area.rawLocations}</p>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {fixtures.map((f, i) => {
            const qtyKey = `${area.slug}::${f.type}`;
            const hasQty = f.qty != null;
            return (
              <div key={i} className="flex items-center gap-1 text-[11px]">
                <span className="font-mono font-semibold text-slate-700 bg-slate-100 rounded px-1.5 py-0.5">{f.type}</span>
                <span className="text-slate-500">{f.wattage != null ? `${f.wattage}W` : '?W'}</span>
                <span className="text-slate-300">×</span>
                {hasQty ? (
                  <span className="text-slate-600 font-semibold">{f.qty}</span>
                ) : (
                  <input
                    type="number" min="0" placeholder="qty"
                    className="w-12 text-xs text-center border border-slate-300 rounded-lg px-1 py-0.5 bg-white outline-none focus:ring-1 focus:ring-orange-500"
                    onChange={e => { const v = parseFloat(e.target.value); onQtyChange(qtyKey, isNaN(v) ? null : v); }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`text-sm font-semibold ${totalWatts != null ? 'text-slate-800' : 'text-slate-300'}`}>
          {fmtWatts(totalWatts)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {editSf ? (
          <input autoFocus type="number"
            className="w-24 text-sm font-semibold text-right bg-white border border-slate-300 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-orange-500"
            value={localSf}
            onChange={e => setLocalSf(e.target.value)}
            onBlur={commitSf}
            onKeyDown={e => { if (e.key === 'Enter') commitSf(); if (e.key === 'Escape') { setLocalSf(''); setEditSf(false); } }}
          />
        ) : (
          <button onClick={() => setEditSf(true)}
            className={`text-sm font-semibold rounded px-1.5 py-0.5 hover:bg-slate-100 transition-colors ${sf ? 'text-slate-800' : 'text-slate-500'}`}
            title="Click to enter area (sq ft)"
          >
            {sf ? Number(sf).toLocaleString() : 'enter SF'}
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`text-sm font-mono font-bold ${compliant === true ? 'text-green-600' : compliant === false ? 'text-red-600' : 'text-slate-500'}`}>
          {fmtLpd(lpd)}
        </span>
        {lpd != null && <span className="text-[11px] text-slate-500 ml-0.5">W/ft²</span>}
      </td>
      <td className="px-4 py-3 text-right">
        {limit != null ? <span className="text-sm font-mono text-slate-500">{limit.toFixed(2)}</span>
          : <span className="text-xs text-slate-300">{area.slug === 'units' ? 'exempt' : 'N/A'}</span>}
      </td>
      <td className="px-4 py-3 text-center">
        {compliant === true  && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700">PASS</span>}
        {compliant === false && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">FAIL</span>}
        {compliant === null  && totalWatts == null && <span className="text-[11px] text-slate-500">need qty</span>}
        {compliant === null  && totalWatts != null && sf == null && <span className="text-[11px] text-slate-500">need SF</span>}
        {compliant === null  && totalWatts != null && sf != null && limit == null && <span className="text-[11px] text-slate-500">no limit</span>}
      </td>
    </tr>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LPDCheckClient() {
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [result,      setResult]      = useState(null);
  const [columnMap,   setColumnMap]   = useState({});
  const [sfOverrides, setSfOverrides] = useState({});   // slug → number
  const [qtyOverrides,setQtyOverrides]= useState({});   // "slug::type" → number
  const [showCols,    setShowCols]    = useState(false);

  async function handleFile(file) {
    setLoading(true);
    setError(null);
    setResult(null);
    setSfOverrides({});
    setQtyOverrides({});

    const tooBig = oversizeMessage(file);
    if (tooBig) { setError(tooBig); setLoading(false); return; }

    try {
      const fd = new FormData();
      await appendUpload(fd, file, { scope: 'project' });
      const res = await fetch('/api/lpd-check', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await uploadErrorMessage(res, file));
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setColumnMap(data.columnMap);
      setShowCols(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function reparse(newMap) {
    if (!result) return;
    // Re-fetch with updated column map isn't possible without re-uploading the file.
    // Instead, update the column map locally and show a note.
    setColumnMap(newMap);
  }

  const areas = result?.areas ?? [];
  const passCount = areas.filter(a => {
    const sf = sfOverrides[a.slug] ?? a.areaSf;
    if (!sf || a.totalWatts == null || !a.ashraeLimit) return false;
    return (a.totalWatts / sf) <= a.ashraeLimit;
  }).length;
  const failCount = areas.filter(a => {
    const sf = sfOverrides[a.slug] ?? a.areaSf;
    if (!sf || a.totalWatts == null || !a.ashraeLimit) return false;
    return (a.totalWatts / sf) > a.ashraeLimit;
  }).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-orange-600">
              <rect x="2" y="4" width="16" height="12" rx="1.5" />
              <path d="M6 8h8M6 12h5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">LPD Compliance Checker</h1>
            <p className="text-sm text-slate-500">Upload a fixture schedule CSV or Excel, get ASHRAE 90.1-2022 compliance in seconds</p>
          </div>
        </div>
      </div>

      {/* Upload */}
      <Dropzone onFile={handleFile} loading={loading} />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          <span className="font-semibold">Error: </span>{error}
          <p className="text-xs text-red-500 mt-1">Make sure the file has columns for Type, Wattage, Qty, and Location.</p>
        </div>
      )}

      {/* Warnings */}
      {result?.warnings?.length > 0 && (
        <div className="space-y-2">
          {result.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {result && (
        <>
          {/* File + column map summary */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-slate-800">{result.fileName}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-500">{result.rowCount} fixture types parsed</span>
                {result.areas.length > 0 && (
                  <><span className="text-slate-500">·</span>
                  <span className="text-slate-500">{result.areas.length} location groups</span></>
                )}
              </div>
              <button onClick={() => setShowCols(p => !p)}
                className="text-xs text-slate-500 hover:text-slate-600 flex items-center gap-1 transition-colors">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.24a.75.75 0 011.06-.04l2.7 2.908 2.7-2.908a.75.75 0 011.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z" clipRule="evenodd" />
                </svg>
                {showCols ? 'Hide' : 'Edit'} columns
              </button>
            </div>

            {showCols && (
              <div className="px-5 py-4 border-b border-slate-100">
                <ColumnMapPreview
                  columnMap={columnMap}
                  headers={result.headers}
                  onRemap={(field, val) => {
                    const next = { ...columnMap };
                    if (val) next[field] = val; else delete next[field];
                    reparse(next);
                  }}
                />
                <p className="text-[11px] text-slate-500 mt-2">
                  Column remapping updates the display, re-upload the file to re-parse with new mappings.
                </p>
              </div>
            )}

            {/* Detected mappings chips */}
            {!showCols && (
              <div className="flex flex-wrap gap-2 px-5 py-3">
                {Object.entries(columnMap).filter(([k]) => ['type','wattage','qty','location'].includes(k)).map(([field, col]) => (
                  <span key={field} className="text-[11px] font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                    <span className="text-slate-500">{field} → </span>{col}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Results table */}
          {areas.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">ASHRAE 90.1-2022 §9.5.1 Compliance Matrix</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Click any area value to enter SF · Residential units (R-2) are exempt</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {failCount > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{failCount} FAIL</span>}
                  {passCount > 0 && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{passCount} PASS</span>}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-2.5">Location</th>
                      <th className="px-4 py-2.5">Fixtures (Type · W × Qty)</th>
                      <th className="px-4 py-2.5 text-right">Total Watts</th>
                      <th className="px-4 py-2.5 text-right">Area ft² <span className="font-normal normal-case text-slate-300">(click)</span></th>
                      <th className="px-4 py-2.5 text-right">LPD</th>
                      <th className="px-4 py-2.5 text-right">Limit</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areas.map(area => (
                      <AreaRow
                        key={area.slug}
                        area={area}
                        sfOverride={sfOverrides[area.slug] ?? null}
                        onSfChange={(slug, v) => setSfOverrides(prev => ({ ...prev, [slug]: v }))}
                        qtyOverrides={qtyOverrides}
                        onQtyChange={(key, v) => setQtyOverrides(prev => ({ ...prev, [key]: v }))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
                ASHRAE 90.1-2022 §9.5.1 limits. Exterior and residential units have no interior LPD limit.
                Areas with amber qty inputs need manual entry, upload a schedule with a Qty column to auto-fill.
              </div>
            </div>
          )}

          {/* Reset */}
          <div className="text-center">
            <button onClick={() => { setResult(null); setError(null); setSfOverrides({}); setQtyOverrides({}); }}
              className="text-sm text-slate-500 hover:text-slate-600 transition-colors">
              ← Check a different file
            </button>
          </div>
        </>
      )}

      {/* How it works */}
      {!result && !loading && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-6 py-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { step: '1', title: 'Upload your schedule', body: 'Any CSV or Excel with fixture types, wattages, quantities, and location tags.' },
              { step: '2', title: 'Auto-detect columns', body: 'The tool maps common column names (Type, Watts, Qty, Space), correct if needed.' },
              { step: '3', title: 'Enter area SF', body: 'Type in square footage per space. LPD and PASS/FAIL update instantly.' },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-orange-50 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-4 border-t border-slate-200 pt-3">
            Expected columns (any order, any capitalization): <span className="font-mono">Type / Mark</span>, <span className="font-mono">Watts / Wattage</span>, <span className="font-mono">Qty / Count</span>, <span className="font-mono">Location / Space</span>, and optionally <span className="font-mono">Area SF</span>.
          </p>
        </div>
      )}
    </div>
  );
}
