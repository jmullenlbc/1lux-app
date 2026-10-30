'use client';
import { useState, useRef } from 'react';

// Parse CSV or TSV rows
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const sep = lines[0].includes('\t') ? '\t' : ',';
  return lines.map(l => {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of l) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === sep && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  });
}

const COL_HINTS = {
  typeCode:    ['type', 'fixture type', 'luminaire type', 'tag'],
  description: ['description', 'desc', 'fixture description', 'luminaire description'],
  location:    ['location', 'area', 'space', 'zone'],
  manufacturer:['manufacturer', 'mfr', 'brand', 'vendor'],
  modelNumber: ['catalog', 'catalog #', 'model', 'model number', 'model #', 'part number', 'part #'],
};

function guessMapping(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const lower = h.toLowerCase().trim();
    for (const [field, hints] of Object.entries(COL_HINTS)) {
      if (!map[field] && hints.some(hint => lower.includes(hint))) {
        map[field] = i;
      }
    }
  });
  return map;
}

export default function ImportModal({ projectId, trackerId, onClose, onImported }) {
  const fileRef  = useRef(null);
  const [step,   setStep]   = useState('upload'); // upload | map | preview | importing
  const [rows,   setRows]   = useState([]);
  const [headers,setHeaders]= useState([]);
  const [mapping,setMapping]= useState({});
  const [preview,setPreview]= useState([]);
  const [error,  setError]  = useState('');

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed  = parseCSV(ev.target.result);
      if (parsed.length < 2) { setError('File appears empty or unparseable'); return; }
      const hdrs    = parsed[0];
      const dataRows= parsed.slice(1).filter(r => r.some(c => c));
      setHeaders(hdrs);
      setRows(dataRows);
      setMapping(guessMapping(hdrs));
      setStep('map');
      setError('');
    };
    reader.readAsText(file);
  }

  function buildPreview() {
    if (mapping.typeCode === undefined) { setError('Must map the Type column'); return; }
    const items = rows
      .map(r => ({
        typeCode:    r[mapping.typeCode]    || '',
        description: mapping.description !== undefined ? r[mapping.description] : '',
        location:    mapping.location    !== undefined ? r[mapping.location]    : '',
        manufacturer:mapping.manufacturer !== undefined ? r[mapping.manufacturer]: '',
        modelNumber: mapping.modelNumber  !== undefined ? r[mapping.modelNumber] : '',
      }))
      .filter(i => i.typeCode.trim());
    setPreview(items);
    setStep('preview');
  }

  async function doImport() {
    setStep('importing');
    // POST bulk items
    const res = await fetch(`/api/projects/${projectId}/tracker/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: preview.map(i => ({
        typeCode:    i.typeCode,
        description: i.description || null,
        location:    i.location    || null,
      })) }),
    });
    if (!res.ok) { setError('Import failed'); setStep('preview'); return; }

    // If we have manufacturer/model, create a submission + versions
    const withSpec = preview.filter(i => i.manufacturer || i.modelNumber);
    if (withSpec.length > 0) {
      const itemsRes = await fetch(`/api/projects/${projectId}/tracker`);
      if (itemsRes.ok) {
        const { tracker } = await itemsRes.json();
        const itemMap = {};
        for (const item of tracker.items) itemMap[item.typeCode] = item.id;

        const specs = withSpec
          .filter(i => itemMap[i.typeCode])
          .map(i => ({ itemId: itemMap[i.typeCode], manufacturer: i.manufacturer, modelNumber: i.modelNumber }));

        if (specs.length > 0) {
          await fetch(`/api/projects/${projectId}/tracker/submissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'Initial Import',
              submittedDate: new Date().toISOString().split('T')[0],
              notes: 'Imported from fixture schedule',
              specs,
            }),
          });
        }
      }
    }
    onImported();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">Import Fixture Schedule</h2>
            <p className="text-xs text-slate-500 mt-0.5">CSV or Excel export · columns auto-detected</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
            >
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={handleFile} className="hidden" />
              <svg className="w-8 h-8 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-medium text-slate-600">Drop your fixture schedule here</p>
              <p className="text-xs text-slate-500 mt-1">CSV or TSV · needs Type, Manufacturer, Catalog # columns</p>
            </div>
          )}

          {/* Step 2: Column mapping */}
          {step === 'map' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Found <strong>{rows.length}</strong> rows. Confirm column mapping:
              </p>
              {Object.entries(COL_HINTS).map(([field, _]) => (
                <div key={field} className="flex items-center gap-3">
                  <label className="w-36 text-xs font-semibold text-slate-600 capitalize shrink-0">
                    {field === 'typeCode' ? 'Type *' : field === 'modelNumber' ? 'Catalog / Model' : field.replace(/([A-Z])/g, ' $1')}
                  </label>
                  <select
                    value={mapping[field] ?? ''}
                    onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">Skip</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Ready to import <strong>{preview.length}</strong> fixture types:
              </p>
              {/* Phones: preview table scrolls sideways (Mike 10-29) */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto md:overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Type</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Description</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Manufacturer</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 20).map((item, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-2 font-semibold text-slate-700">{item.typeCode}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">{item.description}</td>
                        <td className="px-3 py-2 text-slate-500">{item.manufacturer}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[180px] truncate">{item.modelNumber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 20 && (
                  <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-100">
                    …and {preview.length - 20} more
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-slate-500">Importing…</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-600">Cancel</button>
          <div className="flex items-center gap-2">
            {step === 'map' && (
              <button onClick={buildPreview}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors">
                Preview →
              </button>
            )}
            {step === 'preview' && (
              <>
                <button onClick={() => setStep('map')} className="text-sm text-slate-500 hover:text-slate-600">
                  ← Back
                </button>
                <button onClick={doImport}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors">
                  Import {preview.length} types
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
