'use client';
import { useState, useEffect, useRef } from 'react';
import PdfViewerModal from '@/components/ui/PdfViewerModal';
import DrawingMarkupModal from '@/components/drawing/DrawingMarkupModal';
import { batchOversizeMessage } from '@/lib/uploadErrorMessage';
import { appendUploads } from '@/lib/uploadClient';
import ConfirmArchiveModal, { setArchived, ArchiveBoxIcon, KEPT_ON_ARCHIVE_PAGE } from '@/components/salesAutomation/ConfirmArchiveModal';

const PHASE_TAGS = ['SD', 'DD', 'CD', 'IFC', 'ASI', 'RFI', 'OTHER'];

// Tags that trigger a project phase update (only advance, never go backward)
const TAG_TO_PHASE = {
  SD:  'sd',
  DD:  'dd',
  CD:  'cd',
  IFC: 'ifc',
  ASI: 'construction',
  RFI: 'construction',
};
const PHASE_COLORS = {
  SD:     'bg-violet-50 text-violet-700 border-violet-200',
  DD:     'bg-blue-50   text-blue-700   border-blue-200',
  CD:     'bg-cyan-50   text-cyan-700   border-cyan-200',
  IFC:    'bg-green-50  text-green-700  border-green-200',
  ASI:    'bg-amber-50  text-amber-700  border-amber-200',
  RFI:    'bg-orange-50 text-orange-700 border-orange-200',
  PERMIT: 'bg-red-50   text-red-700   border-red-200',
  OTHER:  'bg-slate-50  text-slate-500  border-slate-200',
};

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Phase tag badge (inline editable) ────────────────────────────────────────
function PhaseTagBadge({ tag, readOnly, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const colorCls = tag ? PHASE_COLORS[tag] : 'bg-slate-100 text-slate-400 border-slate-200';

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => !readOnly && setOpen(v => !v)}
        className={`text-[11px] font-bold px-2 py-1 rounded-full border uppercase tracking-wide transition-colors ${colorCls} ${readOnly ? '' : 'hover:opacity-80 cursor-pointer'}`}
      >
        {tag || 'Untagged'}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-xl shadow-xl border border-slate-200 p-2 flex flex-wrap gap-1 w-48">
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            className="text-[11px] px-2 py-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 uppercase tracking-wide"
          >
            Clear
          </button>
          {PHASE_TAGS.map(t => (
            <button
              key={t}
              onClick={() => { onChange(t); setOpen(false); }}
              className={`text-[11px] font-bold px-2 py-1 rounded-full border uppercase tracking-wide transition-colors ${PHASE_COLORS[t]} ${tag === t ? 'ring-2 ring-offset-1 ring-current' : ''}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Upload modal ──────────────────────────────────────────────────────────────
function UploadModal({ projectId, onUploaded, onClose }) {
  const [files,     setFiles]     = useState([]);
  const [source,    setSource]    = useState('EXTERNAL');
  const [phaseTag,  setPhaseTag]  = useState('');
  const [notes,     setNotes]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState(null);
  const [dragging,  setDragging]  = useState(false);
  const fileRef = useRef(null);

  function addFiles(newFiles) {
    setFiles(prev => [...prev, ...Array.from(newFiles).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'))]);
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function doUpload() {
    if (files.length === 0) { setError('Please select at least one PDF file.'); return; }
    // PDFs go to S3 one at a time (25 MB each); anything else still shares the
    // request body and its combined size has to clear 4 MB. batchOversizeMessage
    // applies whichever rule each file falls under.
    const tooBig = batchOversizeMessage(files);
    if (tooBig) { setError(tooBig); return; }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      await appendUploads(fd, files, { scope: 'project' });
      fd.append('source', source);
      if (phaseTag) fd.append('phaseTag', phaseTag);
      if (notes)    fd.append('notes', notes);

      const res  = await fetch(`/api/projects/${projectId}/drawing-submissions`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onUploaded(data.submission, data.phaseAdvanced ?? null);
    } catch (e) {
      setError(e.message);
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Upload Drawing Set</h2>
          <button onClick={onClose} disabled={uploading} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors ${dragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'}`}
          >
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm text-slate-600">Drop PDFs here or click to browse</p>
            <p className="text-xs text-slate-400">Multiple files allowed · PDF only</p>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" multiple className="hidden"
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {/* Selected files */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-xs">
                  <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="flex-1 truncate text-slate-700">{f.name}</span>
                  <span className="text-slate-400 shrink-0">{formatBytes(f.size)}</span>
                  <button onClick={() => removeFile(i)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Source selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Source</label>
            <div className="flex gap-2">
              {['EXTERNAL', 'INTERNAL'].map(s => (
                <button key={s} type="button" onClick={() => setSource(s)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    source === s
                      ? 'bg-orange-50 text-orange-700 border-orange-400'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}>
                  {s === 'EXTERNAL' ? 'External (Outside design team)' : 'Internal (ILC)'}
                </button>
              ))}
            </div>
          </div>

          {/* Phase tag */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Phase tag <span className="font-normal normal-case text-slate-400">— optional, can be added later</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PHASE_TAGS.map(t => (
                <button key={t} type="button" onClick={() => setPhaseTag(phaseTag === t ? '' : t)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide transition-colors ${
                    phaseTag === t ? PHASE_COLORS[t] + ' ring-2 ring-offset-1 ring-current' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">Tag can be added later, it's always on the drawings</p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notes <span className="font-normal normal-case text-slate-500">— optional</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none placeholder:text-slate-300"
              placeholder="e.g. 100% CD set, includes mechanical changes…"
            />
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600">{error}</div>}

          <div className="flex justify-end gap-3">
            <button onClick={onClose} disabled={uploading} className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={doUpload} disabled={uploading || files.length === 0}
              className="text-sm px-5 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center gap-2">
              {uploading && <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>}
              {uploading ? 'Uploading…' : `Upload ${files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''}` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Submission card ───────────────────────────────────────────────────────────
function SubmissionCard({ submission, projectId, onUpdate, onDelete }) {
  const [deleting,    setDeleting]    = useState(false);
  const [markupFile,  setMarkupFile]  = useState(null); // { id, originalName, pdfUrl }

  async function updateTag(phaseTag) {
    const res  = await fetch(`/api/projects/${projectId}/drawing-submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phaseTag }),
    });
    const data = await res.json();
    if (res.ok) onUpdate(data.submission);
  }

  const [asking, setAsking] = useState(false);

  // Drawing sets are archived, never deleted (Mike, 2026-09-11).
  async function handleArchive() {
    setDeleting(true);
    const problem = await setArchived(`/api/projects/${projectId}/drawing-submissions/${submission.id}`);
    setDeleting(false);
    setAsking(false);
    if (problem) { alert(problem); return; }
    onDelete(submission.id);
  }

  function openMarkup(df) {
    setMarkupFile({
      id:           df.id,
      fileName:     df.fileName,
      originalName: df.fileName,
      scale_ratio:  df.scale_ratio ?? null,
      pdfUrl:       `/api/projects/${projectId}/drawing-submissions/${submission.id}/files/${df.id}`,
    });
  }

  const sourceLabel = submission.source === 'INTERNAL' ? 'Internal' : 'External';
  const sourceCls   = submission.source === 'INTERNAL'
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : 'bg-slate-100 text-slate-500 border-slate-200';

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors shadow-sm">
      {/* Submission header */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-100">
        <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <PhaseTagBadge tag={submission.phaseTag} onChange={updateTag} />
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${sourceCls}`}>{sourceLabel}</span>
            <span className="text-xs text-slate-400">{formatDate(submission.createdAt)}</span>
            <span className="text-xs text-slate-400">· {submission.files.length} file{submission.files.length !== 1 ? 's' : ''}</span>
          </div>
          {submission.notes && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{submission.notes}</p>
          )}
        </div>

        <button
          onClick={() => setAsking(true)}
          disabled={deleting}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-orange-600 hover:bg-amber-50 transition-all disabled:opacity-50"
          title="Archive drawing set"
        >
          {deleting
            ? <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
            : <ArchiveBoxIcon />
          }
        </button>
      </div>

      <ConfirmArchiveModal
        open={asking}
        title="Archive this drawing set?"
        what={`${submission.files.length} file${submission.files.length !== 1 ? 's' : ''}${submission.phaseTag ? ` · ${submission.phaseTag.toUpperCase()}` : ''}`}
        body={`The whole set comes off this tab, every sheet in it. ${KEPT_ON_ARCHIVE_PAGE}`}
        busy={deleting}
        onCancel={() => setAsking(false)}
        onConfirm={handleArchive}
      />

      {/* File list */}
      <div className="divide-y divide-slate-50">
        {submission.files.map(df => (
          <button
            key={df.id}
            onClick={() => openMarkup(df)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left group"
          >
            <svg className="w-4 h-4 text-slate-300 group-hover:text-red-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="flex-1 text-sm text-slate-700 group-hover:text-orange-600 truncate transition-colors">{df.fileName}</span>
            <div className="flex items-center gap-2 shrink-0">
              {df.pageCount && <span className="text-xs text-slate-400">{df.pageCount}p</span>}
              {df.size      && <span className="text-xs text-slate-400">{formatBytes(df.size)}</span>}
              <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {markupFile && (
        <DrawingMarkupModal
          file={markupFile}
          projectId={projectId}
          pdfUrl={markupFile.pdfUrl}
          onClose={() => setMarkupFile(null)}
        />
      )}
    </div>
  );
}

// ── Flat drawing file row ─────────────────────────────────────────────────────
function DrawingFileRow({ file, projectId, onDeleteSubmission }) {
  const [markupOpen, setMarkupOpen] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const downloadUrl = file.pdfUrl; // served from drawing-submissions route

  const [asking, setAsking] = useState(false);

  // One sheet can't be archived on its own: it belongs to the set it was
  // uploaded with, so this archives that whole set (as Delete used to).
  async function handleArchive() {
    setDeleting(true);
    const problem = await setArchived(`/api/projects/${projectId}/drawing-submissions/${file.submissionId}`);
    setDeleting(false);
    setAsking(false);
    if (problem) { alert(problem); return; }
    onDeleteSubmission();
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 transition-colors group">
        {/* PDF icon */}
        <svg className="w-6 h-7 text-red-400 shrink-0" viewBox="0 0 24 28" fill="none">
          <rect width="24" height="28" rx="2" fill="currentColor" fillOpacity="0.12"/>
          <text x="12" y="18" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold">PDF</text>
        </svg>

        {/* Filename — click to open markup viewer */}
        <button
          onClick={() => setMarkupOpen(true)}
          className="flex-1 text-sm text-slate-800 hover:text-orange-600 transition-colors text-left truncate"
        >
          {file.fileName}
        </button>

        {/* Phase tag */}
        {file.phaseTag && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide shrink-0 ${PHASE_COLORS[file.phaseTag] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
            {file.phaseTag}
          </span>
        )}

        {/* Meta */}
        {file.pageCount && <span className="text-xs text-slate-400 shrink-0">{file.pageCount}p</span>}
        {file.size && <span className="text-xs text-slate-400 shrink-0">{formatBytes(file.size)}</span>}
        <span className="text-xs text-slate-400 shrink-0">
          {new Date(file.submissionCreatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>

        {/* Download */}
        <a href={downloadUrl} download={file.fileName}
          className="p-1.5 rounded-lg text-slate-300 hover:text-orange-600 hover:bg-orange-50 transition-colors shrink-0" title="Download">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </a>

        {/* Archive */}
        <button onClick={() => setAsking(true)} disabled={deleting}
          className="p-1.5 rounded-lg text-slate-300 hover:text-orange-600 hover:bg-amber-50 transition-colors shrink-0 disabled:opacity-50" title="Archive">
          {deleting
            ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
            : <ArchiveBoxIcon className="w-4 h-4" />
          }
        </button>
      </div>

      <ConfirmArchiveModal
        open={asking}
        title="Archive this drawing set?"
        what={file.fileName}
        body={`This sheet came in as part of a set, so the whole set is archived with it. ${KEPT_ON_ARCHIVE_PAGE}`}
        busy={deleting}
        onCancel={() => setAsking(false)}
        onConfirm={handleArchive}
      />

      {markupOpen && (
        <DrawingMarkupModal
          file={{ id: file.id, fileName: file.fileName, originalName: file.fileName, pdfUrl: file.pdfUrl }}
          projectId={projectId}
          pdfUrl={file.pdfUrl}
          onClose={() => setMarkupOpen(false)}
        />
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DrawingsTab({ projectId }) {
  const [submissions,    setSubmissions]    = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showUpload,     setShowUpload]     = useState(false);
  const [error,          setError]          = useState(null);
  const [phaseToast,     setPhaseToast]     = useState(null); // e.g. "construction"

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/projects/${projectId}/drawing-submissions`);
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      setError('Failed to load drawing submissions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]);

  function handleUploaded(submission, phaseAdvanced) {
    setSubmissions(prev => [submission, ...prev]);
    setShowUpload(false);
    if (phaseAdvanced) {
      setPhaseToast(phaseAdvanced);
      setTimeout(() => setPhaseToast(null), 6000);
    }
  }

  function handleUpdate(updated) {
    setSubmissions(prev => prev.map(s => s.id === updated.id ? updated : s));
  }

  function handleDelete(id) {
    setSubmissions(prev => prev.filter(s => s.id !== id));
  }

  const PHASE_LONG = { sd:'Schematic Design', dd:'Design Development', cd:'Construction Documents', ifc:'Issued for Construction', construction:'Construction Administration', closeout:'Project Closeout' };

  return (
    <div className="space-y-4">

      {/* Phase advanced toast */}
      {phaseToast && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
          <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Project phase automatically advanced to <strong>{PHASE_LONG[phaseToast] ?? phaseToast}</strong> based on drawing tag.</span>
          <button onClick={() => setPhaseToast(null)} className="ml-auto text-green-500 hover:text-green-700">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {submissions.length > 0
              ? `${submissions.length} submission${submissions.length !== 1 ? 's' : ''} · click a file to view`
              : 'Upload drawing sets and tag them by phase'}
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          + Upload Drawing Set
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-8 text-slate-400 text-sm justify-center">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          Loading…
        </div>
      )}

      {/* Error */}
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>}

      {/* Empty state */}
      {!loading && submissions.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 py-20 flex flex-col items-center gap-4 text-center px-8">
          <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12v3m0 0v3m0-3h-3m3 0h3M13.5 4.5H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V8.625a4.5 4.5 0 00-4.5-4.5z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">No drawing sets yet</p>
            <p className="text-xs text-slate-400 mt-1">Upload PDFs organized by phase submission. Phase tags can be added later.</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="px-5 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors shadow-sm"
          >
            + Upload Drawing Set
          </button>
        </div>
      )}

      {/* Flat file list — one row per file across all submissions */}
      {!loading && submissions.length > 0 && (() => {
        // Flatten all files, attaching parent submission metadata to each
        const allFiles = submissions.flatMap(s =>
          (s.files || []).map(df => ({
            ...df,
            submissionId: s.id,
            phaseTag:     s.phaseTag,
            source:       s.source,
            submissionCreatedAt: s.createdAt,
            notes:        s.notes,
            pdfUrl:       `/api/projects/${projectId}/drawing-submissions/${s.id}/files/${df.id}`,
          }))
        );

        return (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {allFiles.length} drawing file{allFiles.length !== 1 ? 's' : ''} · {submissions.length} set{submissions.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="divide-y divide-slate-50">
              {allFiles.map(df => (
                <DrawingFileRow
                  key={`${df.submissionId}-${df.id}`}
                  file={df}
                  projectId={projectId}
                  onDeleteSubmission={() => handleDelete(df.submissionId)}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {showUpload && (
        <UploadModal
          projectId={projectId}
          onUploaded={handleUploaded}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
