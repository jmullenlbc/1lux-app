'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import FixtureImportModal from './FixtureImportModal';
import PushToBidModal from './PushToBidModal';

const COLUMNS = [
  { key: 'type',          label: 'Type',         width: 'w-20'  },
  { key: 'location',      label: 'Location',     width: 'w-28'  },
  { key: 'description',   label: 'Description',  width: 'w-48'  },
  { key: 'manufacturer',  label: 'Mfr',          width: 'w-24'  },
  { key: 'catalogNumber', label: 'Catalog #',    width: 'w-32'  },
  { key: 'finish',        label: 'Finish',       width: 'w-20'  },
  { key: 'cct',           label: 'CCT',          width: 'w-16'  },
  { key: 'lumens',        label: 'Lumens',       width: 'w-20'  },
  { key: 'wattage',       label: 'Watts',        width: 'w-16'  },
  { key: 'voltage',       label: 'Voltage',      width: 'w-16'  },
  { key: 'dimming',       label: 'Dimming',      width: 'w-20'  },
  { key: 'mounting',      label: 'Mounting',     width: 'w-20'  },
  { key: 'notes',         label: 'Notes',        width: 'w-40'  },
];

const AI_SERVICE_TYPES = ['peerReview', 'bidOnly'];

function VersionBadge({ version, state, publishedAt }) {
  if (state === 'DRAFT') {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        Draft
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      v{version} · {new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
    </span>
  );
}

function Cell({ value, colKey, readOnly, isAlternate, onSave }) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setLocal(value ?? ''); }, [value]);

  function startEdit() {
    if (readOnly) return;
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    const trimmed = local.trim();
    if (trimmed !== (value ?? '').trim()) onSave(trimmed || null);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="w-full h-full px-1.5 py-1 text-xs bg-blue-50 border border-blue-300 rounded outline-none"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setLocal(value ?? ''); setEditing(false); }
        }}
      />
    );
  }

  // Type cell gets special treatment for alternates
  if (colKey === 'type' && isAlternate) {
    return (
      <div
        className={`px-1.5 py-1 text-xs flex items-center gap-1.5 min-h-[28px] ${readOnly ? '' : 'cursor-text hover:bg-slate-50'}`}
        onClick={startEdit}
        title={local || ''}
      >
        <span className="ml-3 text-slate-500 truncate">{local || <span className="italic text-slate-300">—</span>}</span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 uppercase tracking-wide shrink-0">ALT</span>
      </div>
    );
  }

  return (
    <div
      className={`px-1.5 py-1 text-xs truncate rounded min-h-[28px] ${readOnly ? 'text-slate-600' : 'cursor-text hover:bg-slate-50 text-slate-700'} ${!local ? 'text-slate-300' : ''}`}
      onClick={startEdit}
      title={local || ''}
    >
      {local || (readOnly ? '—' : <span className="italic text-slate-300">—</span>)}
    </div>
  );
}

function DragHandle({ dragging }) {
  return (
    <div className={`cursor-grab active:cursor-grabbing flex items-center justify-center w-5 text-slate-300 hover:text-slate-500 ${dragging ? 'text-blue-400' : ''}`}>
      <svg viewBox="0 0 10 16" className="w-2.5 h-4 fill-current">
        <circle cx="3" cy="2"  r="1.5" />
        <circle cx="7" cy="2"  r="1.5" />
        <circle cx="3" cy="6"  r="1.5" />
        <circle cx="7" cy="6"  r="1.5" />
        <circle cx="3" cy="10" r="1.5" />
        <circle cx="7" cy="10" r="1.5" />
        <circle cx="3" cy="14" r="1.5" />
        <circle cx="7" cy="14" r="1.5" />
      </svg>
    </div>
  );
}

