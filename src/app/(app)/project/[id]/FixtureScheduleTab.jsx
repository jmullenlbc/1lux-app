'use client';
import { useState, useRef, useEffect } from 'react';
import PdfViewerModal from '@/components/ui/PdfViewerModal';
import { oversizeMessage } from '@/lib/uploadErrorMessage';

const PHASE_OPTIONS = ['SD', 'DD', 'CD', 'IFC', 'ASI'];

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

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Tag modal (shown on drop / browse, before upload) ────────────────────────
const TAG_GROUPS = [
  { label: 'Design Phase', tags: PHASE_OPTIONS },
];

function TagsModal({ fileName, onConfirm, onCancel }) {
  const [selected, setSelected] = useState([]);

  function toggle(tag) {
    setSelected(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">Tag this file</h3>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{fileName}</p>
        </div>
        <div className="p-5 space-y-4">
          {TAG_GROUPS.map(group => (
            <div key={group.label}>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {group.label}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {group.tags.map(tag => (
                  <button key={tag} type="button" onClick={() => toggle(tag)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      selected.includes(tag)
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(selected)}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-white transition-colors">
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Saved file card ───────────────────────────────────────────────────────────
function FileCard({ file, projectId, onDelete, onView }) {
  const [deleting, setDeleting] = useState(false);
  const tags  = (() => { try { return JSON.parse(file.tags || '[]'); } catch { return []; } })();
  const phase = PHASE_OPTIONS.find(p => tags.includes(p));

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirm(`Delete "${file.originalName}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/projects/${projectId}/files/${file.id}`, { method: 'DELETE' });
      onDelete(file.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div
      onClick={onView}
      className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer group"
    >
      {/* PDF icon */}
      <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-700 transition-colors">{file.originalName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-400">{formatDate(file.createdAt)}</span>
          {file.size && (
            <>
              <span className="text-slate-200">·</span>
              <span className="text-xs text-slate-400">{formatBytes(file.size)}</span>
            </>
          )}
          {file.uploadedBy && (
            <>
              <span className="text-slate-200">·</span>
              <span className="text-xs text-slate-400">{file.uploadedBy.name || file.uploadedBy.email}</span>
            </>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 shrink-0">
        {phase && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 uppercase tracking-wide">
            {phase}
          </span>
        )}
        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide">
          Fixture Schedule
        </span>
      </div>

      {/* Open PDF button */}
      <button
        onClick={e => { e.stopPropagation(); onView(); }}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors opacity-0 group-hover:opacity-100"
        title="Open PDF"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        Open PDF
      </button>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
        title="Delete"
      >
        {deleting
          ? <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
          : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
        }
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FixtureScheduleTab({ projectId }) {
  const [step,        setStep]        = useState('upload'); // 'upload'|'parsing'|'preview'|'importing'|'done'
  const [warning,     setWarning]     = useState(null);
  const [fixtures,    setFixtures]    = useState([]);
  const [fileName,    setFileName]    = useState('');
  const [dragging,    setDragging]    = useState(false);
  const [error,       setError]       = useState(null);
  const [imported,    setImported]    = useState(0);
  const [savedFiles,  setSavedFiles]  = useState([]);
  const [loadingFiles,setLoadingFiles]= useState(true);
  const [pendingFile, setPendingFile] = useState(null); // file waiting for tags
  const [viewingFile, setViewingFile] = useState(null);
  const fileRef = useRef(null);

  // Load saved fixture schedule files on mount
  useEffect(() => {
    fetch(`/api/projects/${projectId}/files?tab=fixture-schedule`)
      .then(r => r.json())
      .then(d => setSavedFiles(d.files || []))
      .catch(() => {})
      .finally(() => setLoadingFiles(false));
  }, [projectId]);

  async function parseFile(file, extraTags = []) {
    if (!file || file.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    const tooBig = oversizeMessage(file);
    if (tooBig) { setError(tooBig); return; }
    setFileName(file.name);
    setError(null);
    setStep('parsing');

    // 1. Save the file to the project files store
    try {
      const tags = ['Fixture Schedule', ...extraTags];
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tab',  'fixture-schedule');
      fd.append('tags', JSON.stringify(tags));
      const saveRes  = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: fd });
      const saveData = await saveRes.json();
      if (saveRes.ok && saveData.file) {
        setSavedFiles(prev => [saveData.file, ...prev]);
      }
    } catch {}

    // 2. AI parse for Budget Matrix import
    try {
      const fd2 = new FormData();
      fd2.append('file', file);
      const res  = await fetch(`/api/projects/${projectId}/peer-review/parse-pdf`, { method: 'POST', body: fd2 });
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
    if (file) setPendingFile(file);
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
      <div className="space-y-5">
        {viewingFile && <PdfViewerModal file={viewingFile} projectId={projectId} onClose={() => setViewingFile(null)} />}
        {pendingFile && (
          <TagsModal
            fileName={pendingFile.name}
            onConfirm={tags => { setPendingFile(null); parseFile(pendingFile, tags); }}
            onCancel={() => setPendingFile(null)}
          />
        )}
        <div className="flex flex-col items-center gap-6 py-16">
          <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-800">{imported} fixture{imported !== 1 ? 's' : ''} pushed to Budget Matrix</p>
            <p className="text-sm text-slate-400 mt-1">Open the Budget Matrix from the Budgets tab to review, price, and finalize.</p>
          </div>
          <button onClick={reset}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Parse Another PDF
          </button>
        </div>

        {/* Still show saved files */}
        {savedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">Uploaded Schedules</p>
            {savedFiles.map(f => <FileCard key={f.id} file={f} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {viewingFile && <PdfViewerModal file={viewingFile} projectId={projectId} onClose={() => setViewingFile(null)} />}
      {pendingFile && (
        <TagsModal
          fileName={pendingFile.name}
          onConfirm={tags => { setPendingFile(null); parseFile(pendingFile, tags); }}
          onCancel={() => setPendingFile(null)}
        />
      )}

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
            onChange={e => { if (e.target.files[0]) { setPendingFile(e.target.files[0]); e.target.value = ''; } }} />
        </div>
        {error && <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">{error}</div>}
        <div className="mt-3 text-xs text-slate-400 space-y-0.5">
          <p>• Upload the E-sheet that contains the Luminaire Schedule or Light Fixture Schedule table</p>
          <p>• Image-based or scanned PDFs must be OCR&apos;d first (Bluebeam: Document → OCR)</p>
          <p>• Works with multi-section sheets — AI searches the entire document for the schedule</p>
        </div>
      </div>

      {/* Saved files */}
      {(savedFiles.length > 0 || loadingFiles) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">Uploaded Schedules</p>
          {loadingFiles ? (
            <div className="flex items-center gap-2 px-1 py-2 text-xs text-slate-400">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              Loading…
            </div>
          ) : (
            savedFiles.map(f => <FileCard key={f.id} file={f} projectId={projectId} onDelete={id => setSavedFiles(prev => prev.filter(x => x.id !== id))} onView={() => setViewingFile(f)} />)
          )}
        </div>
      )}

      {/* Preview table */}
      {(step === 'preview' || step === 'importing') && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">
                {fixtures.length} fixture type{fixtures.length !== 1 ? 's' : ''} found in &ldquo;{fileName}&rdquo;
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Adjust sections if needed, remove unwanted rows, then push to Budget Matrix</p>
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
                    <>Push {fixtures.length} fixture{fixtures.length !== 1 ? 's' : ''} to Budget Matrix</>
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
