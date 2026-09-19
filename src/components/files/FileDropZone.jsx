'use client';
import { useState, useRef, useCallback, useMemo } from 'react';
import PdfViewerModal from '@/components/ui/PdfViewerModal';
import { oversizeMessage, uploadErrorMessage, uploadThrowMessage } from '@/lib/uploadErrorMessage';
import { appendUpload } from '@/lib/uploadClient';
import { afterUploadReads } from '@/lib/scheduleReadClient';
import ConfirmArchiveModal, { setArchived, ArchiveBoxIcon, KEPT_ON_ARCHIVE_PAGE } from '@/components/salesAutomation/ConfirmArchiveModal';

// Flat tag list used for filter chips and ordering
const TAB_TAGS = {
  drawings:      ['Site Entitlement', 'SD', 'DD', 'CD', 'IFC', 'Buyout', 'ASI', 'Electrical', 'Interior Design', 'Landscape', 'Civil', 'Arch'],
  correspondence:['Email', 'Text', 'Call'],
  submittals:    ['Sent', 'Response', 'Fully Approved'],
  ca:            ['RFI', 'Change Order', 'Construction Schedule', 'Ship Schedule', 'Site photos', 'Returns', 'Warranty Replacement'],
  contracts:     ['Design', 'Design - Executed', 'Supply', 'Supply - Executed', 'COI', 'SOV'],
  meetings:      ['Agenda', 'Minutes', 'Action Items', 'Presentation'],
  designInfo:    ['Design Schedule', 'Code', 'Notes', 'Standards'],
  takeoffs:      ['SD', 'DD', 'CD', 'IFC', 'ASI', 'RFI'],
  budgets:       ['SD', 'DD', 'CD', 'Buyout'],
};

