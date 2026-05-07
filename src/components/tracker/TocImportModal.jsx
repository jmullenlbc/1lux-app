'use client';
import { useState, useEffect } from 'react';

/**
 * TocImportModal
 * Lets the user pick a submittal PDF that has already been uploaded,
 * previews the parsed TOC entries, and bulk-creates SubmittalItems.
 */
export default function TocImportModal({ projectId, onClose, onImported }) {
  const [files,     setFiles]     = useState([]);  // submittal PDFs
  const [fileId,    setFileId]    = useState('');
  const [items,     setItems]     = useState(null); // null = not previewed yet
  const [loading,   setLoading]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [error,     setError]     = useState('');
  const [result,    setResult]    = useState(null); // { created, skipped }

  // Load submittal files on mount
  useEffect(() => {
    fetch(`/api/projects/${projectId}/files?tab=submittals`)
      .then(r => r.json())
      .then(d => {
        const pdfs = (d.files || []).filter(f =>
          f.mimeType === 'application/pdf' || f.originalName?.toLowerCase().endsWith('.pdf')
        );
        setFiles(pdfs);
        if (pdfs.length === 1) setFileId(pdfs[0].id);
      })
      .catch(() => {});
  }, [projectId]);

  async function preview() {
    if (!fileId) return;
    setLoading(true);
    setError('');
    setItems(null);
    try {
      const res  = await fetch(`/api/projects/${projectId}/tracker/import-toc?fileId=${fileId}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Parse failed'); }
      else { setItems(data.items || []); }
    } catch { setError('Network error'); }
    setLoading(false);
  }

  async function importItems() {
    setImporting(true);
    setError('');
    try {
      const res  = await fetch(`/api/projects/${projectId}/tracker/import-toc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Import failed'); }
      else {
        setResult(data);
        setTimeout(() => { onImported(); }, 1200);
      }
    } catch { setError('Network error'); }
    setImporting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Import from PDF TOC</h2>
            <p className="text-xs text-slate-400 mt-0.5">Parse fixture types from an uploaded submittal PDF</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* File picker */}
          {files.length === 0 ? (
            <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6 text-center">
              <p className="text-sm text-slate-500">No submittal PDFs uploaded yet.</p>
              <p className="text-xs text-slate-400 mt-1">Upload a PDF to the Submittals tab first, then come back here.</p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Select Submittal PDF
              </label>
              <select
                value={fileId}
                onChange={e => { setFileId(e.target.value); setItems(null); setResult(null); setError(''); }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">Select a file…</option>
                {files.map(f => (
                  <option key={f.id} value={f.id}>{f.originalName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Success */}
          {result && (
            <div className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2.5">
              ✓ Created <strong>{result.created}</strong> fixture type{result.created !== 1 ? 's' : ''}
              {result.skipped > 0 && ` · ${result.skipped} already existed`}
            </div>
          )}

          {/* Preview */}
          {items !== null && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {items.length} fixture type{items.length !== 1 ? 's' : ''} found
                </p>
                {items.length > 0 && (
                  <p className="text-[11px] text-slate-400">Duplicates will be skipped</p>
                )}
              </div>

              {items.length === 0 ? (
                <div className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3 text-sm text-amber-700">
                  No fixture types could be parsed. The PDF may not have a structured TOC.
                  Try uploading a different submittal, or add items manually in the tracker.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-20">Type</th>
                        <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {items.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.typeCode}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600 text-xs">{item.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-white transition-colors">
            Cancel
          </button>
          {items === null ? (
            <button
              onClick={preview}
              disabled={!fileId || loading}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors disabled:opacity-50"
            >
              {loading ? 'Parsing…' : 'Preview TOC'}
            </button>
          ) : items.length > 0 && !result ? (
            <button
              onClick={importItems}
              disabled={importing}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
            >
              {importing ? 'Importing…' : `Import ${items.length} Type${items.length !== 1 ? 's' : ''}`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
