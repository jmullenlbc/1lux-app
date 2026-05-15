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

function Cell({ value, colKey, readOnly, onSave }) {
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
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setLocal(value ?? ''); setEditing(false); } }}
      />
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

export default function FixtureScheduleEditor({ projectId }) {
  const [draft,         setDraft]         = useState(null);
  const [published,     setPublished]     = useState([]);
  const [selectedId,    setSelectedId]    = useState('draft');
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState(null);
  const [showInternal,  setShowInternal]  = useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [showPush,      setShowPush]      = useState(false);
  const [dragOverId,    setDragOverId]    = useState(null);
  const dragItemId = useRef(null);

  const activeSchedule = selectedId === 'draft' ? draft : published.find(p => p.id === selectedId);
  const isReadOnly = selectedId !== 'draft';

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
      const res = await fetch(`/api/projects/${projectId}/fixture-schedule/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
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

  function onDragLeave() {
    setDragOverId(null);
  }

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
      load(); // revert on error
    }
  }

  function onDragEnd() {
    dragItemId.current = null;
    setDragOverId(null);
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
  const visibleCols = showInternal
    ? [...COLUMNS, { key: 'internalNotes', label: 'Internal Notes', width: 'w-40' }]
    : COLUMNS;

  return (
    <div className="space-y-4">
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Version selector */}
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

      {/* ── Table ──────────────────────────────────────────────────────────── */}
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
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={visibleCols.length + (isReadOnly ? 0 : 2)}
                  className="py-16 text-center text-sm text-slate-400"
                >
                  {isReadOnly
                    ? 'No items in this version'
                    : 'No rows yet — click Add Row to start building the fixture schedule'}
                </td>
              </tr>
            )}
            {items.map((item, idx) => (
              <tr
                key={item.id}
                className={`border-b border-slate-100 last:border-0 transition-colors
                  ${dragOverId === item.id ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                `}
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
                    <Cell
                      value={item[col.key]}
                      colKey={col.key}
                      readOnly={isReadOnly}
                      onSave={val => saveCell(item.id, col.key, val)}
                    />
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
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {!isReadOnly && (
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

      {/* ── Import modal ───────────────────────────────────────────────────── */}
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
            // Reload to get accurate published list from server
            load();
          }}
          onClose={() => setShowPush(false)}
        />
      )}
    </div>
  );
}
