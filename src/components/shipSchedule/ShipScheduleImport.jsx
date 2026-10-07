'use client';
import { useState, useRef } from 'react';
import { STATUS_META } from '@/lib/shipmentStatus';
import { oversizeMessage, uploadErrorMessage, uploadThrowMessage } from '@/lib/uploadErrorMessage';
import { appendUpload } from '@/lib/uploadClient';

function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ShipScheduleImport({ projectId, onClose, onImported }) {
  const [file,     setFile]     = useState(null);
  const [preview,  setPreview]  = useState(null); // { shipmentGroups, rowCount }
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [importing,setImporting]= useState(false);
  const inputRef = useRef(null);

  async function handleFile(f) {
    if (!f) return;
    setFile(f);
    setError('');
    setPreview(null);
    setLoading(true);

    const tooBig = oversizeMessage(f);
    if (tooBig) { setError(tooBig); setLoading(false); return; }

    const fd = new FormData();

    // Wrapped: this used to have no try/catch, so a rejected upload (whose body is
    // empty) threw inside res.json() and the spinner span forever with no message.
    // appendUpload is inside the try for the same reason — it can throw too.
    try {
      await appendUpload(fd, f, { scope: 'project' });
      const res = await fetch(`/api/projects/${projectId}/shipments/import`, { method: 'POST', body: fd });
      setLoading(false);
      if (!res.ok) { setError(await uploadErrorMessage(res, f)); return; }
      setPreview(await res.json());
    } catch (e) {
      setLoading(false);
      setError(uploadThrowMessage(e, f));
    }
  }

  async function commit() {
    if (!file) return;
    setImporting(true);
    setError('');

    const fd = new FormData();

    try {
      await appendUpload(fd, file, { scope: 'project' });
      const res = await fetch(`/api/projects/${projectId}/shipments/import?commit=true`, { method: 'POST', body: fd });
      setImporting(false);
      if (!res.ok) { setError(await uploadErrorMessage(res, file)); return; }
      onImported();
    } catch (e) {
      setImporting(false);
      setError(uploadThrowMessage(e, file));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Import Ship Schedule</h2>
            <p className="text-xs text-slate-400 mt-0.5">Route 40 format · Groups by manufacturer · Preview before importing</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 transition-colors mb-4"
          >
            <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <p className="text-sm text-slate-500">{file ? file.name : 'Drop your Excel file here or click to browse'}</p>
            <p className="text-xs text-slate-400 mt-1">.xlsx or .xls</p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

          {loading && (
            <div className="text-center py-6 text-sm text-slate-400">Parsing file…</div>
          )}

          {/* Preview */}
          {preview && (
            <div>
              <p className="text-xs text-slate-500 mb-3">
                Found <strong>{preview.preview.length} shipment{preview.preview.length !== 1 ? 's' : ''}</strong> across{' '}
                <strong>{preview.rowCount} rows</strong>. Review below, then click Import.
              </p>

              <div className="space-y-3">
                {preview.preview.map((s, i) => {
                  const meta = STATUS_META[s.status] || STATUS_META.PO_PLACED;
                  return (
                    <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-3">
                        <span className="font-semibold text-slate-800 text-sm flex-1">{s.manufacturer}</span>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                        {s.esdDate   && <span className="text-xs text-slate-500">ESD: {fmt(s.esdDate)}</span>}
                        {s.leadTimeWeeks && <span className="text-xs text-slate-500">Lead: {s.leadTimeWeeks}w</span>}
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left px-4 py-1.5 text-slate-400 font-medium">Type</th>
                            <th className="text-left px-4 py-1.5 text-slate-400 font-medium">Description</th>
                            <th className="text-left px-4 py-1.5 text-slate-400 font-medium hidden sm:table-cell">Catalog No.</th>
                            <th className="text-center px-4 py-1.5 text-slate-400 font-medium">Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.lineItems.map((item, j) => (
                            <tr key={j} className={`${j > 0 ? 'border-t border-slate-50' : ''}`}>
                              <td className="px-4 py-1.5 font-mono font-semibold text-slate-700">{item.fixtureType}</td>
                              <td className="px-4 py-1.5 text-slate-600">{item.description}</td>
                              <td className="px-4 py-1.5 text-slate-400 hidden sm:table-cell">{item.catalogNo || '—'}</td>
                              <td className="px-4 py-1.5 text-center text-slate-700">{item.qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-4 flex justify-end gap-2 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          {preview && (
            <button
              onClick={commit}
              disabled={importing}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60"
            >
              {importing ? 'Importing…' : `Import ${preview.preview.length} Shipment${preview.preview.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
