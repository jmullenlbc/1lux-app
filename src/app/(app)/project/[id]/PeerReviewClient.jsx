'use client';
import { useState, useRef, useEffect } from 'react';
import BudgetQCStrip from '@/components/budgetQC/BudgetQCStrip';
import PriceAlertBadge from '@/components/pricing/PriceAlertBadge';
import RetailPriceDot from '@/components/pricing/RetailPriceDot';
import Link from 'next/link';

// ── Location Tags ─────────────────────────────────────────────────────────────

const LOCATION_TAGS = [
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

const TAG_COLORS = {
  units:    'bg-pink-100 text-pink-700',
  corridor: 'bg-cyan-100 text-cyan-700',
  garage:   'bg-teal-600 text-white',
  boh:      'bg-orange-100 text-orange-700',
  office:   'bg-slate-200 text-slate-700',
  amenity:  'bg-green-500 text-white',
  exterior: 'bg-emerald-100 text-emerald-700',
  controls: 'bg-violet-100 text-violet-700',
  other:    'bg-slate-100 text-slate-500',
  // legacy values
  common:   'bg-blue-100 text-blue-700',
};

const TAG_ACTIVE = {
  units:    'bg-pink-500',
  corridor: 'bg-cyan-500',
  garage:   'bg-teal-600',
  boh:      'bg-orange-500',
  office:   'bg-slate-500',
  amenity:  'bg-green-500',
  exterior: 'bg-emerald-500',
  controls: 'bg-violet-500',
  other:    'bg-slate-400',
  common:   'bg-blue-500',
};

const RFQ_OPTIONS = ['Received', 'Budget Price', 'Pending', 'Needs Review'];
const ALT_OPTIONS = ['eLuma', 'Original Spec', 'Alt Spec', 'ILC Standard'];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || n === '') return null;
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDec(n) {
  if (n == null || n === '') return null;
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function r2(n) { return Math.round((n ?? 0) * 100) / 100; }

// ── Inline text cell ──────────────────────────────────────────────────────────

// Navigate to the next peer-cell in DOM order (Tab)
function navigatePeerCellRight(cellId) {
  const all = [...document.querySelectorAll('[data-peer-cell]')];
  const idx = all.findIndex(el => el.getAttribute('data-peer-cell') === cellId);
  if (idx >= 0 && idx < all.length - 1) all[idx + 1].focus();
}
// Navigate to the same field in the next row (Enter)
function navigatePeerCellDown(cellId) {
  if (!cellId) return;
  const field = cellId.split('||')[1];
  const all = [...document.querySelectorAll(`[data-peer-field="${field}"]`)];
  const idx = all.findIndex(el => el.getAttribute('data-peer-cell') === cellId);
  if (idx >= 0 && idx < all.length - 1) all[idx + 1].focus();
}

function Cell({ value, placeholder, onSave, numeric, align = 'left', className = '', mono, multiline, cellId }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(value != null ? String(value) : '');
  const ref = useRef(null);

  useEffect(() => { if (!editing) setVal(value != null ? String(value) : ''); }, [value, editing]);

  function start() { setEditing(true); setTimeout(() => ref.current?.focus(), 0); }
  function commit() {
    setEditing(false);
    let out = val.trim() === '' ? null : val.trim();
    if (numeric && out !== null) {
      const n = parseFloat(out.replace(/[^0-9.-]/g, ''));
      out = isNaN(n) ? null : n;
    }
    if (out !== (value ?? null)) onSave(out);
  }
  function handleKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setVal(value != null ? String(value) : ''); return; }
    if (e.key === 'Tab') {
      e.preventDefault(); commit();
      setTimeout(() => navigatePeerCellRight(cellId), 0);
    } else if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
      e.preventDefault(); commit();
      setTimeout(() => navigatePeerCellDown(cellId), 0);
    }
  }

  const display = numeric && value != null ? Number(value).toLocaleString() : (value ?? '');
  const field   = cellId?.split('||')[1];

  if (!editing) {
    return (
      <div
        data-peer-cell={cellId} data-peer-field={field}
        tabIndex={cellId ? 0 : -1}
        onFocus={start} onClick={start}
        className={`cursor-text min-h-[1.1rem] px-0.5 select-none rounded focus:outline-none focus:ring-1 focus:ring-amber-300 ${align === 'right' ? 'text-right' : ''} ${!display ? 'text-slate-300 text-[10px] italic' : ''} ${mono ? 'font-mono text-[10px]' : ''} ${className}`}>
        {display || placeholder}
      </div>
    );
  }
  if (multiline) {
    return (
      <textarea ref={ref} value={val} rows={4}
        onChange={e => setVal(e.target.value)}
        onBlur={commit} onKeyDown={handleKeyDown}
        className={`w-full min-w-[340px] border border-amber-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none leading-snug ${className}`}
      />
    );
  }
  return (
    <input ref={ref} value={val} type={numeric ? 'number' : 'text'} step={numeric ? 'any' : undefined}
      onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={handleKeyDown}
      className={`w-full border border-amber-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 ${align === 'right' ? 'text-right' : ''} ${mono ? 'font-mono' : ''} ${className}`}
    />
  );
}

