'use client';
import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

const FIXTURE_FIELDS = [
  { key: 'type',          label: 'Type'          },
  { key: 'location',      label: 'Location'      },
  { key: 'description',   label: 'Description'   },
  { key: 'manufacturer',  label: 'Manufacturer'  },
  { key: 'catalogNumber', label: 'Catalog #'     },
  { key: 'finish',        label: 'Finish'        },
  { key: 'cct',           label: 'CCT'           },
  { key: 'lumens',        label: 'Lumens'        },
  { key: 'wattage',       label: 'Wattage'       },
  { key: 'voltage',       label: 'Voltage'       },
  { key: 'dimming',       label: 'Dimming'       },
  { key: 'mounting',      label: 'Mounting'      },
  { key: 'notes',         label: 'Notes'         },
  { key: 'internalNotes', label: 'Internal Notes'},
];

// Fuzzy-match a source column header to a known field
function autoMap(header) {
  const h = header.toLowerCase().replace(/[\s_-]/g, '');
  const matchers = [
    ['type',          ['type', 'fixturetype', 'id', 'tag']],
    ['location',      ['location', 'loc', 'area', 'zone', 'room']],
    ['description',   ['description', 'desc', 'name', 'fixture', 'model']],
    ['manufacturer',  ['manufacturer', 'mfr', 'mfg', 'brand', 'make']],
    ['catalogNumber', ['catalognumber', 'catalog', 'catnumber', 'catno', 'partnumber', 'partno', 'model#', 'modelnumber', 'sku']],
    ['finish',        ['finish', 'color', 'colour']],
    ['cct',           ['cct', 'colortemperature', 'kelvin', 'k']],
    ['lumens',        ['lumens', 'lumen', 'lm', 'output']],
    ['wattage',       ['wattage', 'watts', 'watt', 'w']],
    ['voltage',       ['voltage', 'volts', 'v']],
    ['dimming',       ['dimming', 'dim', 'control', 'protocol']],
    ['mounting',      ['mounting', 'mount', 'installation']],
    ['notes',         ['notes', 'note', 'remarks', 'comments']],
    ['internalNotes', ['internalnotes', 'internal', 'intnotes']],
  ];
  for (const [field, patterns] of matchers) {
    if (patterns.some(p => h.includes(p))) return field;
  }
  return '';
}

