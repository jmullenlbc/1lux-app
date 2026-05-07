'use client';
import { useState, useRef } from 'react';

const SECTION_OPTIONS = [
  { id: 'units',    label: 'Units'         },
  { id: 'corridor', label: 'Corridor'      },
  { id: 'garage',   label: 'Garage'        },
  { id: 'boh',      label: 'BOH'           },
  { id: 'office',   label: 'Office'        },
  { id: 'amenity',  label: 'Amenity'       },
  { id: 'exterior', label: 'Exterior/Site' },
  { id: 'controls', label: 'Controls'      },
  { id: 'other',    label: 'Other'         },
];

export default function FixtureScheduleTab({ projectId }) {
  const [step,     setStep]     = useState('upload'); // 'upload'|'parsing'|'preview'|'importing'|'done'
  const [warning,  setWarning]  = useState(null);
  const [fixtures, setFixtures] = useState([]);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error,    setError]    = useState(null);
  const [imported, setImported] = useState(0);
  const fileRef = useRef(null);

  async function parseFile(file) {
    if (!file || file.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    setFileName(file.name);
    setError(null);
    setStep('parsing');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res  = await fetch(`/api/projects/${projectId}/peer-review/parse-pdf`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');
      setFixtures((data.fixtures || []).map((f, i) => ({ ...f, _id: i, section: f.suggestedSection || 'other' })));
      setWarning(data.warning || null);
      setStep('preview');
    } catch (e) {
      setError(e.message);
      setStep('upload');
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function updateSection(idx, section) {
    setFixtures(prev => prev.map((f, i) => i === idx ? { ...f, section } : f));
  }

  function removeRow(idx) {
    setFixtures(prev => prev.filter((_, i) => i !== idx));
  }

  async function pushToBidMatrix() {
    if (fixtures.length === 0) return;
    setStep('importing');
    try {
      const res  = await fetch(`/api/projects/${projectId}/peer-review/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: fixtures }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImported(data.imported);
      setStep('done');
    } catch (e) {
      setError(e.message);
      setStep('preview');
    }
  }

  function reset() {
    setStep('upload'); setFixtures([]); setWarning(null);
    setError(null); setImported(0); setFileName('');
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center gap-6 py-20">
        <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-slate-800">{imported} fixture{imported !== 1 ? 's' : ''} pushed to Bid Matrix</p>
          <p className="text-sm text-slate-400 mt-1">Open the Bid Matrix from the Budgets tab to review, price, and finalize.</p>
        </div>
        <button onClick={reset}
          className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          Parse Another PDF
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Upload zone */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Parse Fixture Schedule from PDF</h3>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => step === 'upload' && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 transition-colors ${
            step === 'parsing' ? 'border-blue-300 bg-blue-50 pointer-events-none' :
            dragging            ? 'border-blue-400 bg-blue-50 cursor-copy' :
                                  'border-slate-200 hover:border-slate-400 hover:bg-slate-50 cursor-pointer'
          }`}
        >
          {step === 'parsing' ? (
            <>
              <svg className="animate-spin w-8 h-8 text-blue-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              <p className="text-sm font-semibold text-slate-600">Extracting &amp; parsing &ldquo;{fileName}&rdquo; with AI…</p>
              <p className="text-xs text-slate-400">This may take 15–30 seconds</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">Drop electrical drawing PDF here</p>
                <p className="text-xs text-slate-400 mt-1">or click to browse · PDF only · must be text-based (not scanned)</p>
              </div>
            </>
          )}
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
            onChange={e => e.target.files[0] && parseFile(e.target.files[0])} />
        </div>
        {error && <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">{error}</div>}
        <div className="mt-3 text-xs text-slate-400 space-y-0.5">
          <p>• Upload the E-sheet that contains the Luminaire Schedule or Light Fixture Schedule table</p>
          <p>• Image-based or scanned PDFs must be OCR&apos;d first (Bluebeam: Document → OCR)</p>
          <p>• Works with multi-section sheets — AI searches the entire document for the schedule</p>
        </div>
      </div>

      {/* Preview */}
      {(step === 'preview' || step === 'importing') && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">
                {fixtures.length} fixture type{fixtures.length !== 1 ? 's' : ''} found in &ldquo;{fileName}&rdquo;
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Adjust sections if needed, remove unwanted rows, then push to Bid Matrix</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={reset}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                Try Another PDF
              </button>
              {fixtures.length > 0 && (
                <button onClick={pushToBidMatrix} disabled={step === 'importing'}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-60 shadow-sm">
                  {step === 'importing' ? (
                    <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>Pushing…</>
                  ) : (
                    <>Push {fixtures.length} fixture{fixtures.length !== 1 ? 's' : ''} to Bid Matrix</>
                  )}
                </button>
              )}
            </div>
          </div>

          {warning && (
            <div className="mx-5 mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 flex gap-2">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{warning}</span>
            </div>
          )}

          {fixtures.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              {!warning && <p className="text-sm text-slate-400">No fixture types were found in this PDF.</p>}
              <button onClick={reset}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                Try a Different PDF
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-2 text-left w-16">Type</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-left w-36">Manufacturer</th>
                    <th className="px-3 py-2 text-left w-44">Catalog #</th>
                    <th className="px-3 py-2 text-right w-14">Watts</th>
                    <th className="px-3 py-2 text-left w-44">Section</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fixtures.map((f, idx) => (
                    <tr key={f._id} className={step === 'importing' ? 'opacity-50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-2 font-bold text-slate-800">{f.typeCode || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">
                        <span title={f.description}>{f.description || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {f.manufacturer ? f.manufacturer : <span className="text-slate-300 italic">TBD</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-500 max-w-[11rem] truncate" title={f.catalogNumber}>
                        {f.catalogNumber || <span className="text-slate-300 not-italic font-sans">TBD</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500">
                        {f.watts != null ? f.watts : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <select value={f.section} onChange={e => updateSection(idx, e.target.value)}
                          disabled={step === 'importing'}
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                          {SECTION_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => removeRow(idx)} disabled={step === 'importing'}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-0">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && (
            <div className="mx-5 my-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