function SelectCell({ value, options, placeholder, onSave, className = '' }) {
  return (
    <select value={value ?? ''} onChange={e => onSave(e.target.value || null)}
      className={`w-full border-0 bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-0.5 cursor-pointer ${!value ? 'text-slate-300 italic' : ''} ${className}`}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ── Tag Select cell ───────────────────────────────────────────────────────────

function TagSelect({ value, onSave }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const tag = LOCATION_TAGS.find(t => t.id === value);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer whitespace-nowrap ${tag ? TAG_COLORS[value] : 'bg-slate-100 text-slate-300 italic'}`}>
        {tag?.label || <span className="font-normal">Select…</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-36 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden py-1">
          {LOCATION_TAGS.map(t => (
            <button key={t.id} onClick={() => { onSave(t.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 ${value === t.id ? 'bg-slate-50' : ''}`}>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${TAG_COLORS[t.id]}`}>{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RFQ badge ─────────────────────────────────────────────────────────────────

function RfqBadge({ status }) {
  if (!status) return <span className="text-slate-300 text-[10px] italic">—</span>;
  const cls = {
    'Received':     'bg-green-100 text-green-700',
    'Budget Price': 'bg-amber-100 text-amber-700',
    'Pending':      'bg-slate-100 text-slate-500',
    'Needs Review': 'bg-red-100 text-red-600',
  }[status] || 'bg-slate-100 text-slate-500';
  return <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{status}</span>;
}

// ── Import Modal ──────────────────────────────────────────────────────────────

const SECTION_OPTIONS = LOCATION_TAGS;

function ImportModal({ projectId, onImported, onClose }) {
  const [step,      setStep]      = useState('upload'); // 'upload' | 'parsing' | 'preview' | 'importing'
  const [warning,   setWarning]   = useState(null);
  const [fixtures,  setFixtures]  = useState([]);
  const [fileName,  setFileName]  = useState('');
  const [dragging,  setDragging]  = useState(false);
  const [error,     setError]     = useState(null);
  const fileRef = useRef(null);

  async function parseFile(file) {
    if (!file || file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
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

  async function confirmImport() {
    if (fixtures.length === 0) return;
    setStep('importing');
    try {
      const res  = await fetch(`/api/projects/${projectId}/peer-review/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: fixtures }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      onImported(data.items);
      onClose();
    } catch (e) {
      setError(e.message);
      setStep('preview');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">Import Fixture Schedule</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {step === 'upload'   && 'Upload an electrical drawing PDF to extract the fixture schedule'}
              {step === 'parsing'  && `Analyzing "${fileName}" with AI…`}
              {step === 'preview'  && `${fixtures.length} fixture type${fixtures.length !== 1 ? 's' : ''} found in "${fileName}" — review and confirm`}
              {step === 'importing' && 'Importing…'}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* Upload step */}
          {(step === 'upload' || step === 'parsing') && (
            <div className="p-8 flex flex-col items-center gap-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`w-full max-w-lg border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
                  dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                } ${step === 'parsing' ? 'pointer-events-none opacity-60' : ''}`}
              >
                {step === 'parsing' ? (
                  <>
                    <svg className="animate-spin w-8 h-8 text-blue-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                    <p className="text-sm font-semibold text-slate-600">Extracting & parsing with AI…</p>
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
                      <p className="text-xs text-slate-400 mt-1">or click to browse · PDF only · Must be text-based (not scanned)</p>
                    </div>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
                  onChange={e => e.target.files[0] && parseFile(e.target.files[0])} />
              </div>
              {error && (
                <div className="w-full max-w-lg bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">{error}</div>
              )}
              <div className="w-full max-w-lg text-xs text-slate-400 space-y-1">
                <p className="font-semibold text-slate-500">Tips for best results:</p>
                <p>• Upload the E-sheet or electrical schedule sheet, not the full drawing set</p>
                <p>• Works with MEP fixture schedules (not interior design spec boards)</p>
                <p>• Image-based or scanned PDFs cannot be parsed — use a text-based export</p>
              </div>
            </div>
          )}

          {/* Preview step */}
          {(step === 'preview' || step === 'importing') && (
            <div className="p-4">
              {warning && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 flex gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  <span>{warning}</span>
                </div>
              )}

              {fixtures.length === 0 && (
                <div className="flex flex-col items-center gap-4 py-10">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  {!warning && <p className="text-sm text-slate-400">No fixture types were found in this PDF.</p>}
                  <button onClick={() => { setStep('upload'); setFixtures([]); setWarning(null); setError(null); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Try a Different PDF
                  </button>
                </div>
              )}

              {fixtures.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                    <tbody className="divide-y divide-slate-50">
                      {fixtures.map((f, idx) => (
                        <tr key={f._id} className={`${step === 'importing' ? 'opacity-50' : 'hover:bg-slate-50'}`}>
                          <td className="px-3 py-2 font-bold text-slate-800">{f.typeCode || '—'}</td>
                          <td className="px-3 py-2 text-slate-600 max-w-[16rem]">
                            <span title={f.description}>{f.description || '—'}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {f.manufacturer
                              ? <span className="text-slate-600">{f.manufacturer}</span>
                              : <span className="text-slate-300 italic">TBD</span>}
                          </td>
                          <td className="px-3 py-2 font-mono text-[10px] text-slate-500 max-w-[11rem] truncate" title={f.catalogNumber}>
                            {f.catalogNumber || <span className="text-slate-300 italic not-italic font-sans">TBD</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {f.watts != null ? f.watts : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={f.section}
                              onChange={e => updateSection(idx, e.target.value)}
                              disabled={step === 'importing'}
                              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                            >
                              {SECTION_OPTIONS.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => removeRow(idx)} disabled={step === 'importing'}
                              className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-0"
                              title="Remove this row">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {error && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">{error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between flex-shrink-0 bg-slate-50">
          <div className="text-xs text-slate-400">
            {step === 'preview' && fixtures.length > 0 && (
              <span>Review sections · remove unwanted rows · then import</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'preview' && (
              <button onClick={() => { setStep('upload'); setFixtures([]); setWarning(null); setError(null); }}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors">
                Try Another PDF
              </button>
            )}
            <button onClick={onClose} disabled={step === 'importing'}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors disabled:opacity-50">
              Cancel
            </button>
            {step === 'preview' && fixtures.length > 0 && (
              <button onClick={confirmImport}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Import {fixtures.length} Fixture{fixtures.length !== 1 ? 's' : ''}
              </button>
            )}
            {step === 'importing' && (
              <button disabled className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold opacity-70">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                Importing…
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Duplicate Bid button + modal ──────────────────────────────────────────────
function DuplicateBidButton({ projectId, currentVersion, onDuplicated }) {
  const [open,      setOpen]      = useState(false);
  const [name,      setName]      = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [err,       setErr]       = useState('');

  function openModal() {
    setName(currentVersion != null ? `Copy of v${currentVersion}` : 'Best Price Version');
    setErr('');
    setOpen(true);
  }

  async function duplicate() {
    setDuplicating(true); setErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}/design-bid-matrix/duplicate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceVersion: currentVersion ?? undefined, name: name.trim() }),
      });
      let data; try { data = await res.json(); } catch { data = {}; }
      if (!res.ok) { setErr(data.error || 'Duplicate failed'); setDuplicating(false); return; }
      onDuplicated?.(data.matrix);
      setOpen(false);
    } catch (e) {
      setErr(e.message || 'Network error');
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <>
      <button onClick={openModal}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors print:hidden">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
        </svg>
        Duplicate
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-semibold text-slate-800">Duplicate Budget Version</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Copies all items and pricing from {currentVersion != null ? `v${currentVersion}` : 'the current live budget'} into a new version you can edit independently
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Version Name *</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && duplicate()}
                  placeholder="e.g. Best Price Version, Alternate Spec"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">This becomes the version label in the version selector</p>
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={duplicate} disabled={duplicating || !name.trim()}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-60 transition-colors">
                  {duplicating ? 'Duplicating…' : 'Duplicate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Push to Ship Schedule button ──────────────────────────────────────────────
function PushToShipButton({ projectId }) {
  const [pushing, setPushing] = useState(false);
  const [result,  setResult]  = useState(null);
  const [err,     setErr]     = useState('');

  async function push() {
    setPushing(true); setErr(''); setResult(null);
    const res = await fetch(`/api/projects/${projectId}/ship-schedule/push`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || 'Push failed'); setPushing(false); return; }
    setResult(data);
    setPushing(false);
    setTimeout(() => setResult(null), 4000);
  }

  return (
    <div className="relative print:hidden">
      <button onClick={push} disabled={pushing}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-60">
        {pushing
          ? <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
          : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
        }
        {pushing ? 'Pushing…' : result ? `✓ +${result.added} upd:${result.updated}` : 'Push to Ship Schedule'}
      </button>
      {err && <div className="absolute top-full left-0 mt-1 z-20 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 whitespace-nowrap shadow-sm">{err}</div>}
    </div>
  );
}

// ── Manufacturer Popup ────────────────────────────────────────────────────────

function MfrPopup({ onCreated, onClose }) {
  const [name, setName]    = useState('');
  const [website, setWeb]  = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]      = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('Name required'); return; }
    setSaving(true);
    const res = await fetch('/api/manufacturers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), website: website.trim() || null }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || 'Failed'); setSaving(false); return; }
    onCreated(data.manufacturer);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-bold text-slate-900 mb-4">New Manufacturer</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Name *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Lithonia Lighting" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Website</label>
            <input value={website} onChange={e => setWeb(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="https://" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60">
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Product Popup ─────────────────────────────────────────────────────────────

function ProductPopup({ manufacturerId, manufacturerName, onCreated, onClose }) {
  const [partNumber, setPart]   = useState('');
  const [desc, setDesc]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!partNumber.trim()) { setErr('Part number required'); return; }
    setSaving(true);
    const res = await fetch(`/api/manufacturers/${manufacturerId}/products`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partNumber: partNumber.trim(), description: desc.trim() || null }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || 'Failed'); setSaving(false); return; }
    onCreated(data.product);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-bold text-slate-900 mb-1">New Part Number</h3>
        <p className="text-xs text-slate-400 mb-4">for {manufacturerName}</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Part Number *</label>
            <input autoFocus value={partNumber} onChange={e => setPart(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. 2GTL-48-L840-A" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Optional short description" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60">
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── MfrSelect cell ────────────────────────────────────────────────────────────

function MfrSelect({ item, manufacturers, onSelectMfr, onOpenCreate }) {
  const [open, setOpen]   = useState(false);
  const [q, setQ]         = useState('');
  const ref               = useRef(null);
  const selected          = manufacturers.find(m => m.id === item.propManufacturerId);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = manufacturers.filter(m => m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}
        className="cursor-pointer min-h-[1.1rem] px-0.5 text-blue-700 font-medium text-xs select-none truncate">
        {selected?.name || item.propManufacturer || <span className="text-slate-300 italic text-[10px]">Manufacturer</span>}
      </div>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Search manufacturers…" />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(m => (
              <button key={m.id} onClick={() => { onSelectMfr(m); setOpen(false); setQ(''); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 hover:text-blue-700 transition-colors">
                {m.name}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-slate-400 italic">No match</p>}
          </div>
          <div className="border-t border-slate-100 p-1.5">
            <button onClick={() => { setOpen(false); onOpenCreate(); }}
              className="w-full text-left px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-semibold">
              + New Manufacturer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProductSelect cell ────────────────────────────────────────────────────────

function ProductSelect({ item, manufacturers, onSelectProduct, onMfrProductAdded }) {
  const [open,     setOpen]     = useState(false);
  const [q,        setQ]        = useState('');
  const [creating, setCreating] = useState(false);
  const ref    = useRef(null);
  const inputRef = useRef(null);

  const mfr      = manufacturers.find(m => m.id === item.propManufacturerId);
  const products = mfr?.products || [];
  const selected = products.find(p => p.id === item.propProductId);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(''); } }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleOpen() {
    setOpen(true);
    setQ('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const filtered   = q ? products.filter(p =>
    p.partNumber.toLowerCase().includes(q.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(q.toLowerCase())
  ) : products;
  const exactMatch = products.find(p => p.partNumber.toLowerCase() === q.toLowerCase().trim());

  async function createInline() {
    if (!q.trim() || creating || !mfr) return;
    setCreating(true);
    const res  = await fetch(`/api/manufacturers/${mfr.id}/products`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partNumber: q.trim() }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      onMfrProductAdded(mfr.id, data.product);
      onSelectProduct(data.product);
      setOpen(false);
      setQ('');
    }
  }

  if (!mfr) {
    return <span className="text-slate-300 text-[10px] italic px-0.5">Select mfr first</span>;
  }

  return (
    <div ref={ref} className="relative">
      {!open ? (
        <div onClick={handleOpen}
          className="cursor-pointer min-h-[1.1rem] px-0.5 font-mono text-[10px] text-blue-700 select-none truncate">
          {selected?.partNumber || item.propModel || <span className="text-slate-300 italic font-sans text-[10px]">Catalog #</span>}
        </div>
      ) : (
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
          placeholder={selected?.partNumber || item.propModel || 'Type to search or create…'}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              if (exactMatch) { onSelectProduct(exactMatch); setOpen(false); setQ(''); }
              else if (filtered.length === 1) { onSelectProduct(filtered[0]); setOpen(false); setQ(''); }
              else if (q.trim() && filtered.length === 0) createInline();
            }
            if (e.key === 'Escape') { setOpen(false); setQ(''); }
          }}
          className="w-full border border-amber-300 rounded px-1.5 py-0.5 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
      )}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(p => (
              <button key={p.id} onClick={() => { onSelectProduct(p); setOpen(false); setQ(''); }}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-50 transition-colors">
                <span className="font-mono text-[10px] text-blue-700 font-semibold">{p.partNumber}</span>
                {p.description && <span className="text-[10px] text-slate-400 ml-2 truncate">{p.description}</span>}
              </button>
            ))}
            {filtered.length === 0 && q && (
              <p className="px-3 py-2 text-xs text-slate-400 italic">No match — press Enter to create</p>
            )}
            {filtered.length === 0 && !q && (
              <p className="px-3 py-2 text-xs text-slate-400 italic">No part numbers yet — start typing</p>
            )}
          </div>
          {q.trim() && !exactMatch && (
            <div className="border-t border-slate-100 p-1.5">
              <button onClick={createInline} disabled={creating}
                className="w-full text-left px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-semibold disabled:opacity-50">
                {creating ? 'Creating…' : `+ Create "${q.trim()}"`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Email Bid Popup ───────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = {
  initial: {
    label: 'Initial Bid Submittal',
    subject: (project) => `Lighting Budget – ${project.name}`,
    body: (project) =>
`Hi,

Please find attached our lighting budget for ${project.name}.

This bid reflects our proposed fixtures and pricing based on the current scope. Please review and let us know if you have any questions or would like to discuss alternates.

Best regards,
ILC Studios`,
  },
  followup: {
    label: 'Follow-Up',
    subject: (project) => `Follow-Up: Lighting Budget – ${project.name}`,
    body: (project) =>
`Hi,

I wanted to follow up on the lighting budget we submitted for ${project.name}. Have you had a chance to review it?

We're happy to walk through the pricing or discuss any value-engineering options.

Best regards,
ILC Studios`,
  },
  revised: {
    label: 'Revised Bid',
    subject: (project) => `Revised Lighting Budget – ${project.name}`,
    body: (project) =>
`Hi,

Please find attached a revised lighting budget for ${project.name} reflecting the latest scope and pricing updates.

Key changes from the previous submission are noted in the document. Please don't hesitate to reach out with any questions.

Best regards,
ILC Studios`,
  },
};

function EmailBidPopup({ project, onClose }) {
  const [templateKey, setTemplateKey] = useState('initial');
  const [to,          setTo]          = useState(project.client?.contactEmail || '');
  const [cc,          setCc]          = useState('');
  const [subject,     setSubject]     = useState(EMAIL_TEMPLATES.initial.subject(project));
  const [body,        setBody]        = useState(EMAIL_TEMPLATES.initial.body(project));
  const [copied,      setCopied]      = useState(false);

  function applyTemplate(key) {
    const t = EMAIL_TEMPLATES[key];
    setTemplateKey(key);
    setSubject(t.subject(project));
    setBody(t.body(project));
  }

  function openMailto() {
    // Fire-and-forget price history write on send
    fetch('/api/pricing/price-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id }),
    }).catch(() => {});

    const params = new URLSearchParams();
    if (cc) params.set('cc', cc);
    params.set('subject', subject);
    params.set('body', body);
    window.location.href = `mailto:${encodeURIComponent(to)}?${params.toString()}`;
  }

  function copyBody() {
    navigator.clipboard.writeText(`To: ${to}\nCC: ${cc}\nSubject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">Email Bid</h2>
            <p className="text-xs text-slate-400 mt-0.5">{project.name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Template picker */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Template:</span>
          {Object.entries(EMAIL_TEMPLATES).map(([key, t]) => (
            <button key={key} onClick={() => applyTemplate(key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${templateKey === key ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">To</label>
            <input value={to} onChange={e => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">CC</label>
            <input value={cc} onChange={e => setCc(e.target.value)}
              placeholder="cc@example.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
          <p className="text-[10px] text-slate-400">Tip: Print the Budget Matrix to PDF first, then attach it before sending.</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <button onClick={copyBody}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={openMailto}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              Open in Mail App
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// Which service types are auto-assigned DESIGN_BID
const DESIGN_BID_SERVICE_TYPES = new Set(['fullDesign', 'designAssist']);

export default function PeerReviewClient({ project, initialItems, currentUser, allUsers }) {
  // Full Design / Design Assist → Design Bid view by default
  // Peer Review / Bid Only → Budget Matrix view by default
  // Explicit peerReviewMatrixType in DB always wins (user's saved preference)
  const defaultMatrixType = project?.peerReviewMatrixType ||
    (DESIGN_BID_SERVICE_TYPES.has(project?.serviceType) ? 'DESIGN_BID' : 'PEER_REVIEW');
  const [matrixType, setMatrixType] = useState(defaultMatrixType);
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);
  const isDesignBid = matrixType === 'DESIGN_BID';

  async function switchMatrixType(newType) {
    setMatrixType(newType);
    setShowToggleConfirm(false);
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerReviewMatrixType: newType }),
    });
  }

  function handleToggleRequest() {
    const targetType = isDesignBid ? 'PEER_REVIEW' : 'DESIGN_BID';
    // Confirm if switching away from an auto-assigned DESIGN_BID project
    if (isDesignBid && DESIGN_BID_SERVICE_TYPES.has(project.serviceType)) {
      setShowToggleConfirm(true);
    } else {
      switchMatrixType(targetType);
    }
  }

  const [items,         setItems]         = useState(initialItems || []);
  const [saving,        setSaving]        = useState(false);
  const [activeSection, setActiveSection] = useState('all');
  const [deletingId,    setDeletingId]    = useState(null);
  const [showImport,    setShowImport]    = useState(false);
  const [grossSf,       setGrossSf]       = useState(project.projectData?.grossSf ?? null);
  const [numUnits,      setNumUnits]      = useState(project.projectData?.numUnits ?? null);
  const [manufacturers, setManufacturers] = useState([]);
  const [showSettings,  setShowSettings]  = useState(false);
  const [freightPct,    setFreightPct]    = useState(project.projectData?.freightPct     ?? 0.06);
  const [warehousingPct, setWarehousingPct] = useState(project.projectData?.warehousingPct ?? 0.03);
  const [salesTaxPct,   setSalesTaxPct]   = useState(project.projectData?.salesTaxPct   ?? null);
  const [marginPct,     setMarginPct]     = useState(project.projectData?.marginPct      ?? 0.23);
  const [showMfrPopup,  setShowMfrPopup]  = useState(false);
  const [mfrSearch,     setMfrSearch]     = useState('');
  const [sortKey,       setSortKey]       = useState('typeCode');
  const [sortDir,       setSortDir]       = useState('asc');
  const [dragItem,      setDragItem]      = useState(null);
  const [printLoading,  setPrintLoading]  = useState(false);
  const [dragOverId,    setDragOverId]    = useState(null);
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const qcStripRef = useRef(null);
  const [priceFlags,      setPriceFlags]      = useState({}); // { "MFR|PART": flag }
  const [retailCacheMap,  setRetailCacheMap]  = useState({}); // { "MFR|PART": cacheRecord }
  const [bidHistory,        setBidHistory]        = useState([]); // full DesignBidMatrix objects with items
  const [selectedBidVer,    setSelectedBidVer]    = useState(null); // null = live current
  const [renamingBudgetId,  setRenamingBudgetId]  = useState(null);
  const [budgetRenameInput, setBudgetRenameInput] = useState('');
  const [deleteBudgetConfirm, setDeleteBudgetConfirm] = useState(null); // { id, label }

  useEffect(() => {
    fetch('/api/manufacturers').then(r => r.json()).then(d => setManufacturers(d.manufacturers || []));
  }, []);

  // Load bid version history (full matrix objects with items)
  useEffect(() => {
    fetch(`/api/projects/${project.id}/design-bid-matrix`)
      .then(r => r.json())
      .then(d => { if (d.matrices) setBidHistory(d.matrices); })
      .catch(() => {});
  }, [project.id]);

  // ── Feature 1: Cross-project price increase check (non-blocking, fires after items load) ──
  useEffect(() => {
    if (!items.length || selectedBidVer) return; // only check live version
    const eligible = items.filter(i => i.propManufacturer && i.propModel && i.propUnitPrice);
    if (!eligible.length) return;

    const payload = eligible.map(i => ({
      manufacturer: i.propManufacturer,
      partNumber:   i.propModel,
      unitPrice:    i.propUnitPrice,
    }));

    fetch(`/api/pricing/price-check?projectId=${project.id}&items=${encodeURIComponent(JSON.stringify(payload))}`)
      .then(r => r.json())
      .then(d => {
        const map = {};
        (d.flags || []).forEach(f => {
          const key = `${(f.manufacturer||'').toLowerCase().trim()}|${(f.partNumber||'').toLowerCase().trim()}`;
          map[key] = f;
        });
        setPriceFlags(map);
      })
      .catch(() => {});
  }, [items, project.id, selectedBidVer]);

  // ── Feature 2: Retail cache fetch for Amenity items (background after items load) ──
  useEffect(() => {
    if (!items.length || selectedBidVer) return;
    const amenityItems = items.filter(i =>
      i.locationTag === 'Amenity' && i.propManufacturer && i.propModel
    );
    if (!amenityItems.length) return;

    const payload = amenityItems.map(i => ({ manufacturer: i.propManufacturer, partNumber: i.propModel }));

    fetch(`/api/pricing/retail-cache?items=${encodeURIComponent(JSON.stringify(payload))}`)
      .then(r => r.json())
      .then(d => {
        const map = {};
        (d.results || []).forEach(r => {
          const key = `${(r.manufacturer||'').toLowerCase().trim()}|${(r.partNumber||'').toLowerCase().trim()}`;
          map[key] = r;
        });
        setRetailCacheMap(map);
      })
      .catch(() => {});
  }, [items, project.id, selectedBidVer]);

  function getPriceKey(mfr, part) {
    return `${(mfr||'').toLowerCase().trim()}|${(part||'').toLowerCase().trim()}`;
  }

  async function refreshRetailCache(manufacturer, partNumber) {
    try {
      const res  = await fetch('/api/pricing/retail-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturer, partNumber, forceRefresh: true }),
      });
      const data = await res.json();
      if (data.cached) {
        const key = getPriceKey(manufacturer, partNumber);
        setRetailCacheMap(prev => ({
          ...prev,
          [key]: { ...data.cached, manufacturer, partNumber },
        }));
      }
    } catch {}
  }

  async function renameBudgetVersion(matrixId) {
    await fetch(`/api/projects/${project.id}/design-bid-matrix/${matrixId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionTag: budgetRenameInput }),
    });
    setBidHistory(prev => prev.map(m => m.id === matrixId ? { ...m, submissionTag: budgetRenameInput.trim() || null } : m));
    setRenamingBudgetId(null);
    setBudgetRenameInput('');
  }

  async function deleteBudgetVersion(matrixId) {
    await fetch(`/api/projects/${project.id}/design-bid-matrix/${matrixId}`, { method: 'DELETE' });
    setBidHistory(prev => prev.filter(m => m.id !== matrixId));
    if (selectedBidVer === matrixId) setSelectedBidVer(null);
    setDeleteBudgetConfirm(null);
  }

  // Freeze budget settings in DB on first open so they never drift with future code defaults
  useEffect(() => {
    const pd = project.projectData;
    const toSave = [];
    if (pd?.freightPct      == null) toSave.push(['freightPct',     6]);
    if (pd?.warehousingPct  == null) toSave.push(['warehousingPct', 3]);
    if (pd?.marginPct       == null) toSave.push(['marginPct',      23]);
    toSave.forEach(([field, val]) => {
      fetch(`/api/projects/${project.id}/data`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: val / 100 }),
      });
    });
  }, []);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async function addItem() {
    setSaving(true);
    const cnt = items.filter(i => i.section === activeSection).length;
    try {
      const res  = await fetch(`/api/projects/${project.id}/peer-review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: activeSection, sortOrder: cnt }),
      });
      const { item } = await res.json();
      setItems(prev => [...prev, item]);
    } finally {
      setSaving(false);
    }
  }

  async function addItemAfter(afterItem) {
    setSaving(true);

    // Get the current VISUAL order for this section (respects active sort)
    const sectionList = sortItems(items.filter(i => i.section === afterItem.section));
    const afterIdx    = sectionList.findIndex(i => i.id === afterItem.id);

    // Assign clean sequential sortOrders (0,2,4,...) so midpoints are always unique integers
    const normalized  = sectionList.map((it, idx) => ({ ...it, sortOrder: idx * 2 }));
    const newOrder    = afterIdx * 2 + 1; // slots exactly between afterIdx and afterIdx+1

    // Optimistically update existing items' sortOrders in state
    setItems(prev => prev.map(i => {
      const n = normalized.find(r => r.id === i.id);
      return n ? { ...i, sortOrder: n.sortOrder } : i;
    }));

    try {
      const res  = await fetch(`/api/projects/${project.id}/peer-review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'units', sortOrder: newOrder }),
      });
      const { item } = await res.json();

      // Insert new blank item directly after afterItem in state
      setItems(prev => {
        const copy = [...prev];
        const idx  = copy.findIndex(i => i.id === afterItem.id);
        copy.splice(idx + 1, 0, { ...item, section: '', typeCode: null, description: null });
        return copy;
      });

      // Persist normalized sortOrders in background
      Promise.all(normalized.map(it =>
        fetch(`/api/projects/${project.id}/peer-review/${it.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: it.sortOrder }),
        })
      ));
    } finally {
      setSaving(false);
    }
  }

  function handleDragStart(e, item) {
    setDragItem(item);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnter(e, id) {
    e.preventDefault();
    setDragOverId(id);
  }

  function handleDragEnd(groupItems) {
    if (!dragItem || !dragOverId || dragItem.id === dragOverId) {
      setDragItem(null); setDragOverId(null); return;
    }
    const fromIdx = groupItems.findIndex(i => i.id === dragItem.id);
    const toIdx   = groupItems.findIndex(i => i.id === dragOverId);
    if (fromIdx === -1 || toIdx === -1) { setDragItem(null); setDragOverId(null); return; }

    const reordered = [...groupItems];
    const [moved]   = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const withOrders = reordered.map((item, idx) => ({ ...item, sortOrder: idx }));

    setItems(prev => prev.map(i => {
      const updated = withOrders.find(w => w.id === i.id);
      return updated ?? i;
    }));
    setSortKey(null);

    Promise.all(withOrders.map(item =>
      fetch(`/api/projects/${project.id}/peer-review/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: item.sortOrder }),
      })
    ));

    setDragItem(null); setDragOverId(null);
  }

  async function deleteItem(id) {
    if (!confirm('Remove this fixture row?')) return;
    setDeletingId(id);
    setItems(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/projects/${project.id}/peer-review/${id}`, { method: 'DELETE' });
    setDeletingId(null);
  }

  async function patch(id, update) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...update } : i));
    await fetch(`/api/projects/${project.id}/peer-review/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
  }

  function handleQtyOrPrice(item, field, val) {
    const p = { [field]: val };
    const qty = field === 'qty'           ? val : item.qty;
    const cn  = field === 'propUnitPrice' ? val : item.propUnitPrice;
    if (qty != null && cn != null) p.totalSavings = r2(qty * cn);
    patch(item.id, p);
  }

  function handleDNChange(item, val) {
    const p = { propUnitDN: val };
    if (val != null && marginPct != null) {
      const factor = 1 - marginPct;
      if (factor > 0) {
        const cn = r2(val / factor);
        p.propUnitPrice = cn;
        if (item.qty != null) p.totalSavings = r2(item.qty * cn);
      }
    }
    patch(item.id, p);
  }

  // ── Project data patch ──────────────────────────────────────────────────────

  async function patchProjectData(field, val) {
    const parsed = val === null || val === '' ? null : parseFloat(String(val).replace(/[^0-9.]/g, ''));
    if (field === 'grossSf')  setGrossSf(isNaN(parsed) ? null : parsed);
    if (field === 'numUnits') setNumUnits(isNaN(parsed) ? null : parsed);
    await fetch(`/api/projects/${project.id}/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: isNaN(parsed) ? null : parsed }),
    });
  }

  async function patchProjectDataPct(field, val) {
    const parsed = val === null || val === '' ? null : parseFloat(String(val).replace(/[^0-9.]/g, '')) / 100;
    await fetch(`/api/projects/${project.id}/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: isNaN(parsed) ? null : parsed }),
    });
  }

  // ── Manufacturer / Product handlers ─────────────────────────────────────────

  function handleSelectMfr(item, mfr) {
    patch(item.id, { propManufacturer: mfr.name, propManufacturerId: mfr.id, propModel: null, propProductId: null });
  }
  function handleSelectProduct(item, product) {
    patch(item.id, { propModel: product.partNumber, propProductId: product.id });
  }
  function handleMfrCreated(mfr) {
    setManufacturers(prev => [...prev, { ...mfr, products: [] }].sort((a, b) => a.name.localeCompare(b.name)));
    setShowMfrPopup(false);
  }
  function handleMfrProductAdded(manufacturerId, product) {
    setManufacturers(prev => prev.map(m => m.id === manufacturerId
      ? { ...m, products: [...(m.products || []), product].sort((a, b) => a.partNumber.localeCompare(b.partNumber)) }
      : m
    ));
  }

  // ── Excel Export ────────────────────────────────────────────────────────────

  async function exportToExcel() {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const headers = [
      'Type', 'Description', 'Location Tag', 'Qty', 'Qty Type',
      ...(isDesignBid ? [] : ['Spec Manufacturer', 'Spec Model', 'Spec Details']),
      isDesignBid ? 'Manufacturer' : 'Prop. Manufacturer',
      isDesignBid ? 'Part #'       : 'Prop. Spec',
      'Sales Rep', 'RFQ Status',
      'DN $/unit', 'CN $/unit', 'CN Total', 'Notes', 'Internal Notes',
    ];

    // Lighting rows first, then controls
    const orderedItems = [
      ...items.filter(i => i.section !== 'controls'),
      ...items.filter(i => i.section === 'controls'),
    ];

    const rows = orderedItems.map(item => ({
      'Type':               item.typeCode || '',
      'Description':        item.description || '',
      'Location Tag':       LOCATION_TAGS.find(s => s.id === item.section)?.label || item.section,
      'Qty':                item.qty ?? '',
      'Qty Type':           item.qtyType === 'linearFt' ? 'Linear Ft' : item.qtyType ? 'Unit' : '',
      ...(isDesignBid ? {} : {
        'Spec Manufacturer': item.specManufacturer || '',
        'Spec Model':        item.specModel || '',
        'Spec Details':      item.specDetails || '',
      }),
      [isDesignBid ? 'Manufacturer' : 'Prop. Manufacturer']: item.propManufacturer || '',
      [isDesignBid ? 'Part #'       : 'Prop. Spec']:          item.propModel || '',
      'Sales Rep':          item.repName || '',
      'RFQ Status':         item.rfqStatus || '',
      'DN $/unit':          item.propUnitDN ?? '',
      'CN $/unit':          item.propUnitPrice ?? '',
      'CN Total':           item.totalSavings ?? '',
      'Notes':              item.notes || '',
      'Internal Notes':     item.internalNotes || '',
    }));

    // Add summary rows
    rows.push({});
    rows.push({ 'Type': 'CN Subtotal — Lighting', 'CN Total': rawLighting });
    rows.push({ 'Type': 'CN Subtotal — Controls', 'CN Total': rawControls });
    if (freightAmt > 0) rows.push({ 'Type': `Freight (${(freightPctVal*100).toFixed(0)}%)`, 'CN Total': freightAmt });
    if (warehousingAmt > 0) rows.push({ 'Type': `Warehousing (${(warehousingPctVal*100).toFixed(0)}%)`, 'CN Total': warehousingAmt });
    if (salesTaxAmt > 0) rows.push({ 'Type': `Sales Tax (${(salesTaxPctVal*100).toFixed(2)}%)`, 'CN Total': salesTaxAmt });
    rows.push({ 'Type': 'Subtotal Lighting (loaded)', 'CN Total': subtotalLighting });
    rows.push({ 'Type': 'Subtotal Controls (loaded)', 'CN Total': subtotalControls });
    rows.push({ 'Type': 'GRAND TOTAL', 'CN Total': grandTotal });

    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

    // Column widths
    ws['!cols'] = [
      { wch: 8 }, { wch: 40 }, { wch: 18 }, { wch: 6 }, { wch: 10 },
      { wch: 22 }, { wch: 22 }, { wch: 16 },
      { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 30 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Budget Matrix');
    const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    XLSX.writeFile(wb, `Budget Matrix – ${safeName}.xlsx`);
  }

  // ── Sort ────────────────────────────────────────────────────────────────────

  function sortItems(list) {
    if (sortKey === null) {
      return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return [...list].sort((a, b) => {
      let av, bv;
      if (sortKey === 'section') {
        av = LOCATION_TAGS.find(t => t.id === a.section)?.label ?? a.section ?? '';
        bv = LOCATION_TAGS.find(t => t.id === b.section)?.label ?? b.section ?? '';
      } else if (sortKey === 'totalSavings' || sortKey === 'qty' || sortKey === 'propUnitPrice' || sortKey === 'propUnitDN') {
        av = a[sortKey] ?? -Infinity;
        bv = b[sortKey] ?? -Infinity;
        return sortDir === 'asc' ? av - bv : bv - av;
      } else {
        av = a[sortKey] ?? '';
        bv = b[sortKey] ?? '';
      }
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  // ── Totals ──────────────────────────────────────────────────────────────────

  const sectionItems = activeSection === 'all' ? items : items.filter(i => i.section === activeSection);
  const activeSec    = LOCATION_TAGS.find(s => s.id === activeSection);

  const lightingItems  = items.filter(i => i.section !== 'controls');
  const controlsItems  = items.filter(i => i.section === 'controls');

  // Raw CN sums — round the sum of already-rounded per-row totals
  const rawLighting = r2(lightingItems.reduce((s, i) => s + (i.totalSavings || 0), 0));
  const rawControls = r2(controlsItems.reduce((s, i) => s + (i.totalSavings || 0), 0));
  const rawTotal    = r2(rawLighting + rawControls);

  // Adder rates
  const freightPctVal     = freightPct     ?? 0.06;
  const warehousingPctVal = warehousingPct ?? 0.03;
  const salesTaxPctVal    = salesTaxPct    ?? 0;

  // Adder amounts — each rounded independently before summing
  const freightAmt     = r2(rawTotal * freightPctVal);
  const warehousingAmt = r2(rawTotal * warehousingPctVal);
  const salesTaxAmt    = r2(rawTotal * salesTaxPctVal);
  const totalAdders    = r2(freightAmt + warehousingAmt + salesTaxAmt);

  // Loaded subtotals — apply adders proportionally, each rounded
  const subtotalLighting = r2(rawLighting + r2(rawLighting * (freightPctVal + warehousingPctVal + salesTaxPctVal)));
  const subtotalControls = r2(rawControls + r2(rawControls * (freightPctVal + warehousingPctVal + salesTaxPctVal)));
  const grandTotal       = r2(rawTotal + totalAdders);

  const grandDNTotal  = r2(items.reduce((s, i) => s + ((i.qty || 0) * (i.propUnitDN || 0)), 0));

  const dollarPerSf   = grossSf  && grandTotal ? grandTotal / grossSf  : null;
  const dollarPerUnit = numUnits && grandTotal ? grandTotal / numUnits  : null;

  const sectionTotals = Object.fromEntries(LOCATION_TAGS.map(s => [
    s.id,
    r2(items.filter(i => i.section === s.id).reduce((sum, i) => sum + (i.totalSavings || 0), 0)),
  ]));

  const secTotal   = r2(sectionItems.reduce((s, i) => s + (i.totalSavings || 0), 0));
  const secDNTotal = r2(sectionItems.reduce((s, i) => s + ((i.qty || 0) * (i.propUnitDN || 0)), 0));

  // ── Render ───────────────────────────────────────────────────────────────────

  function handleImported(newItems) {
    setItems(newItems);
    // Switch to the section with the most newly-imported rows
    const counts = {};
    for (const item of newItems) counts[item.section] = (counts[item.section] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) setActiveSection(top[0]);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @media print {
          html, body { overflow: visible !important; height: auto !important; min-height: 0 !important; }
          * { overflow: visible !important; }
          .print\\:hidden { display: none !important; }
          .print-only { display: block !important; }
          body { background: white; margin: 0; }
          @page { size: landscape; margin: 0; }
          .print-only { padding: 0.4in 0.6in 0.4in 0.45in; }
          .pm-table { border-collapse: collapse; width: 100%; font-size: 7.5pt; font-family: Arial, Helvetica, sans-serif; }
          .pm-table th, .pm-table td { border: 1px solid #d0d0d0; padding: 3px 6px; vertical-align: top; }
          .pm-table thead tr { border-bottom: 2px solid #555; }
          .pm-table th { background: #f5f5f5; color: #231f20; font-size: 7pt; font-weight: 700; letter-spacing: 0.03em; white-space: nowrap; }
          .pm-sec-hdr td  { background: #fff8f0 !important; font-weight: 700; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.1em; color: #c0621a; border-top: 1.5px solid #F7941D !important; border-bottom: 1px solid #F7941D !important; }
          .pm-ctrl-hdr td { background: #faf0ff !important; font-weight: 700; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.1em; color: #5b21b6; border-top: 1.5px solid #9333ea !important; border-bottom: 1px solid #9333ea !important; }
          .pm-sub td  { background: #f5f5f5 !important; font-weight: 700; border-top: 1px solid #aaa !important; }
          .pm-even td { background: #fafafa; }
          .pm-odd  td { background: #ffffff; }
          .pm-info-table { border-collapse: collapse; font-size: 8.5pt; font-family: Arial, Helvetica, sans-serif; }
          .pm-info-table td { padding: 3px 8px 3px 0; vertical-align: top; border-bottom: 1px solid #d0d0d0; color: #231f20; }
          .pm-info-table .lbl { font-weight: 700; font-size: 7.5pt; white-space: nowrap; padding-right: 16px; }
          .pm-totals-table { border-collapse: collapse; width: 260px; font-size: 8.5pt; font-family: Arial, Helvetica, sans-serif; }
          .pm-totals-table td { padding: 3px 6px; border-bottom: 1px solid #d0d0d0; color: #231f20; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>

      {showMfrPopup && (
        <MfrPopup
          onCreated={handleMfrCreated}
          onClose={() => setShowMfrPopup(false)}
        />
      )}
      {showImport && (
        <ImportModal
          projectId={project.id}
          onImported={handleImported}
          onClose={() => setShowImport(false)}
        />
      )}

      {showEmailPopup && (
        <EmailBidPopup
          project={project}
          onClose={() => setShowEmailPopup(false)}
        />
      )}

      {/* ── Matrix type switch confirmation ── */}
      {showToggleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-slate-900 mb-2">Switch to Peer Review view?</h3>
            <p className="text-sm text-slate-600 mb-4">
              This project was set up as a <strong>Design Bid</strong> matrix based on its service type.
              Switching to Peer Review view will show the Spec columns and hide the Design Bid layout.
              No data will be deleted — you can switch back at any time.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowToggleConfirm(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => switchMatrixType('PEER_REVIEW')}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                Switch to Peer Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="print:hidden bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href={`/project/${project.id}`} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isDesignBid ? '#7c3aed' : '#2563eb' }}>
                {isDesignBid ? 'Design Bid Matrix' : 'Budget Matrix'}
              </span>
              {/* Version selector — matches Fixture Schedule pattern */}
              {bidHistory.length > 0 && (
                <select
                  value={selectedBidVer ?? 'live'}
                  onChange={e => setSelectedBidVer(e.target.value === 'live' ? null : e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="live">Current (live)</option>
                  {bidHistory.map(m => {
                    const fmtDate = new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const change = (() => { try { return JSON.parse(m.changeSummary || '{}'); } catch { return {}; } })();
                    const diff = [
                      change.added?.length > 0   ? `+${change.added.length}`   : '',
                      change.removed?.length > 0 ? `-${change.removed.length}` : '',
                    ].filter(Boolean).join(' ');
                    return (
                      <option key={m.id} value={m.id}>
                        v{m.version} · {fmtDate}{m.submissionTag ? ` · ${m.submissionTag}` : ''}{diff ? ` (${diff})` : ''}
                      </option>
                    );
                  })}
                </select>
              )}
              {selectedBidVer && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                  Read-only snapshot
                </span>
              )}

              {/* Rename / delete controls for selected budget version */}
              {selectedBidVer && (
                renamingBudgetId === selectedBidVer ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={budgetRenameInput}
                      onChange={e => setBudgetRenameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameBudgetVersion(selectedBidVer); if (e.key === 'Escape') { setRenamingBudgetId(null); setBudgetRenameInput(''); } }}
                      placeholder="Label (optional)"
                      className="text-xs border border-blue-300 rounded-md px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <button onClick={() => renameBudgetVersion(selectedBidVer)} className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">Save</button>
                    <button onClick={() => { setRenamingBudgetId(null); setBudgetRenameInput(''); }} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { const m = bidHistory.find(x => x.id === selectedBidVer); setRenamingBudgetId(selectedBidVer); setBudgetRenameInput(m?.submissionTag || ''); }}
                      title="Rename this version"
                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => { const m = bidHistory.find(x => x.id === selectedBidVer); setDeleteBudgetConfirm({ id: selectedBidVer, label: `v${m?.version}${m?.submissionTag ? ` · ${m.submissionTag}` : ''}` }); }}
                      title="Delete this version"
                      className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )
              )}
              <span className="text-slate-300">·</span>
              <span className="text-sm font-semibold text-slate-900">{project.name}</span>
            </div>
            <p className="text-[10px] text-slate-400">
              {selectedBidVer ? 'Read-only snapshot — select "Current (live)" to edit' : 'Click any cell to edit · Tab to advance'}
              {!selectedBidVer && bidHistory.length > 0 && ` · ${bidHistory.length} version${bidHistory.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saving && (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              Saving…
            </div>
          )}
          {/* Push to Ship Schedule */}
          <PushToShipButton projectId={project.id} />
          {/* Duplicate bid */}
          <DuplicateBidButton projectId={project.id} currentVersion={selectedBidVer ? bidHistory.find(m => m.id === selectedBidVer)?.version : null} onDuplicated={m => setBidHistory(prev => [m, ...prev])} />
          {/* Export Excel */}
          <button onClick={exportToExcel} disabled={items.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors print:hidden disabled:opacity-40 disabled:cursor-not-allowed">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export Excel
          </button>
          {/* Email Bid */}
          <button onClick={async () => {
            const ok = await qcStripRef.current?.checkCanSend();
            if (ok !== false) setShowEmailPopup(true);
          }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors print:hidden">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            Email Bid
          </button>
          {/* Print */}
          <button onClick={async () => {
            const ok = await qcStripRef.current?.checkCanSend();
            if (ok !== false) {
              setPrintLoading(true);
              try {
                const res = await fetch(`/api/projects/${project.id}/peer-review/pdf`);
                if (!res.ok) throw new Error(await res.text());
                const blob = await res.blob();
                window.open(URL.createObjectURL(blob), '_blank');
              } catch (e) {
                alert('PDF generation failed: ' + e.message);
              } finally {
                setPrintLoading(false);
              }
            }
          }}
            disabled={printLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-60">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            {printLoading ? 'Generating…' : 'Print'}
          </button>
          {/* Budget Settings */}
          <button onClick={() => setShowSettings(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${showSettings ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Budget Settings
          </button>
          {/* Matrix type toggle — far right */}
          <button
            onClick={handleToggleRequest}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors print:hidden"
            style={isDesignBid
              ? { borderColor: '#7c3aed', backgroundColor: '#f5f3ff', color: '#6d28d9' }
              : { borderColor: '#2563eb', backgroundColor: '#eff6ff', color: '#1d4ed8' }
            }
            title="Switch between Budget Matrix and Design Bid view"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            {isDesignBid ? 'Design Bid view' : 'Budget Matrix view'}
          </button>
        </div>
      </div>

      {/* ── Budget QC Strip ── */}
      <BudgetQCStrip
        ref={qcStripRef}
        projectId={project.id}
        projectName={project.name}
        phase={project.phase}
        currentUserId={currentUser?.id}
        currentUserRole={currentUser?.role}
        allUsers={allUsers ?? []}
      />

      <div className="print:hidden px-6 pt-6 pb-5">

        {/* ── Summary widgets ── */}
        <div className="grid grid-cols-7 gap-3 mb-5">

          {/* Gross SF — editable */}
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-3">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Gross SF</div>
            <Cell value={grossSf} placeholder="—" numeric
              onSave={v => patchProjectData('grossSf', v)}
              className="text-lg font-bold text-slate-700 w-full" />
          </div>

          {/* # Units — editable */}
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-3">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1"># of Units</div>
            <Cell value={numUnits} placeholder="—" numeric
              onSave={v => patchProjectData('numUnits', v)}
              className="text-lg font-bold text-slate-700 w-full" />
          </div>

          {/* Lighting subtotal */}
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-3">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Subtotal Lighting</div>
            <div className="text-lg font-bold text-slate-700">{rawLighting > 0 ? fmt(rawLighting) : '—'}</div>
            <div className="text-[9px] text-slate-400 mt-0.5">{lightingItems.length} types</div>
          </div>

          {/* Controls subtotal */}
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-3">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Subtotal Controls</div>
            <div className="text-lg font-bold text-violet-700">{rawControls > 0 ? fmt(rawControls) : '—'}</div>
            <div className="text-[9px] text-slate-400 mt-0.5">{controlsItems.length} types</div>
          </div>

          {/* Grand total */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl px-3 py-3 text-white">
            <div className="text-[9px] font-bold uppercase tracking-wider opacity-80 mb-1">Grand Total</div>
            <div className="text-lg font-bold">{grandTotal > 0 ? fmt(grandTotal) : '—'}</div>
            <div className="text-[9px] opacity-70 mt-0.5">incl. tax · freight · ware</div>
          </div>

          {/* $/SF */}
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-3">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">$/SF</div>
            <div className="text-lg font-bold text-slate-700">
              {dollarPerSf != null
                ? '$' + dollarPerSf.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : <span className="text-slate-300 text-sm">—</span>}
            </div>
            {!grossSf && <div className="text-[9px] text-slate-300 mt-0.5">Enter SF above</div>}
          </div>

          {/* $/Unit */}
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-3">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">$/Unit</div>
            <div className="text-lg font-bold text-slate-700">
              {dollarPerUnit != null
                ? '$' + dollarPerUnit.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                : <span className="text-slate-300 text-sm">—</span>}
            </div>
            {!numUnits && <div className="text-[9px] text-slate-300 mt-0.5">Enter units above</div>}
          </div>

        </div>

        {/* ── Settings panel ── */}
        {showSettings && (
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 mb-4">
            <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">Budget Settings</h3>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Freight %', val: freightPct, set: setFreightPct, field: 'freightPct', def: 6 },
                { label: 'Warehousing %', val: warehousingPct, set: setWarehousingPct, field: 'warehousingPct', def: 3 },
                { label: 'Sales Tax %', val: salesTaxPct, set: setSalesTaxPct, field: 'salesTaxPct', def: null },
                { label: 'Margin %', val: marginPct, set: setMarginPct, field: 'marginPct', def: 23 },
              ].map(({ label, val, set, field, def }) => (
                <div key={field}>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
                  <div className="flex items-center gap-1">
                    <Cell value={val != null ? Math.round(val * 100 * 100) / 100 : (def ?? '')}
                      placeholder={def != null ? String(def) : '—'} numeric
                      onSave={v => { patchProjectDataPct(field, v); }}
                      className="w-full text-sm font-semibold text-slate-700" />
                    <span className="text-slate-400 text-sm">%</span>
                  </div>
                  {def != null && <div className="text-[9px] text-slate-400 mt-0.5">Default: {def}%</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Historical version view (read-only snapshot) ── */}
        {selectedBidVer && (() => {
          const matrix = bidHistory.find(m => m.id === selectedBidVer);
          if (!matrix) return null;
          const change = (() => { try { return JSON.parse(matrix.changeSummary || '{}'); } catch { return {}; } })();
          const addedTypes   = new Set((change.added   || []).map(i => i.type));
          const removedTypes = new Set((change.removed || []).map(i => i.type));
          const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const fmt = v => v != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v) : '—';

          return (
            <div className="mb-6 space-y-3">
              {/* Version header */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-800 text-white">v{matrix.version}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700">
                    Pushed {fmtDate(matrix.createdAt)}{matrix.submissionTag ? ` · ${matrix.submissionTag}` : ''}
                  </p>
                  {(change.added?.length > 0 || change.removed?.length > 0) && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {change.added?.length > 0 && <span className="text-green-600 font-semibold">+{change.added.length} added </span>}
                      {change.removed?.length > 0 && <span className="text-red-500 font-semibold">−{change.removed.length} removed</span>}
                      {' '}from previous version
                    </p>
                  )}
                </div>
                <button onClick={() => setSelectedBidVer(null)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition-colors font-semibold">
                  Back to current
                </button>
              </div>

              {/* Historical table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                <table className="min-w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['Type', 'Description', 'Location', 'Manufacturer', 'Part #', 'Qty', 'DN $/Unit', 'CN $/Unit', 'CN Total', 'Notes'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(matrix.items || []).map((item, idx) => {
                      const isNew     = addedTypes.has(item.type);
                      const isRemoved = removedTypes.has(item.type);
                      return (
                        <tr key={item.id}
                          className={`border-b last:border-0 ${isNew ? 'bg-green-50' : isRemoved ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                          <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
                            {item.type}
                            {isNew && <span className="ml-1.5 text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">NEW</span>}
                            {isRemoved && <span className="ml-1.5 text-[9px] font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">REMOVED</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-[200px]">{item.description || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{item.locationTag || '—'}</td>
                          <td className="px-3 py-2 text-blue-700 font-medium">{item.manufacturer || '—'}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{item.partNumber || '—'}</td>
                          <td className="px-3 py-2 text-slate-600 text-right">{item.qty ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 text-right">{item.dnPerUnit != null ? fmt(item.dnPerUnit) : '—'}</td>
                          <td className="px-3 py-2 text-blue-600 font-semibold text-right">
                            <span className="inline-flex items-center gap-1.5 justify-end">
                              {item.cnPerUnit != null ? fmt(item.cnPerUnit) : '—'}
                              <PriceAlertBadge flag={priceFlags[getPriceKey(item.propManufacturer, item.propModel)]} />
                              {item.locationTag === 'Amenity' && (
                                <RetailPriceDot
                                  cache={retailCacheMap[getPriceKey(item.propManufacturer, item.propModel)]}
                                  unitPrice={item.cnPerUnit}
                                  manufacturer={item.propManufacturer}
                                  partNumber={item.propModel}
                                  onRefresh={() => refreshRetailCache(item.propManufacturer, item.propModel)}
                                />
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-bold text-blue-700 text-right">{item.cnTotal != null ? fmt(item.cnTotal) : item.cnPerUnit != null && item.qty != null ? fmt(item.cnPerUnit * item.qty) : '—'}</td>
                          <td className="px-3 py-2 text-slate-400 max-w-[120px] truncate">{item.notes || '—'}</td>
                        </tr>
                      );
                    })}
                    {(matrix.items || []).length === 0 && (
                      <tr><td colSpan={10} className="py-8 text-center text-sm text-slate-400">No items in this version</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Pricing Summary — always uses live budget rates & totals ── */}
              <div className="mt-4 flex justify-end">
                <div className="w-80 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pricing Summary</p>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="px-4 py-2 text-slate-600">CN Subtotal — Lighting</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-slate-700">{rawLighting > 0 ? fmt(rawLighting) : '—'}</td>
                      </tr>
                      {rawControls > 0 && (
                        <tr className="border-b border-slate-100">
                          <td className="px-4 py-2 text-violet-600">CN Subtotal — Controls</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold text-violet-600">{fmt(rawControls)}</td>
                        </tr>
                      )}
                      {freightAmt > 0 && (
                        <tr className="border-b border-slate-50">
                          <td className="px-4 py-1.5 text-slate-400 text-xs">Freight ({freightPctVal > 0 ? `${(freightPctVal*100).toFixed(0)}%` : ''})</td>
                          <td className="px-4 py-1.5 text-right font-mono text-xs text-slate-400">{fmt(freightAmt)}</td>
                        </tr>
                      )}
                      {warehousingAmt > 0 && (
                        <tr className="border-b border-slate-50">
                          <td className="px-4 py-1.5 text-slate-400 text-xs">Warehousing ({warehousingPctVal > 0 ? `${(warehousingPctVal*100).toFixed(0)}%` : ''})</td>
                          <td className="px-4 py-1.5 text-right font-mono text-xs text-slate-400">{fmt(warehousingAmt)}</td>
                        </tr>
                      )}
                      {salesTaxAmt > 0 && (
                        <tr className="border-b border-slate-100">
                          <td className="px-4 py-1.5 text-slate-400 text-xs">Sales Tax ({salesTaxPctVal > 0 ? `${(salesTaxPctVal*100).toFixed(2)}%` : '0%'})</td>
                          <td className="px-4 py-1.5 text-right font-mono text-xs text-slate-400">{fmt(salesTaxAmt)}</td>
                        </tr>
                      )}
                      <tr className="border-b border-slate-100">
                        <td className="px-4 py-2 text-slate-700 font-semibold">Subtotal Lighting (loaded)</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-slate-700">{subtotalLighting > 0 ? fmt(subtotalLighting) : '—'}</td>
                      </tr>
                      {rawControls > 0 && (
                        <tr className="border-b border-slate-200">
                          <td className="px-4 py-2 text-violet-700 font-semibold">Subtotal Controls (loaded)</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold text-violet-700">{fmt(subtotalControls)}</td>
                        </tr>
                      )}
                      <tr className="bg-blue-600 text-white">
                        <td className="px-4 py-3 font-bold">Grand Total</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">{fmt(grandTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Live view: location tabs + matrix (hidden when viewing a historical version) ── */}
        {!selectedBidVer && <><div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setActiveSection('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeSection === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}>
            All
            {items.length > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeSection === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {items.length}
              </span>
            )}
          </button>
          {LOCATION_TAGS.map(s => {
            const cnt      = items.filter(i => i.section === s.id).length;
            if (cnt === 0) return null;
            const tot      = sectionTotals[s.id];
            const isActive = s.id === activeSection;
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  isActive ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}>
                <span className={`w-2 h-2 rounded-full ${TAG_ACTIVE[s.id] || 'bg-slate-400'}`} />
                {s.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? 'bg-white/20 text-white' : TAG_COLORS[s.id]}`}>
                  {cnt}
                </span>
                {tot > 0 && <span className={`text-[10px] ${isActive ? 'opacity-70' : 'text-blue-600 font-semibold'}`}>{fmt(tot)}</span>}
              </button>
            );
          })}
        </div>

        {/* ── Matrix table ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-xs" style={{ minWidth: '1440px' }}>
              <thead>
                {/* Column labels */}
                <tr className="border-b-2 border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {/* Drag handle + add-below column */}
                  <th className=" w-14 bg-slate-50 px-2 py-2"></th>
                  {[
                    { key: 'typeCode',      label: 'Type',           cls: 'w-20 text-left'                        },
                    { key: 'description',   label: 'Description',    cls: 'w-[42rem] text-left'                   },
                    ...(activeSection === 'all' ? [{ key: 'section', label: 'Location Tag', cls: 'w-[4.2rem] text-left' }] : []),
                    ...(!isDesignBid ? [
                      { key: null, label: 'Spec Mfr',     cls: 'w-32 text-left'                        },
                      { key: null, label: 'Spec #',       cls: 'w-36 text-left'                        },
                      { key: null, label: 'Spec Details', cls: 'w-28 text-left border-r border-slate-200' },
                    ] : []),
                    { key: 'propManufacturer', label: isDesignBid ? 'Manufacturer' : 'Prop. Mfr',  cls: 'w-32 text-left text-blue-600' },
                    { key: 'propModel',        label: isDesignBid ? 'Part #'       : 'Prop. Spec', cls: 'w-[10.8rem] text-left text-blue-600' },
                    { key: null,            label: 'Sales Rep',      cls: 'w-32 text-left text-blue-600'          },
                    { key: null,            label: 'RFQ Status',     cls: 'w-28 text-left border-r border-slate-200' },
                    { key: 'qty',           label: 'Qty',            cls: 'w-10 text-right'                       },
                    { key: null,            label: 'Qty Type',       cls: 'w-20 text-left border-r border-slate-200' },
                    { key: 'propUnitDN',    label: 'DN $/unit',      cls: 'w-20 text-right'                       },
                    { key: null,            label: 'CN $/unit',      cls: 'w-20 text-right'                       },
                    { key: 'totalSavings',  label: 'CN Total',       cls: 'w-28 text-right font-bold border-r border-slate-200' },
                    { key: null,            label: 'Notes',          cls: 'w-40 text-left'                        },
                    { key: null,            label: 'Internal Notes', cls: 'w-40 text-left text-amber-700 bg-amber-50' },
                  ].map(col => (
                    <th key={col.label} className={` px-3 py-2 bg-slate-50 ${col.cls} ${col.key ? 'cursor-pointer select-none hover:text-slate-700' : ''}`}
                      onClick={col.key ? () => handleSort(col.key) : undefined}>
                      <span className="inline-flex items-center gap-0.5">
                        {col.label}
                        {col.key && sortKey === col.key && (
                          <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={sortDir === 'asc' ? 'M4.5 15.75l7.5-7.5 7.5 7.5' : 'M19.5 8.25l-7.5 7.5-7.5-7.5'} />
                          </svg>
                        )}
                        {col.key && sortKey !== col.key && (
                          <svg className="w-3 h-3 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
                          </svg>
                        )}
                      </span>
                    </th>
                  ))}
                  <th className=" w-10 bg-slate-50"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">

                {sectionItems.length === 0 && (
                  <tr>
                    <td colSpan={activeSection === 'all' ? 19 : 18} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-400">
                            {activeSection === 'all' ? 'No fixtures yet' : `No fixtures in ${activeSec?.label}`}
                          </p>
                          <p className="text-xs text-slate-300 mt-0.5">Use the + button on any row to add fixtures</p>
                        </div>
                        <button onClick={addItem} disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Add Row
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {(() => {
                  // In All view: render lighting group first, then controls group with separator
                  const groups = activeSection === 'all'
                    ? [
                        { items: sortItems(sectionItems.filter(i => i.section !== 'controls')), isControls: false },
                        { items: sortItems(sectionItems.filter(i => i.section === 'controls')),  isControls: true  },
                      ]
                    : [{ items: sortItems(sectionItems), isControls: activeSection === 'controls' }];

                  const colCount = activeSection === 'all' ? 19 : 18;

                  return groups.map(({ items: groupItems, isControls }, gi) => {

                    const groupDNTotal = r2(groupItems.reduce((s, i) => s + ((i.qty || 0) * (i.propUnitDN || 0)), 0));
                    const groupTotal   = r2(groupItems.reduce((s, i) => s + (i.totalSavings || 0), 0));

                    return (
                      <>
                        {/* Controls separator — always visible in All view */}
                        {activeSection === 'all' && isControls && (
                          <tr key="controls-separator" className="border-t-2 border-violet-200">
                            <td colSpan={colCount} className="px-3 py-2 bg-violet-50">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">Controls</span>
                                {rawControls > 0 && (
                                  <span className="text-[10px] text-violet-500 font-semibold">{fmt(rawControls)}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Empty controls placeholder */}
                        {isControls && groupItems.length === 0 && (
                          <tr key="controls-empty" className="bg-violet-50/30">
                            <td colSpan={colCount} className="px-4 py-3 text-center">
                              <button onClick={() => { setActiveSection('controls'); addItem(); }}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Add controls row
                              </button>
                            </td>
                          </tr>
                        )}


                        {groupItems.map(item => {
                          const cnTotal    = item.qty != null && item.propUnitPrice != null ? r2(item.qty * item.propUnitPrice) : null;
                          const isDeleting = deletingId === item.id;
                          return (
                            <tr key={item.id}
                              draggable
                              onDragStart={e => handleDragStart(e, item)}
                              onDragEnter={e => handleDragEnter(e, item.id)}
                              onDragOver={e => e.preventDefault()}
                              onDragEnd={() => handleDragEnd(groupItems)}
                              className={`group transition-colors
                                ${dragItem?.id === item.id ? 'opacity-30 bg-slate-100' : ''}
                                ${dragOverId === item.id && dragItem?.id !== item.id
                                  ? 'border-t-[3px] border-blue-500 bg-blue-50'
                                  : ''}
                                ${!dragItem && !isDeleting ? (isControls ? 'hover:bg-violet-50/20' : 'hover:bg-blue-50/20') : ''}
                                ${isDeleting ? 'opacity-40' : ''}`}>

                              {/* Drag handle + add-below */}
                              <td className="px-2 py-2 align-middle w-14">
                                <div className="flex items-center gap-0.5">
                                  <span className="cursor-grab text-slate-300 hover:text-slate-500 p-0.5 select-none" title="Drag to reorder">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" d="M4 8h16M4 12h16M4 16h16"/>
                                    </svg>
                                  </span>
                                  <button onClick={() => addItemAfter(item)} disabled={saving}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-blue-500 p-0.5"
                                    title="Add row below">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                  </button>
                                </div>
                              </td>

                              <td className="px-3 py-2 align-top">
                                <Cell value={item.typeCode} cellId={`${item.id}||typeCode`}
                                  placeholder="" onSave={v => patch(item.id, { typeCode: v })}
                                  className="font-bold text-slate-800 w-full" />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <Cell value={item.description} cellId={`${item.id}||description`}
                                  multiline placeholder="Fixture description" onSave={v => patch(item.id, { description: v })}
                                  className="text-slate-600 w-full leading-snug text-[10px]" />
                              </td>
                              {activeSection === 'all' && (
                                <td className="px-3 py-2 align-middle">
                                  <TagSelect value={item.section || ''}
                                    onSave={v => patch(item.id, { section: v })} />
                                </td>
                              )}
                              {!isDesignBid && (
                                <td className="px-3 py-2 align-middle">
                                  <Cell value={item.specManufacturer} cellId={`${item.id}||specManufacturer`}
                                    placeholder="Manufacturer" onSave={v => patch(item.id, { specManufacturer: v })}
                                    className="text-slate-500 w-full" />
                                </td>
                              )}
                              {!isDesignBid && (
                                <td className="px-3 py-2 align-middle">
                                  <Cell value={item.specModel} cellId={`${item.id}||specModel`}
                                    placeholder="Series / catalog #" onSave={v => patch(item.id, { specModel: v })}
                                    mono className="text-slate-500 w-full" />
                                </td>
                              )}
                              {!isDesignBid && (
                                <td className="px-3 py-2 align-middle border-r border-slate-100">
                                  <Cell value={item.specDetails} cellId={`${item.id}||specDetails`}
                                    placeholder="Color/finish" onSave={v => patch(item.id, { specDetails: v })}
                                    className="text-slate-400 w-full" />
                                </td>
                              )}
                              <td className="px-3 py-2 align-middle">
                                <MfrSelect item={item} manufacturers={manufacturers}
                                  onSelectMfr={mfr => handleSelectMfr(item, mfr)}
                                  onOpenCreate={() => setShowMfrPopup(true)} />
                              </td>
                              <td className="px-3 py-2 align-middle">
                                <ProductSelect item={item} manufacturers={manufacturers}
                                  onSelectProduct={product => handleSelectProduct(item, product)}
                                  onMfrProductAdded={handleMfrProductAdded} />
                              </td>
                              <td className="px-3 py-2 align-middle">
                                <Cell value={item.repName} cellId={`${item.id}||repName`}
                                  placeholder="Rep name" onSave={v => patch(item.id, { repName: v })}
                                  className="text-slate-600 w-full" />
                              </td>
                              <td className="px-3 py-2 align-middle border-r border-slate-100">
                                <SelectCell value={item.rfqStatus} options={RFQ_OPTIONS} placeholder="Status"
                                  onSave={v => patch(item.id, { rfqStatus: v })} />
                              </td>
                              <td className="px-1 py-2 align-middle">
                                <Cell value={item.qty} cellId={`${item.id}||qty`}
                                  placeholder="0" numeric align="right"
                                  onSave={v => handleQtyOrPrice(item, 'qty', v)} className="w-10 font-semibold" />
                              </td>
                              <td className="px-3 py-2 align-middle border-r border-slate-100">
                                <SelectCell value={item.qtyType === 'linearFt' ? 'Linear Ft' : item.qtyType ? 'Unit' : null}
                                  options={['Unit', 'Linear Ft']} placeholder="Unit"
                                  onSave={v => patch(item.id, { qtyType: v === 'Linear Ft' ? 'linearFt' : 'unit' })} />
                              </td>
                              <td className="px-3 py-2 align-middle">
                                <Cell value={item.propUnitDN} cellId={`${item.id}||propUnitDN`}
                                  placeholder="0.00" numeric align="right"
                                  onSave={v => handleDNChange(item, v)} className="text-slate-600 w-full" />
                              </td>
                              {/* CN $/unit — read-only, auto-calculated from DN + margin */}
                              <td className="px-3 py-2 align-middle text-right">
                                {item.propUnitPrice != null
                                  ? <span className="text-blue-700 font-medium text-xs">{fmtDec(item.propUnitPrice)}</span>
                                  : <span className="text-slate-300 text-xs">—</span>}
                              </td>
                              <td className="px-3 py-2 align-middle text-right border-r border-slate-100">
                                {cnTotal != null
                                  ? <span className="font-bold text-blue-700">{fmtDec(cnTotal)}</span>
                                  : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-2 align-middle">
                                <Cell value={item.notes} cellId={`${item.id}||notes`}
                                  placeholder="Add notes..." onSave={v => patch(item.id, { notes: v })}
                                  className="text-slate-400 w-full" />
                              </td>
                              <td className="px-3 py-2 align-middle bg-amber-50/30">
                                <Cell value={item.internalNotes} cellId={`${item.id}||internalNotes`}
                                  placeholder="Internal only…" onSave={v => patch(item.id, { internalNotes: v })}
                                  className="text-amber-800 w-full text-[10px]" />
                              </td>
                              <td className="px-2 py-2 align-middle">
                                <button onClick={() => deleteItem(item.id)} disabled={isDeleting}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
                                  title="Delete row">
                                  {isDeleting
                                    ? <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                                    : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  }
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Group subtotal */}
                        {groupItems.length > 0 && (
                          <tr className={`border-t border-slate-200 ${isControls ? 'bg-violet-50/60' : 'bg-slate-50'}`}>
                            <td colSpan={activeSection === 'all' ? 13 : 12} className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {activeSection === 'all'
                                ? (isControls ? 'Controls Subtotal' : 'Fixtures Subtotal')
                                : `${activeSec?.label} Subtotal`}
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-semibold text-slate-500">{fmt(groupDNTotal) ?? '—'}</td>
                            <td></td>
                            <td className={`px-3 py-2 text-right text-xs font-bold border-r border-slate-200 ${isControls ? 'text-violet-700' : 'text-blue-700'}`}>
                              {fmt(groupTotal) ?? '—'}
                            </td>
                            <td colSpan={2}></td>
                            <td></td>
                          </tr>
                        )}
                      </>
                    );
                  });
                })()}

                {/* Grand subtotal row in All view when both groups have items */}
                {activeSection === 'all' && lightingItems.length > 0 && controlsItems.length > 0 && (
                  <tr className="bg-blue-600 text-white border-t-2 border-blue-700">
                    <td colSpan={13} className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider opacity-80">
                      Total L+C
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold opacity-80">{fmt(grandDNTotal)}</td>
                    <td></td>
                    <td className="px-3 py-2 text-right text-xs font-bold border-r border-blue-500">{fmt(rawTotal)}</td>
                    <td colSpan={2}></td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Pricing summary ── */}
        {rawTotal > 0 && (
          <div className="mt-4 flex justify-end">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-96 text-xs">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Pricing Summary
              </div>
              <table className="w-full">
                <tbody>
                  {rawLighting > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className="px-4 py-2 text-slate-600">CN Subtotal — Lighting</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-slate-700">{fmt(rawLighting)}</td>
                    </tr>
                  )}
                  {rawControls > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className="px-4 py-2 text-slate-600">CN Subtotal — Controls</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-violet-700">{fmt(rawControls)}</td>
                    </tr>
                  )}
                  {freightAmt > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className="px-4 py-2 text-slate-400">Freight ({(freightPctVal * 100).toFixed(0)}%)</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-400">{fmt(freightAmt)}</td>
                    </tr>
                  )}
                  {warehousingAmt > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className="px-4 py-2 text-slate-400">Warehousing ({(warehousingPctVal * 100).toFixed(0)}%)</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-400">{fmt(warehousingAmt)}</td>
                    </tr>
                  )}
                  {salesTaxAmt > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className="px-4 py-2 text-slate-400">Sales Tax ({salesTaxPctVal > 0 ? `${(salesTaxPctVal * 100).toFixed(2)}%` : '0%'})</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-400">{fmt(salesTaxAmt)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-200">
                    <td className="px-4 py-2 text-slate-700 font-semibold">Subtotal Lighting (loaded)</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-slate-700">{fmt(subtotalLighting)}</td>
                  </tr>
                  {rawControls > 0 && (
                    <tr className="border-b border-slate-200">
                      <td className="px-4 py-2 text-violet-700 font-semibold">Subtotal Controls (loaded)</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-violet-700">{fmt(subtotalControls)}</td>
                    </tr>
                  )}
                  <tr className="bg-blue-600 text-white">
                    <td className="px-4 py-3 font-bold text-sm">Grand Total</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-sm">{fmt(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Row count ── */}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {sectionItems.length} row{sectionItems.length !== 1 ? 's' : ''}
            {activeSection !== 'all' && activeSec && ` in ${activeSec.label}`}
            {sectionItems.length > 0 && secTotal > 0 && ` · ${fmt(secTotal)} CN`}
          </span>
        </div>
        </>}{/* end of !selectedBidVer live-view wrapper */}

      </div>

      {/* ── PRINT LAYOUT ─────────────────────────────────────────────────────── */}
      {(() => {
        const ORANGE   = '#F7941D';
        const BLACK    = '#231F20';
        const GREY     = '#555555';
        const LTGREY   = '#f5f5f5';
        const BDRCLR   = '#d0d0d0';
        const NCOLS    = isDesignBid ? 9 : 11;

        const phaseLabels = { sd: 'Schematic Design', dd: 'Design Development', cd: 'Construction Documents', ifc: 'IFC', construction: 'Construction', closeout: 'Closeout' };
        const printDate   = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        const budgetDate  = project.budgetSentDate
          ? new Date(project.budgetSentDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
          : printDate;

        const lightingTags = LOCATION_TAGS.filter(t => t.id !== 'controls');
        const printSort    = list => [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

        // Build all tbody rows imperatively
        const allRows = [];
        let parity = 0;

        function pushSection(tag, isControls) {
          const tagItems = printSort(items.filter(i => i.section === tag.id));
          if (tagItems.length === 0) return;
          const secCnTotal = r2(tagItems.reduce((s, i) => s + (i.totalSavings || 0), 0));

          allRows.push(
            <tr key={`hdr-${tag.id}`} className={isControls ? 'pm-ctrl-hdr' : 'pm-sec-hdr'}>
              <td colSpan={NCOLS}>{tag.label}</td>
            </tr>
          );

          tagItems.forEach((item, idx) => {
            const cnTotal = item.qty != null && item.propUnitPrice != null ? r2(item.qty * item.propUnitPrice) : null;
            allRows.push(
              <tr key={item.id || `${tag.id}-row-${idx}`} className={parity++ % 2 === 0 ? 'pm-odd' : 'pm-even'}>
                <td style={{ fontWeight: 800, color: BLACK }}>{item.typeCode || ''}</td>
                <td style={{ color: BLACK }}>{item.description || ''}</td>
                {!isDesignBid && <td style={{ color: GREY }}>{item.specManufacturer || ''}</td>}
                {!isDesignBid && <td style={{ fontFamily: 'Courier New, monospace', fontSize: '6.5pt', color: GREY }}>{item.specModel || ''}</td>}
                <td style={{ color: ORANGE, fontWeight: 600 }}>{item.propManufacturer || ''}</td>
                <td style={{ fontFamily: 'Courier New, monospace', fontSize: '6.5pt', color: ORANGE }}>{item.propModel || ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.qty != null ? item.qty : ''}</td>
                <td style={{ color: GREY, fontSize: '6.5pt' }}>{item.qtyType === 'linearFt' ? 'LF' : item.qty != null ? 'EA' : ''}</td>
                <td style={{ textAlign: 'right', color: GREY }}>{item.propUnitPrice != null ? fmtDec(item.propUnitPrice) : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: BLACK }}>{cnTotal != null ? fmtDec(cnTotal) : ''}</td>
                <td style={{ color: GREY, fontSize: '7pt' }}>{item.notes || ''}</td>
              </tr>
            );
          });

          allRows.push(
            <tr key={`sub-${tag.id}`} className="pm-sub">
              <td colSpan={NCOLS - 1} style={{ textAlign: 'right', color: GREY, fontSize: '6.5pt', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {tag.label} Subtotal
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: BLACK }}>{secCnTotal > 0 ? fmt(secCnTotal) : '—'}</td>
            </tr>
          );
        }

        lightingTags.forEach(tag => pushSection(tag, false));
        if (items.some(i => i.section === 'controls')) {
          pushSection(LOCATION_TAGS.find(t => t.id === 'controls'), true);
        }

        const LogoSVG = (
          <img src="/ilc-studios-logo.jpg" alt="ILC Studios" style={{ height: '40px', width: 'auto' }} />
        );

        return (
          <div className="print-only" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '8.5pt', color: BLACK, background: 'white' }}>

            {/* ── PAGE HEADER: Logo left, Address right ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>{LogoSVG}</div>
              <div style={{ textAlign: 'right', fontSize: '8pt', color: GREY, lineHeight: 1.6 }}>
                <div>2301 Blake Street, Ste 100 &nbsp;|&nbsp; Denver, CO 80205</div>
                <div>720-248-8208 &nbsp;|&nbsp; orders@ilcstudios.com</div>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: `1px solid ${BDRCLR}`, margin: '0 0 14px 0' }} />

            {/* ── INFO BLOCK: Project grid left, Disclaimer right ── */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '18px', alignItems: 'flex-start' }}>

              {/* Left: rotating "Budget" label + info table */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '22pt', fontWeight: 300, color: '#888', letterSpacing: '2px', userSelect: 'none', marginTop: '4px' }}>
                  Budget
                </div>
                <table className="pm-info-table">
                  <tbody>
                    <tr>
                      <td className="lbl">Budget Number</td>
                      <td className="lbl">Budget Date</td>
                    </tr>
                    <tr>
                      <td style={{ paddingRight: '24px', fontWeight: 400 }}>{project.budgetNumber || '—'}</td>
                      <td style={{ fontWeight: 400 }}>{budgetDate}</td>
                    </tr>
                    <tr><td className="lbl" style={{ paddingTop: '6px' }}>Project Name</td><td className="lbl" style={{ paddingTop: '6px' }}>Client</td></tr>
                    <tr>
                      <td style={{ paddingRight: '24px', fontWeight: 400 }}>{project.name}</td>
                      <td style={{ fontWeight: 400 }}>{project.client?.name || '—'}</td>
                    </tr>
                    <tr><td className="lbl" style={{ paddingTop: '6px' }}>Project Manager</td><td className="lbl" style={{ paddingTop: '6px' }}>PM Email</td></tr>
                    <tr>
                      <td style={{ paddingRight: '24px', fontWeight: 400 }}>{project.createdBy?.name || 'ILC Studios'}</td>
                      <td style={{ fontWeight: 400 }}>{project.createdBy?.email || 'orders@ilcstudios.com'}</td>
                    </tr>
                    {(project.city || project.state) && (
                      <>
                        <tr><td className="lbl" style={{ paddingTop: '6px' }}>Location</td><td className="lbl" style={{ paddingTop: '6px' }}>Phase</td></tr>
                        <tr>
                          <td style={{ fontWeight: 400 }}>{[project.city, project.state].filter(Boolean).join(', ')}</td>
                          <td style={{ fontWeight: 400 }}>{phaseLabels[project.phase] || project.phase || '—'}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Right: disclaimer box */}
              <div style={{ marginLeft: 'auto', border: '1.5px solid #cc0000', padding: '10px 14px', minWidth: '200px', maxWidth: '240px' }}>
                <div style={{ color: '#cc0000', fontSize: '8pt', fontWeight: 700, lineHeight: 1.7 }}>
                  <div>✓ &nbsp;For budgetary purposes only,<br/>&nbsp;&nbsp;&nbsp;&nbsp;not an offer to sell</div>
                  <div>✓ &nbsp;Quote must be requested by<br/>&nbsp;&nbsp;&nbsp;&nbsp;client after verifying quantities</div>
                </div>
              </div>
            </div>

            {/* ── FIXTURE TABLE ── */}
            <table className="pm-table">
              <thead>
                <tr>
                  <th style={{ width: '4%'  }}>Type</th>
                  <th style={{ width: '20%' }}>Description</th>
                  {!isDesignBid && <th style={{ width: '9%'  }}>Spec Mfr</th>}
                  {!isDesignBid && <th style={{ width: '10%' }}>Spec Catalog #</th>}
                  <th style={{ width: isDesignBid ? '13%' : '9%', color: ORANGE }}>{isDesignBid ? 'Manufacturer' : 'ILC Proposed Mfr'}</th>
                  <th style={{ width: isDesignBid ? '14%' : '10%', color: ORANGE }}>{isDesignBid ? 'Part #' : 'ILC Catalog #'}</th>
                  <th style={{ width: '4%', textAlign: 'right' }}>Qty</th>
                  <th style={{ width: '4%'  }}>Unit</th>
                  <th style={{ width: '7%', textAlign: 'right' }}>Unit $</th>
                  <th style={{ width: '8%', textAlign: 'right' }}>Total</th>
                  <th style={{ width: '15%' }}>Notes</th>
                </tr>
              </thead>
              <tbody>{allRows}</tbody>
            </table>

            {/* ── TOTALS (right-aligned, matching PDF page 2) ── */}
            {rawTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '16px' }}>
                {/* Left: SF / unit metrics */}
                <div style={{ border: `1px solid ${BDRCLR}`, padding: '8px 12px', fontSize: '8pt', color: GREY, minWidth: '220px' }}>
                  {grossSf   && <div><strong>Total Square Feet:</strong> {Number(grossSf).toLocaleString()}</div>}
                  {dollarPerSf  && <div><strong>Total $/SF:</strong> {`$${dollarPerSf.toFixed(2)}`}</div>}
                  {numUnits  && <div><strong>Total Units:</strong> {numUnits}</div>}
                  {dollarPerUnit && <div><strong>$/Unit:</strong> {`$${dollarPerUnit.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}</div>}
                  {!grossSf && !numUnits && <div style={{ color: '#bbb', fontStyle: 'italic' }}>No SF / unit data entered</div>}
                </div>
                {/* Right: pricing summary */}
                <table className="pm-totals-table">
                  <tbody>
                    {rawLighting > 0 && (
                      <tr>
                        <td style={{ textAlign: 'right', color: GREY }}>Subtotal — Lighting</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Courier New, monospace', minWidth: '90px' }}>{fmt(rawLighting)}</td>
                      </tr>
                    )}
                    {rawControls > 0 && (
                      <tr>
                        <td style={{ textAlign: 'right', color: GREY }}>Subtotal — Controls</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Courier New, monospace' }}>{fmt(rawControls)}</td>
                      </tr>
                    )}
                    {freightAmt > 0 && (
                      <tr>
                        <td style={{ textAlign: 'right', color: GREY }}>Freight ({(freightPctVal * 100).toFixed(0)}%)</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Courier New, monospace' }}>{fmt(freightAmt)}</td>
                      </tr>
                    )}
                    {warehousingAmt > 0 && (
                      <tr>
                        <td style={{ textAlign: 'right', color: GREY }}>Warehousing ({(warehousingPctVal * 100).toFixed(0)}%)</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Courier New, monospace' }}>{fmt(warehousingAmt)}</td>
                      </tr>
                    )}
                    {salesTaxAmt > 0 && (
                      <tr>
                        <td style={{ textAlign: 'right', color: GREY }}>Sales Tax ({(salesTaxPctVal * 100).toFixed(2)}%)</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Courier New, monospace' }}>{fmt(salesTaxAmt)}</td>
                      </tr>
                    )}
                    {rawControls > 0 && rawLighting > 0 && (
                      <>
                        <tr>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>Subtotal Lighting (loaded)</td>
                          <td style={{ textAlign: 'right', fontFamily: 'Courier New, monospace', fontWeight: 600 }}>{fmt(subtotalLighting)}</td>
                        </tr>
                        <tr>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>Subtotal Controls (loaded)</td>
                          <td style={{ textAlign: 'right', fontFamily: 'Courier New, monospace', fontWeight: 600 }}>{fmt(subtotalControls)}</td>
                        </tr>
                      </>
                    )}
                    <tr style={{ borderTop: `2px solid ${BLACK}` }}>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '9.5pt', color: BLACK }}>Quote Total</td>
                      <td style={{ textAlign: 'right', fontFamily: 'Courier New, monospace', fontWeight: 700, fontSize: '9.5pt', color: BLACK }}>{fmt(grandTotal)}</td>
                    </tr>
                    {dollarPerSf && (
                      <tr>
                        <td style={{ textAlign: 'right', color: GREY }}>$/SF</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Courier New, monospace', color: GREY }}>${dollarPerSf.toFixed(2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── FOOTER ── */}
            <div style={{ marginTop: '14px', paddingTop: '5px', borderTop: `1px solid ${BDRCLR}`, display: 'flex', justifyContent: 'space-between', fontSize: '6.5pt', color: '#999' }}>
              <span>Confidential — ILC Studios LLC &nbsp;|&nbsp; 2301 Blake Street, Ste 100, Denver, CO 80205 &nbsp;|&nbsp; 720-248-8208</span>
              <span>Printed: {printDate}</span>
            </div>

          {/* ── TERMS PAGE ── */}
          <div style={{ pageBreakBefore: 'always', fontSize: '9pt', marginTop: '0' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>{LogoSVG}</div>
              <div style={{ textAlign: 'right', fontSize: '7.5pt', color: GREY, lineHeight: 1.5 }}>
                ILC Studios<br />
                2301 Blake Street, Ste 100 | Denver, CO 80205<br />
                720-248-8208 | orders@ilcstudios.com
              </div>
            </div>
            <hr style={{ border: 'none', borderTop: `1.5px solid ${ORANGE}`, marginBottom: '22px' }} />

            {/* General Terms */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11pt', fontWeight: 700, color: BLACK, borderBottom: `1.5px solid ${ORANGE}`, paddingBottom: '4px', marginBottom: '10px' }}>
                General Terms
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.9, color: BLACK }}>
                <li>Sales tax is included on this budget. We can remove this at future submissions of the budget if the tax will be covered by the contractor.</li>
                <li>20% mobilization is required upon acceptance of quotation.</li>
                <li>Pricing is based on a 90-day lead time from submittal.</li>
                <li>All invoices are Net 15.</li>
                <li>Warehousing/Freight estimates include 120 days of storage and 10 deliveries to the jobsite.</li>
              </ul>
            </div>

            {/* Contractor Bidding Guidelines */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11pt', fontWeight: 700, color: BLACK, borderBottom: `1.5px solid ${ORANGE}`, paddingBottom: '4px', marginBottom: '10px' }}>
                Contractor Bidding Guidelines
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>BID BREAKOUT STRUCTURE</div>
                <div style={{ lineHeight: 1.7 }}>Contractor is to break out the lighting fixture and lighting control product package prices from labor and materials. Show the total amount for lighting fixtures as one line item and lighting controls as a separate line item.</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>LIGHTING CONTROLS</div>
                <div style={{ lineHeight: 1.7 }}>Bid price is provided by ILC, but formal submittals, drawings and one-lines will be provided after 100% CD.</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>LOW VOLTAGE &amp; LINEAR FIXTURES</div>
                <div style={{ lineHeight: 1.7 }}>Bid price is provided by ILC, but lengths and power supply takeoffs will be verified during the ordering phase by the contractor.</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>EGRESS/EMERGENCY LIGHTING</div>
                <div style={{ lineHeight: 1.7 }}>When emergency lighting is required and a generator is not present, ILC will provide pricing for an inverter or integral battery backups.</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>SALES TAX</div>
                <div style={{ lineHeight: 1.7 }}>ILC will provide a best estimate for sales tax per our physical office locations, but the bidding contractor is to adjust for any missing sales tax.</div>
              </div>
            </div>

            {/* Questions */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11pt', fontWeight: 700, color: BLACK, borderBottom: `1.5px solid ${ORANGE}`, paddingBottom: '4px', marginBottom: '10px' }}>
                Questions
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.9, color: BLACK }}>
                <li>Any questions regarding this quote should be directed to {project.createdBy?.email || 'orders@ilcstudios.com'}</li>
              </ul>
            </div>

            {/* Footer */}
            <div style={{ paddingTop: '5px', borderTop: `1px solid ${BDRCLR}`, display: 'flex', justifyContent: 'space-between', fontSize: '6.5pt', color: '#999' }}>
              <span>Confidential — ILC Studios LLC &nbsp;|&nbsp; 2301 Blake Street, Ste 100, Denver, CO 80205 &nbsp;|&nbsp; 720-248-8208</span>
              <span>Printed: {printDate}</span>
            </div>

          </div>

        </div>
        );
      })()}

      {/* Budget version delete confirm */}
      {deleteBudgetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-800 mb-2">Delete budget version?</h3>
            <p className="text-sm text-slate-500 mb-1">
              You're about to permanently delete <strong className="text-slate-700">{deleteBudgetConfirm.label}</strong> of the budget matrix.
            </p>
            <p className="text-sm text-red-600 mb-6">This cannot be undone. All pricing data in this version will be deleted.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteBudgetConfirm(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => deleteBudgetVersion(deleteBudgetConfirm.id)} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700">
                Delete version
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