// Grouped tags for tabs that need visual sections in the upload modal
const TAB_TAG_GROUPS = {
  drawings: [
    { label: 'Discipline', tags: ['Electrical', 'Interior Design', 'Landscape', 'Civil', 'Arch'] },
    { label: 'Phase',      tags: ['Site Entitlement', 'SD', 'DD', 'CD', 'IFC', 'Buyout', 'ASI'] },
  ],
};

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseTags(raw) {
  if (!raw) return [];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function TagsModal({ fileName, tab, onConfirm, onCancel }) {
  const [selected, setSelected] = useState([]);
  const groups = TAB_TAG_GROUPS[tab] || null;
  const flatTags = TAB_TAGS[tab] || [];

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
          {groups ? (
            groups.map(group => (
              <div key={group.label}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {group.label}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {group.tags.map(tag => (
                    <button key={tag} type="button" onClick={() => toggle(tag)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${selected.includes(tag) ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : flatTags.length > 0 ? (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Tags <span className="normal-case font-normal text-red-400">* required</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {flatTags.map(tag => (
                  <button key={tag} type="button" onClick={() => toggle(tag)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${selected.includes(tag) ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ tags: selected })}
            disabled={selected.length === 0}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

function FileRow({ file, projectId, selected, onToggle, onView }) {
  const tags    = parseTags(file.tags);
  const ext     = file.originalName.split('.').pop()?.toLowerCase();
  const isExcel = ['xlsx', 'xls', 'csv'].includes(ext);
  const isPdf   = ext === 'pdf';

  return (
    <div className={`flex items-center gap-3 py-2.5 px-4 border-b border-slate-50 last:border-0 transition-colors group ${selected ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer shrink-0"
      />
      <div className="shrink-0">
        {isExcel ? (
          <svg className="w-6 h-7 text-green-500" viewBox="0 0 24 28" fill="none">
            <rect width="24" height="28" rx="2" fill="currentColor" fillOpacity="0.12"/>
            <text x="12" y="18" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold">XLS</text>
          </svg>
        ) : (
          <svg className="w-6 h-7 text-red-400" viewBox="0 0 24 28" fill="none">
            <rect width="24" height="28" rx="2" fill="currentColor" fillOpacity="0.12"/>
            <text x="12" y="18" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold">PDF</text>
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <button
          onClick={() => isPdf && onView?.(file)}
          className={`text-sm font-medium text-slate-700 transition-colors truncate block text-left w-full ${isPdf ? 'hover:text-amber-600 cursor-pointer' : 'cursor-default'}`}>
          {file.originalName}
        </button>
        <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
          {tags.map(tag => (
            <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{tag}</span>
          ))}
          <span className="text-[10px] text-slate-400">{formatBytes(file.size)}</span>
          <span className="text-[10px] text-slate-400">
            {new Date(file.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
          </span>
          {file.uploadedBy && (
            <span className="text-[10px] text-slate-400">{file.uploadedBy.name || file.uploadedBy.email}</span>
          )}
          {file.textContent
            ? <span className="text-[10px] text-green-500 font-medium">● AI can read</span>
            : isPdf && <span className="text-[10px] text-slate-300 font-medium" title="No text could be extracted — may be a scanned image PDF">● AI can't read</span>
          }
        </div>
      </div>
      {isPdf && (
        <button
          onClick={() => onView?.(file)}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors opacity-0 group-hover:opacity-100"
          title="Open PDF"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          Open PDF
        </button>
      )}
    </div>
  );
}

export default function FileDropZone({ projectId, tab, initialFiles = [], onFileAdded, onFileDeleted, onBeforeTaggedUpload }) {
  const [files,        setFiles]        = useState(initialFiles);
  const [dragging,     setDragging]     = useState(false);
  const [pendingFile,  setPendingFile]  = useState(null);
  const [uploading,    setUploading]    = useState([]);
  const [selected,     setSelected]     = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false); // archiving the selected files
  const [askBulk,      setAskBulk]      = useState(false);
  const [activeTag,    setActiveTag]    = useState(null);
  const [aiFilter,     setAiFilter]     = useState(null); // null | 'readable' | 'unreadable'
  const [viewingFile,  setViewingFile]  = useState(null);
  const [uploadErrors, setUploadErrors] = useState([]); // [{ id, msg }] — shown until dismissed
  const inputRef = useRef(null);

  const acceptsSpreadsheet = tab === 'takeoffs' || tab === 'contracts';
  const accept = acceptsSpreadsheet ? '.pdf,.xlsx,.xls,.csv' : '.pdf,.png,.jpg,.jpeg';

  // Tags that actually appear in the current file list
  const presentTags = useMemo(() => {
    const set = new Set();
    files.forEach(f => parseTags(f.tags).forEach(t => set.add(t)));
    return [...set].sort((a, b) => {
      const order = TAB_TAGS[tab] || [];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [files, tab]);

  const readableCount   = useMemo(() => files.filter(f => f.textContent).length, [files]);
  const unreadableCount = useMemo(() => files.filter(f => !f.textContent && f.originalName.split('.').pop()?.toLowerCase() === 'pdf').length, [files]);

  const visibleFiles = useMemo(() => {
    let result = activeTag ? files.filter(f => parseTags(f.tags).includes(activeTag)) : files;
    if (aiFilter === 'readable')   result = result.filter(f => f.textContent);
    if (aiFilter === 'unreadable') result = result.filter(f => !f.textContent && f.originalName.split('.').pop()?.toLowerCase() === 'pdf');
    return result;
  }, [files, activeTag, aiFilter]);

  async function doUpload(file, tags) {
    const uid  = `${Date.now()}-${Math.random()}`;
    // Never let a failure be silent — say what went wrong and what to do about it.
    const fail = (msg) => setUploadErrors(prev => [...prev, { id: uid, msg }]);

    const tooBig = oversizeMessage(file);
    if (tooBig) { fail(tooBig); return; }

    setUploading(prev => [...prev, { id: uid, name: file.name, pct: null }]);
    const form = new FormData();
    form.append('tab',  tab);
    if (tags?.length) form.append('tags', JSON.stringify(tags));
    try {
      // PDFs and spreadsheets go straight to S3 (25 MB ceiling); everything
      // else still rides in the form body (4 MB, Amplify's front door).
      await appendUpload(form, file, {
        scope: 'project',
        onProgress: (pct) => setUploading(prev => prev.map(u => u.id === uid ? { ...u, pct } : u)),
      });
      setUploading(prev => prev.map(u => u.id === uid ? { ...u, pct: null } : u));
      const res = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: form });
      if (res.ok) {
        // A schedule's milestones are read in steps AFTER the row is saved
        // (park-and-poll); the card stays in "uploading" until they are back.
        const data = await afterUploadReads(projectId, await res.json());
        setFiles(prev => [data.file, ...prev]);
        onFileAdded?.(data.file, data.contractUpdate ?? null, data.scheduleUpdate ?? null, data.designScheduleUpdate ?? null);
      } else {
        fail(await uploadErrorMessage(res, file));
      }
    } catch (e) {
      fail(uploadThrowMessage(e, file));
    }
    setUploading(prev => prev.filter(u => u.id !== uid));
  }

  const handleFiles = useCallback((fileList) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    setPendingFile({ files: arr });
  }, []);

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  async function onModalConfirm({ tags }) {
    const { files: pending } = pendingFile;
    setPendingFile(null);
    if (onBeforeTaggedUpload) {
      const proceed = await onBeforeTaggedUpload(tags, pending);
      if (proceed === false) return;
    }
    pending.forEach(f => doUpload(f, tags));
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const visibleIds = visibleFiles.map(f => f.id);
    const allVisibleSelected = visibleIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach(id => next.delete(id));
      else                    visibleIds.forEach(id => next.add(id));
      return next;
    });
  }

  // Files are archived, never deleted (migration 0076). Only the ones the
  // server really archived leave the list; any that failed stay selected.
  async function archiveSelected() {
    setBulkDeleting(true);
    const ids = [...selected];
    const problems = await Promise.all(ids.map(id => setArchived(`/api/projects/${projectId}/files/${id}`)));
    const done = new Set(ids.filter((_, i) => !problems[i]));
    setFiles(prev => prev.filter(f => !done.has(f.id)));
    done.forEach(id => onFileDeleted?.(id));
    setSelected(new Set(ids.filter(id => !done.has(id))));
    setBulkDeleting(false);
    setAskBulk(false);
    const failed = problems.filter(Boolean);
    if (failed.length) alert(`${failed.length} of ${ids.length} could not be archived and are still selected. ${failed[0]}`);
  }

  const visibleIds          = visibleFiles.map(f => f.id);
  const allVisibleSelected  = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const someVisibleSelected = visibleIds.some(id => selected.has(id));
  const someSelected        = selected.size > 0;

  return (
    <div>
      <ConfirmArchiveModal
        open={askBulk}
        title={`Archive ${selected.size} file${selected.size !== 1 ? 's' : ''}?`}
        body={`They come off this tab. ${KEPT_ON_ARCHIVE_PAGE}`}
        busy={bulkDeleting}
        onCancel={() => setAskBulk(false)}
        onConfirm={archiveSelected}
      />
      {viewingFile && (
        <PdfViewerModal
          file={viewingFile}
          projectId={projectId}
          onClose={() => setViewingFile(null)}
        />
      )}
      {pendingFile && (
        <TagsModal
          fileName={pendingFile.files.length === 1 ? pendingFile.files[0].name : `${pendingFile.files.length} files`}
          tab={tab}
          onConfirm={onModalConfirm}
          onCancel={() => setPendingFile(null)}
        />
      )}

      {/* Drop zone */}
      <div
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragOver={e  => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { e.preventDefault(); setDragging(false); }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors',
          dragging ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
        ].join(' ')}
      >
        <input ref={inputRef} type="file" multiple accept={accept} className="hidden"
          onChange={e => handleFiles(e.target.files)} />
        <svg className={`w-7 h-7 mx-auto mb-2 ${dragging ? 'text-amber-400' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className={`text-sm font-medium ${dragging ? 'text-amber-600' : 'text-slate-500'}`}>
          {dragging ? 'Drop to upload' : 'Drop files here or click to browse'}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {acceptsSpreadsheet ? 'PDF, Excel, CSV' : 'PDF, PNG, JPG'}
        </p>
      </div>

      {/* Upload progress */}
      {uploading.length > 0 && (
        <div className="mt-3 space-y-1">
          {uploading.map(u => (
            <div key={u.id} className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
              <svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              <span className="truncate">{u.name}</span>
              <span className="ml-auto shrink-0 text-amber-500">
                {u.pct == null ? 'Extracting text…' : `Uploading… ${u.pct}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Upload failures — stay on screen until dismissed so nothing fails silently */}
      {uploadErrors.length > 0 && (
        <div className="mt-3 space-y-1">
          {uploadErrors.map(err => (
            <div key={err.id} className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="flex-1">{err.msg}</span>
              <button
                onClick={() => setUploadErrors(prev => prev.filter(e => e.id !== err.id))}
                className="shrink-0 text-red-400 hover:text-red-600 font-bold leading-none"
                title="Dismiss"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Tag filter chips */}
      {files.length > 0 && presentTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-4">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${!activeTag ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
          >
            All
          </button>
          {presentTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(prev => prev === tag ? null : tag)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${activeTag === tag ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
            >
              {tag}
              <span className={`ml-1 ${activeTag === tag ? 'text-amber-100' : 'text-slate-400'}`}>
                {files.filter(f => parseTags(f.tags).includes(tag)).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* AI readability filter */}
      {files.length > 0 && (readableCount > 0 || unreadableCount > 0) && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Ask AI:</span>
          <button
            onClick={() => setAiFilter(prev => prev === 'readable' ? null : 'readable')}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${aiFilter === 'readable' ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
          >
            ● Can read · {readableCount}
          </button>
          {unreadableCount > 0 && (
            <button
              onClick={() => setAiFilter(prev => prev === 'unreadable' ? null : 'unreadable')}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${aiFilter === 'unreadable' ? 'bg-slate-500 border-slate-500 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
            >
              ● Can't read · {unreadableCount}
            </button>
          )}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={el => el && (el.indeterminate = someVisibleSelected && !allVisibleSelected)}
              onChange={toggleAll}
              className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
            />
            {someSelected ? (
              <div className="flex items-center gap-3 flex-1">
                <span className="text-xs font-semibold text-slate-600">{selected.size} selected</span>
                <button
                  onClick={() => setAskBulk(true)}
                  disabled={bulkDeleting}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                >
                  <ArchiveBoxIcon className="w-3 h-3" />
                  {bulkDeleting ? 'Archiving…' : 'Archive'}
                </button>
                <button
                  disabled
                  title="Edit tags — coming soon"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-400 text-xs font-semibold cursor-not-allowed"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                  Edit Tags
                </button>
                <button onClick={() => setSelected(new Set())}
                  className="ml-auto text-xs text-slate-400 hover:text-slate-600">
                  Clear
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-1">
                <span className="text-xs text-slate-400">
                  {activeTag || aiFilter
                    ? `${visibleFiles.length} of ${files.length} file${files.length !== 1 ? 's' : ''}`
                    : `${files.length} file${files.length !== 1 ? 's' : ''}`}
                </span>
                {files.length > 0 && (
                  <span className="text-[10px] text-slate-300">
                    <span className="text-green-500 font-medium">{readableCount}</span> readable by AI
                    {unreadableCount > 0 && <span> · <span className="text-slate-400 font-medium">{unreadableCount}</span> not</span>}
                  </span>
                )}
              </div>
            )}
          </div>

          {visibleFiles.length > 0 ? visibleFiles.map(f => (
            <FileRow
              key={f.id}
              file={f}
              projectId={projectId}
              selected={selected.has(f.id)}
              onToggle={() => toggleSelect(f.id)}
              onView={file => setViewingFile(file)}
            />
          )) : (
            <p className="text-center text-xs text-slate-400 py-6">No files tagged "{activeTag}".</p>
          )}
        </div>
      )}

      {files.length === 0 && uploading.length === 0 && (
        <p className="text-center text-xs text-slate-400 mt-4">No files uploaded yet.</p>
      )}
    </div>
  );
}
