'use client';
import { useState, useRef, useCallback } from 'react';

const STATUS = {
  done: { label: 'Done',        dot: 'bg-green-500',  text: 'text-green-700',  pill: 'bg-green-50 border-green-200' },
  wip:  { label: 'In Progress', dot: 'bg-amber-500',  text: 'text-amber-700',  pill: 'bg-amber-50 border-amber-200' },
  todo: { label: 'Not Started', dot: 'bg-slate-300',  text: 'text-slate-500',  pill: 'bg-slate-50 border-slate-200' },
};
const CYCLE = { todo: 'wip', wip: 'done', done: 'todo' };

function DragHandle() {
  return (
    <div className="shrink-0 text-slate-300 group-hover:text-slate-400 transition-colors">
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M9 4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9 12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9 19.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM18 4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM18 12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM18 19.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
      </svg>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export default function PriorityStack({ initialPriorities = [] }) {
  const [items, setItems]           = useState(initialPriorities);
  const [newName, setNewName]       = useState('');
  const [dragIdx, setDragIdx]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const reorderTimer = useRef(null);

  const scheduleReorder = useCallback((orderedItems) => {
    clearTimeout(reorderTimer.current);
    reorderTimer.current = setTimeout(() => {
      fetch('/api/roadmap-priorities/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: orderedItems.map(i => i.id) }),
      });
    }, 400);
  }, []);

  const move = (idx, dir) => {
    const t = idx + dir;
    if (t < 0 || t >= items.length) return;
    const next = [...items];
    [next[idx], next[t]] = [next[t], next[idx]];
    setItems(next);
    scheduleReorder(next);
  };

  const onDrop = (idx) => {
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...items];
    const [m] = next.splice(dragIdx, 1);
    next.splice(idx, 0, m);
    setItems(next);
    setDragIdx(null);
    scheduleReorder(next);
  };

  const add = async () => {
    if (!newName.trim()) return;
    const tempId = '__tmp_' + Date.now();
    const optimistic = { id: tempId, name: newName.trim(), status: 'todo', sortOrder: items.length };
    setItems(prev => [...prev, optimistic]);
    setNewName('');
    const res = await fetch('/api/roadmap-priorities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: optimistic.name }),
    });
    if (res.ok) {
      const created = await res.json();
      setItems(prev => prev.map(i => i.id === tempId ? created : i));
    } else {
      setItems(prev => prev.filter(i => i.id !== tempId));
    }
  };

  const cycle = async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const newStatus = CYCLE[item.status];
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
    await fetch(`/api/roadmap-priorities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
  };

  const doneCount = items.filter(i => i.status === 'done').length;
  const wipCount  = items.filter(i => i.status === 'wip').length;

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
            <h2 className="text-sm font-bold text-slate-800">Build Priorities</h2>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span><span className="text-green-600 font-semibold">{doneCount}</span> done</span>
            <span><span className="text-amber-500 font-semibold">{wipCount}</span> in progress</span>
            <span><span className="text-slate-600 font-semibold">{items.length}</span> total</span>
          </div>
        </div>

        {/* Add row */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Add a priority…"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white"
          />
          <button
            onClick={add}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors shrink-0"
          >
            + Add
          </button>
        </div>

        {/* List */}
        <div className="divide-y divide-slate-200">
          {items.map((it, idx) => {
            const cfg = STATUS[it.status] ?? STATUS.todo;
            const isDragging = dragIdx === idx;
            return (
              <div
                key={it.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                onDragEnd={() => setDragIdx(null)}
                className={`group flex items-center gap-2.5 px-4 py-2 cursor-grab transition-colors ${
                  isDragging ? 'bg-amber-50' : 'hover:bg-slate-50'
                } ${it.id.startsWith('__tmp_') ? 'opacity-50' : ''}`}
              >
                {/* Rank number */}
                <span className="w-6 shrink-0 text-sm font-bold text-slate-400 font-mono text-right leading-none">{idx + 1}</span>

                {/* Drag handle */}
                <DragHandle />

                {/* Name */}
                <span className="flex-1 text-sm text-slate-700 leading-snug">{it.name}</span>

                {/* Status pill */}
                <button
                  onClick={() => cycle(it.id)}
                  title="Click to cycle status"
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-70 shrink-0 ${cfg.pill} ${cfg.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                  {cfg.label}
                </button>

                {/* Delete */}
                <button
                  onClick={() => setDeleteTarget({ id: it.id, name: it.name })}
                  title="Remove"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}

          {items.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-6">No priorities yet.</p>
          )}
        </div>

      </div>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-red-500">
                  <TrashIcon />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Remove priority?</p>
                  <p className="text-sm text-slate-500 mt-0.5 leading-snug">&ldquo;{deleteTarget.name}&rdquo; will be permanently deleted.</p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const { id } = deleteTarget;
                  setDeleteTarget(null);
                  setItems(prev => prev.filter(i => i.id !== id));
                  await fetch(`/api/roadmap-priorities/${id}`, { method: 'DELETE' });
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
