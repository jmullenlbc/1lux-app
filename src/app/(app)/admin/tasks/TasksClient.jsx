'use client';
import { useState, useRef, useEffect } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = [
  { id: 'TODO',        label: 'To Do',       color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  { id: 'IN_REVIEW',   label: 'In Review',   color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
  { id: 'DONE',        label: 'Done',        color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0' },
];

const PRIORITIES = [
  { id: 'URGENT', label: 'Urgent', color: '#ef4444', bg: '#fef2f2' },
  { id: 'HIGH',   label: 'High',   color: '#f97316', bg: '#fff7ed' },
  { id: 'MEDIUM', label: 'Medium', color: '#f59e0b', bg: '#fffbeb' },
  { id: 'LOW',    label: 'Low',    color: '#94a3b8', bg: '#f8fafc' },
];

function getPriority(id) { return PRIORITIES.find(p => p.id === id) || PRIORITIES[2]; }
function getStatus(id)   { return STATUSES.find(s => s.id === id)   || STATUSES[0]; }

function initials(user) {
  if (!user) return '?';
  const name = user.name || user.email || '?';
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function avatarColor(email) {
  const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899'];
  let hash = 0;
  for (const c of (email || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length];
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(iso) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

// ── Task Modal ────────────────────────────────────────────────────────────────

function TaskModal({ task, users, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    title:       task?.title       || '',
    description: task?.description || '',
    status:      task?.status      || 'TODO',
    priority:    task?.priority    || 'MEDIUM',
    assigneeId:  task?.assigneeId  || '',
    dueDate:     task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave({ ...form, assigneeId: form.assigneeId || null, dueDate: form.dueDate || null });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this task?')) return;
    setDeleting(true);
    await onDelete(task.id);
    setDeleting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{task ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Title *</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Task title..."
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Description</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
              rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Details, notes, acceptance criteria..."
            />
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Status</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Priority</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              >
                {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Assignee + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Assignee</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                value={form.assigneeId}
                onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Due Date</label>
              <input
                type="date"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          {task ? (
            <button onClick={handleDelete} disabled={deleting}
              className="text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">
              {deleting ? 'Deleting…' : 'Delete task'}
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !form.title.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onEdit, onStatusChange }) {
  const priority = getPriority(task.priority);
  const overdue  = isOverdue(task.dueDate) && task.status !== 'DONE';

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-3 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer group"
      onClick={() => onEdit(task)}
    >
      {/* Priority + Actions */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ color: priority.color, backgroundColor: priority.bg }}
        >
          {priority.label}
        </span>
        <select
          className="text-[10px] text-slate-400 border-0 bg-transparent cursor-pointer focus:outline-none opacity-0 group-hover:opacity-100 transition-opacity"
          value={task.status}
          onClick={e => e.stopPropagation()}
          onChange={e => { e.stopPropagation(); onStatusChange(task.id, e.target.value); }}
        >
          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Title */}
      <p className={`text-sm font-medium leading-snug mb-2 ${task.status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
        {task.title}
      </p>

      {/* Description preview */}
      {task.description && (
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 mb-2">{task.description}</p>
      )}

      {/* Footer: assignee + due date */}
      <div className="flex items-center justify-between mt-2">
        {task.assignee ? (
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
              style={{ backgroundColor: avatarColor(task.assignee.email) }}
            >
              {initials(task.assignee)}
            </div>
            <span className="text-[10px] text-slate-400">{task.assignee.name || task.assignee.email.split('@')[0]}</span>
          </div>
        ) : (
          <div />
        )}
        {task.dueDate && (
          <span className={`text-[10px] font-medium ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
            {overdue ? '⚠ ' : ''}{fmtDate(task.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

function KanbanColumn({ status, tasks, users, onEdit, onStatusChange, onAddNew }) {
  const s = getStatus(status);
  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] flex-1">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full border"
            style={{ color: s.color, backgroundColor: s.bg, borderColor: s.border }}
          >
            {s.label}
          </span>
          <span className="text-xs text-slate-400 font-medium">{tasks.length}</span>
        </div>
        <button
          onClick={() => onAddNew(status)}
          className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
          title={`Add task to ${s.label}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Cards */}
      <div className="space-y-2 flex-1">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} onEdit={onEdit} onStatusChange={onStatusChange} />
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-6 text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TasksClient({ tasks: initialTasks, users, currentUser }) {
  const [tasks,       setTasks]       = useState(initialTasks);
  const [modal,       setModal]       = useState(null);   // null | { task?: Task, defaultStatus?: string }
  const [filter,      setFilter]      = useState('ALL'); // ALL | MY
  const [search,      setSearch]      = useState('');

  // Derived
  const filtered = tasks.filter(t => {
    if (filter === 'MY' && t.assigneeId !== currentUser.id) return false;
    if (search.trim() && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !(t.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const byStatus = (status) => filtered.filter(t => t.status === status);

  async function handleCreate(data) {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { alert('Failed to create task'); return; }
    const task = await res.json();
    setTasks(ts => [task, ...ts]);
    setModal(null);
  }

  async function handleUpdate(data) {
    const taskId = modal.task.id;
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { alert('Failed to update task'); return; }
    const updated = await res.json();
    setTasks(ts => ts.map(t => t.id === taskId ? updated : t));
    setModal(null);
  }

  async function handleDelete(taskId) {
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete task'); return; }
    setTasks(ts => ts.filter(t => t.id !== taskId));
    setModal(null);
  }

  async function handleStatusChange(taskId, status) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    setTasks(ts => ts.map(t => t.id === taskId ? updated : t));
  }

  function openCreate(defaultStatus = 'TODO') {
    setModal({ task: null, defaultStatus });
  }

  function openEdit(task) {
    setModal({ task });
  }

  return (
    <div className="px-6 py-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track work, assign priorities, move things forward.</p>
        </div>
        <button
          onClick={() => openCreate()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Search tasks…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-200 w-52"
        />
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'ALL', label: 'All Tasks' },
            { id: 'MY',  label: 'My Tasks'  },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filter === f.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-400">
          {filtered.length} task{filtered.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
        {STATUSES.map(s => (
          <KanbanColumn
            key={s.id}
            status={s.id}
            tasks={byStatus(s.id)}
            users={users}
            onEdit={openEdit}
            onStatusChange={handleStatusChange}
            onAddNew={openCreate}
          />
        ))}
      </div>

      {/* Modal */}
      {modal !== null && (
        <TaskModal
          task={modal.task}
          users={users}
          onSave={modal.task ? handleUpdate : data => handleCreate({ ...data, status: data.status || modal.defaultStatus })}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