// ── Parse from PDF modal ──────────────────────────────────────────────────────
function ParseFromPdfModal({ projectId, onParsed, onClose }) {
  const [file,     setFile]     = useState(null);
  const [parsing,  setParsing]  = useState(false);
  const [error,    setError]    = useState(null);
  const fileRef = useRef(null);

  async function doParse() {
    if (!file) return;
    setParsing(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch(`/api/projects/${projectId}/fixture-schedule/parse`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (data.error && data.importedCount === 0) {
        setError(data.error);
        setParsing(false);
        return;
      }
      onParsed({ importedCount: data.importedCount || 0, flaggedCount: data.flaggedCount || 0 });
    } catch (e) {
      setError(e.message || 'Parse failed');
      setParsing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Parse Fixture Schedule from PDF</h2>
            <p className="text-xs text-slate-400 mt-0.5">Upload 1–3 pages containing the fixture schedule table</p>
          </div>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose} disabled={parsing}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => !parsing && fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 transition-colors ${
              parsing  ? 'border-blue-200 bg-blue-50 pointer-events-none' :
              file     ? 'border-green-300 bg-green-50 cursor-pointer' :
                         'border-slate-200 hover:border-slate-400 hover:bg-slate-50 cursor-pointer'
            }`}
          >
            {parsing ? (
              <>
                <svg className="animate-spin w-7 h-7 text-blue-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
                <p className="text-sm font-medium text-blue-700">Parsing with AI…</p>
                <p className="text-xs text-blue-500">This may take 15–30 seconds</p>
              </>
            ) : file ? (
              <>
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm font-semibold text-slate-800 truncate max-w-full px-4 text-center">{file.name}</p>
                <p className="text-xs text-slate-400">Click to change file</p>
              </>
            ) : (
              <>
                <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-slate-600">Drop PDF or click to browse</p>
                <p className="text-xs text-slate-400">PDF only · max 3 pages</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={e => { if (e.target.files[0]) { setFile(e.target.files[0]); setError(null); } e.target.value = ''; }}
            />
          </div>

          <p className="text-xs text-slate-400">
            Extract just the fixture schedule pages from the full drawing set in Bluebeam or Acrobat before uploading.
            The AI will map each row to ILC's canonical fixture schedule columns.
          </p>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600">{error}</div>
          )}

          <div className="flex justify-end gap-3">
            <button
              className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={onClose}
              disabled={parsing}
            >
              Cancel
            </button>
            <button
              className="text-sm px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2"
              onClick={doParse}
              disabled={!file || parsing}
            >
              {parsing && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle className="opacity-25" cx="12" cy="12" r="10"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
              )}
              {parsing ? 'Parsing…' : 'Parse'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FixtureScheduleEditor({ projectId, serviceType }) {
  const [draft,         setDraft]         = useState(null);
  const [published,     setPublished]     = useState([]);
  const [selectedId,    setSelectedId]    = useState('draft');
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState(null);
  const [showInternal,  setShowInternal]  = useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [showPush,      setShowPush]      = useState(false);
  const [showParse,     setShowParse]     = useState(false);
  const [parseBanner,   setParseBanner]   = useState(null); // { importedCount, flaggedCount }
  const [dragOverId,    setDragOverId]    = useState(null);
  const dragItemId = useRef(null);

  const isAiServiceType = AI_SERVICE_TYPES.includes(serviceType);
  const activeSchedule  = selectedId === 'draft' ? draft : published.find(p => p.id === selectedId);
  const isReadOnly      = selectedId !== 'draft';

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/fixture-schedule`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setDraft(data.draft);
      setPublished(data.published);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]);

  async function addRow() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/fixture-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to add row');
      const item = await res.json();
      setDraft(prev => ({ ...prev, items: [...prev.items, item] }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveCell(itemId, field, value) {
    try {
      const body = { [field]: value };
      // When user edits any cell on a flagged row, clear the ai flag
      const item = draft?.items?.find(i => i.id === itemId);
      if (item?.aiFlagged) body.aiFlagged = false;

      const res = await fetch(`/api/projects/${projectId}/fixture-schedule/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      const updated = await res.json();
      setDraft(prev => ({
        ...prev,
        items: prev.items.map(i => i.id === itemId ? { ...i, ...updated } : i),
      }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteRow(itemId) {
    if (!confirm('Delete this row?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/fixture-schedule/items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setDraft(prev => ({ ...prev, items: prev.items.filter(i => i.id !== itemId) }));
    } catch (e) {
      setError(e.message);
    }
  }

  // ── Drag-to-reorder ───────────────────────────────────────────────────────

  function onDragStart(e, itemId) {
    dragItemId.current = itemId;
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e, itemId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(itemId);
  }

  function onDragLeave() { setDragOverId(null); }

  async function onDrop(e, targetId) {
    e.preventDefault();
    setDragOverId(null);
    const srcId = dragItemId.current;
    if (!srcId || srcId === targetId) return;

    const items = [...(draft?.items ?? [])];
    const srcIdx = items.findIndex(i => i.id === srcId);
    const tgtIdx = items.findIndex(i => i.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const [moved] = items.splice(srcIdx, 1);
    items.splice(tgtIdx, 0, moved);
    const reordered = items.map((item, idx) => ({ ...item, sortOrder: idx }));
    setDraft(prev => ({ ...prev, items: reordered }));

    try {
      await fetch(`/api/projects/${projectId}/fixture-schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder: reordered.map(i => ({ id: i.id, sortOrder: i.sortOrder })) }),
      });
    } catch {
      load();
    }
  }

  function onDragEnd() {
    dragItemId.current = null;
    setDragOverId(null);
  }

  // ── After AI parse ────────────────────────────────────────────────────────

  async function handleParsed({ importedCount, flaggedCount }) {
    setShowParse(false);
    setParseBanner({ importedCount, flaggedCount });
    await load(); // reload table with AI-parsed rows
    setSelectedId('draft');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Loading fixture schedule…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
        {error} <button className="underline ml-2" onClick={load}>Retry</button>
      </div>
    );
  }

  const items = activeSchedule?.items ?? [];
  const flaggedCount = items.filter(i => i.aiFlagged).length;
  const visibleCols = showInternal
    ? [...COLUMNS, { key: 'internalNotes', label: 'Internal Notes', width: 'w-40' }]
    : COLUMNS;

  return (
    <div className="space-y-4">

      {/* ── Parse banner ───────────────────────────────────────────────────── */}
      {parseBanner && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              <strong>{parseBanner.importedCount}</strong> fixture{parseBanner.importedCount !== 1 ? 's' : ''} imported.
              {parseBanner.flaggedCount > 0 && (
                <span className="text-amber-700"> <strong>{parseBanner.flaggedCount}</strong> row{parseBanner.flaggedCount !== 1 ? 's' : ''} flagged for review.</span>
              )}
            </span>
          </div>
          <button className="text-blue-400 hover:text-blue-600" onClick={() => setParseBanner(null)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Flagged rows warning ────────────────────────────────────────────── */}
      {!isReadOnly && flaggedCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span><strong>{flaggedCount}</strong> row{flaggedCount !== 1 ? 's' : ''} flagged for review — highlighted in amber below. Edit any cell to clear the flag.</span>
        </div>
      )}

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
          >
            <option value="draft">Draft (current)</option>
            {published.map(p => (
              <option key={p.id} value={p.id}>
                v{p.version} · {new Date(p.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {p.submissionTag ? ` · ${p.submissionTag}` : ''}
              </option>
            ))}
          </select>

          {activeSchedule && (
            <VersionBadge
              version={activeSchedule.version}
              state={activeSchedule.state}
              publishedAt={activeSchedule.publishedAt}
            />
          )}

          {isReadOnly && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
              Read-only snapshot
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            onClick={() => setShowInternal(v => !v)}
          >
            {showInternal ? 'Hide' : 'Show'} Internal Notes
          </button>

          <a
            href={`/api/projects/${projectId}/fixture-schedule/export?version=${isReadOnly ? activeSchedule?.version : 'draft'}`}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5 no-underline"
            download
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export
          </a>

          {!isReadOnly && (
            <button
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
              onClick={() => setShowImport(true)}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Import
            </button>
          )}

          {/* Parse from PDF — only for Peer Review / Bid Only */}
          {!isReadOnly && isAiServiceType && (
            <button
              className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
              onClick={() => setShowParse(true)}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .3 2.7-1.17 2.7H3.97c-1.47 0-2.17-1.7-1.17-2.7L5 14.5" />
              </svg>
              Parse from PDF
            </button>
          )}

          {!isReadOnly && (
            <>
              <button
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                onClick={addRow}
                disabled={saving}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Row
              </button>

              <button
                className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                disabled={items.length === 0}
                onClick={() => setShowPush(true)}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
                Push to Bid
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {items.length === 0 && !loading && (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 flex flex-col items-center gap-4 text-center px-8">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </div>
          {isReadOnly ? (
            <p className="text-sm text-slate-400">No items in this version</p>
          ) : isAiServiceType ? (
            <>
              <p className="text-sm text-slate-600 font-medium">No fixtures yet</p>
              <p className="text-xs text-slate-400 max-w-xs">Upload a fixture schedule PDF to auto-populate this table, or add fixtures manually.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowParse(true)}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                >
                  Parse from PDF
                </button>
                <button
                  onClick={addRow}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"
                >
                  + Add Fixture
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 font-medium">No fixtures yet</p>
              <p className="text-xs text-slate-400">Add your first fixture type to get started.</p>
              <button
                onClick={addRow}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors"
              >
                + Add Fixture
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {!isReadOnly && <th className="w-7 px-1" />}
                {visibleCols.map(col => (
                  <th
                    key={col.key}
                    className={`${col.width} px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap`}
                  >
                    {col.label}
                  </th>
                ))}
                {!isReadOnly && <th className="w-7 px-1" />}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const rowBg = item.aiFlagged
                  ? 'bg-amber-50 border-amber-100'
                  : dragOverId === item.id
                    ? 'bg-blue-50 border-slate-100'
                    : idx % 2 === 0
                      ? 'bg-white border-slate-100'
                      : 'bg-slate-50/50 border-slate-100';

                return (
                  <tr
                    key={item.id}
                    className={`border-b last:border-0 transition-colors ${rowBg}`}
                    draggable={!isReadOnly}
                    onDragStart={e => onDragStart(e, item.id)}
                    onDragOver={e => onDragOver(e, item.id)}
                    onDragLeave={onDragLeave}
                    onDrop={e => onDrop(e, item.id)}
                    onDragEnd={onDragEnd}
                  >
                    {!isReadOnly && (
                      <td className="w-7 px-1 py-1">
                        <DragHandle dragging={dragItemId.current === item.id} />
                      </td>
                    )}
                    {visibleCols.map(col => (
                      <td key={col.key} className={`${col.width} px-0.5 py-0.5`}>
                        {/* Warning icon on Type cell for low-confidence flagged rows */}
                        {col.key === 'type' && item.aiFlagged ? (
                          <div className="flex items-center gap-1">
                            <span title={`AI confidence: ${item.aiConfidence != null ? Math.round(item.aiConfidence * 100) + '%' : 'low'}`}>
                              <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                              </svg>
                            </span>
                            <Cell
                              value={item[col.key]}
                              colKey={col.key}
                              readOnly={isReadOnly}
                              isAlternate={item.isAlternate}
                              onSave={val => saveCell(item.id, col.key, val)}
                            />
                          </div>
                        ) : (
                          <Cell
                            value={item[col.key]}
                            colKey={col.key}
                            readOnly={isReadOnly}
                            isAlternate={item.isAlternate}
                            onSave={val => saveCell(item.id, col.key, val)}
                          />
                        )}
                      </td>
                    ))}
                    {!isReadOnly && (
                      <td className="w-7 px-1 py-1">
                        <button
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                          onClick={() => deleteRow(item.id)}
                          title="Delete row"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {!isReadOnly && items.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>{items.length} row{items.length !== 1 ? 's' : ''} · Click any cell to edit · Drag handle to reorder</span>
          <button
            className="text-purple-500 hover:text-purple-700 font-medium transition-colors"
            onClick={addRow}
            disabled={saving}
          >
            + Add another row
          </button>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showImport && (
        <FixtureImportModal
          projectId={projectId}
          onImported={updatedDraft => {
            setDraft(updatedDraft);
            setSelectedId('draft');
            setShowImport(false);
          }}
          onClose={() => setShowImport(false)}
        />
      )}

      {showPush && (
        <PushToBidModal
          projectId={projectId}
          itemCount={items.length}
          onPushed={({ draft: newDraft, bidMatrix }) => {
            setDraft(newDraft);
            setPublished(prev => [{ ...bidMatrix, _isBid: true }, ...prev]);
            setShowPush(false);
            load();
          }}
          onClose={() => setShowPush(false)}
        />
      )}

      {showParse && (
        <ParseFromPdfModal
          projectId={projectId}
          onParsed={handleParsed}
          onClose={() => setShowParse(false)}
        />
      )}
    </div>
  );
}