export default function FixtureImportModal({ projectId, onImported, onClose }) {
  const [step,       setStep]       = useState('upload'); // upload | map | confirm
  const [headers,    setHeaders]    = useState([]);
  const [rows,       setRows]       = useState([]);
  const [mapping,    setMapping]    = useState({});
  const [mode,       setMode]       = useState('replace');
  const [importing,  setImporting]  = useState(false);
  const [error,      setError]      = useState(null);
  const [dragOver,   setDragOver]   = useState(false);
  const fileRef = useRef(null);

  function parseFile(file) {
    setError(null);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!data || data.length < 2) { setError('File appears to be empty'); return; }

        // Auto-detect title row: if first row has only 1 non-empty cell, it's a
        // merged "LUMINAIRE SCHEDULE" style title — use row 2 as actual headers.
        let headerRowIdx = 0;
        const row0NonEmpty = data[0].filter(c => String(c ?? '').trim() !== '').length;
        if (row0NonEmpty <= 1 && data.length > 2) headerRowIdx = 1;

        // Build unique header names — blank/duplicate cells get "Column N" suffix
        const rawHdrs = data[headerRowIdx].map(h => String(h ?? '').trim());
        const seen = {};
        const hdrs = rawHdrs.map((h, i) => {
          const base = h || `Column ${i + 1}`;
          if (seen[base] === undefined) { seen[base] = 0; return base; }
          seen[base]++;
          return `${base}_${seen[base]}`;
        });

        const dataRows = data.slice(headerRowIdx + 1).filter(r => r.some(c => c !== ''));
        const autoMapped = {};
        hdrs.forEach(h => { const f = autoMap(h); if (f) autoMapped[h] = f; });
        setHeaders(hdrs);
        setRows(dataRows);
        setMapping(autoMapped);
        setStep('map');
      } catch (err) {
        setError('Could not parse file, make sure it is an Excel (.xlsx/.xls) or CSV file');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  }

  function setMap(header, field) {
    setMapping(prev => {
      const next = { ...prev };
      // clear any existing mapping to this field
      for (const k of Object.keys(next)) { if (next[k] === field) delete next[k]; }
      if (field) next[header] = field;
      else delete next[header];
      return next;
    });
  }

  function buildMappedRows() {
    return rows.map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        const field = mapping[h];
        if (field) obj[field] = row[i] != null ? String(row[i]).trim() : '';
      });
      return obj;
    }).filter(r => Object.values(r).some(v => v !== ''));
  }

  const mappedRows = step !== 'upload' ? buildMappedRows() : [];
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  async function doImport() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/fixture-schedule/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, items: mappedRows }),
      });
      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      onImported(data.draft);
    } catch (e) {
      setError(e.message);
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Import Fixture Schedule</h2>
            <p className="text-xs text-slate-500 mt-0.5">Excel (.xlsx/.xls) or CSV</p>
          </div>
          <button className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100" onClick={onClose}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
          {step === 'upload' && (
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer
                ${dragOver ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
              <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-medium text-slate-600">Drop a file here or click to browse</p>
              <p className="text-xs text-slate-500 mt-1">Excel or CSV · First row should be column headers</p>
            </div>
          )}

          {/* ── Step 2: Map columns ────────────────────────────────────────── */}
          {step === 'map' && (
            <>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>Match each column to a fixture schedule field.</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300 inline-block" />Auto-mapped</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-50 border border-red-200 inline-block" />Needs mapping</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Your Column</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Preview</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Maps to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h, i) => {
                      const mapped   = mapping[h];
                      const hasData  = rows.slice(0, 3).some(r => r[i] != null && r[i] !== '');
                      // Only flag as "needs mapping" if the column has actual data
                      const rowCls = mapped
                        ? 'bg-green-50'
                        : hasData ? 'bg-red-50/60' : 'bg-white opacity-50';
                      return (
                        <tr key={`${h}-${i}`} className={rowCls}>
                          <td className="px-4 py-2 font-medium text-slate-700">
                            {h}
                            {!mapped && hasData && (
                              <span className="ml-1.5 text-[11px] font-bold text-red-400 uppercase">needs mapping</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-500 truncate max-w-[140px]">
                            {rows.slice(0, 3).map(r => r[i]).filter(v => v != null && v !== '').join(', ') || '-'}
                          </td>
                          <td className="px-4 py-2">
                            <select
                              className={`text-xs border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                                mapped ? 'border-green-300 text-green-700 font-semibold' :
                                hasData ? 'border-red-300 text-slate-600' : 'border-slate-200 text-slate-400'
                              }`}
                              value={mapped || ''}
                              onChange={e => setMap(h, e.target.value)}
                            >
                              <option value="">skip</option>
                              {FIXTURE_FIELDS.map(f => (
                                <option key={f.key} value={f.key}>{f.label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mode picker */}
              <div className="space-y-2 pt-1">
                <p className="text-sm font-medium text-slate-700">Import mode</p>
                <div className="flex gap-3">
                  {[
                    { value: 'replace', label: 'Replace', desc: 'Clear existing rows and replace with imported data' },
                    { value: 'merge',   label: 'Merge',   desc: 'Append imported rows to the existing draft' },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={`flex-1 flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors
                        ${mode === opt.value ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <input
                        type="radio"
                        name="mode"
                        value={opt.value}
                        checked={mode === opt.value}
                        onChange={() => setMode(opt.value)}
                        className="mt-0.5 accent-orange-500"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{opt.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-1">
                <button className="text-sm font-semibold text-slate-500 hover:text-slate-700" onClick={() => setStep('upload')}>
                  ← Choose different file
                </button>
                <button
                  className="text-sm font-semibold px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
                  disabled={mappedCount === 0 || mappedRows.length === 0}
                  onClick={() => setStep('confirm')}
                >
                  Preview {mappedRows.length} row{mappedRows.length !== 1 ? 's' : ''} →
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: Confirm preview ────────────────────────────────────── */}
          {step === 'confirm' && (
            <>
              <div className={`rounded-xl p-3 text-sm ${mode === 'replace' ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-orange-50 border border-orange-200 text-orange-700'}`}>
                {mode === 'replace'
                  ? `⚠ This will replace all existing draft rows with ${mappedRows.length} imported rows.`
                  : `${mappedRows.length} rows will be appended to the existing draft.`}
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-64">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      {FIXTURE_FIELDS.filter(f => Object.values(mapping).includes(f.key)).map(f => (
                        <th key={f.key} className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 50).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        {FIXTURE_FIELDS.filter(f => Object.values(mapping).includes(f.key)).map(f => (
                          <td key={f.key} className="px-3 py-1.5 text-slate-600 max-w-[120px] truncate">{row[f.key] || '-'}</td>
                        ))}
                      </tr>
                    ))}
                    {mappedRows.length > 50 && (
                      <tr><td colSpan={99} className="px-3 py-2 text-slate-500 text-center">and {mappedRows.length - 50} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-1">
                <button className="text-sm font-semibold text-slate-500 hover:text-slate-700" onClick={() => setStep('map')}>
                  ← Back to mapping
                </button>
                <button
                  className="text-sm font-semibold px-5 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center gap-2"
                  disabled={importing}
                  onClick={doImport}
                >
                  {importing && (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
                    </svg>
                  )}
                  {importing ? 'Importing…' : `Import ${mappedRows.length} rows`}
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
