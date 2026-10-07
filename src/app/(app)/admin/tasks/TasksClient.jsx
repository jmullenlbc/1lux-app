'use client';
import { useState, useRef } from 'react';

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

// Menu-based tag groups
const TAG_GROUPS = [
  { group: 'Home',     color: '#3b82f6', tags: ['Overview', 'Projects', 'Knowledge Base'] },
  { group: 'CRM',      color: '#8b5cf6', tags: ['Clients', 'Pipeline', 'Dashboards', 'Sales Notes'] },
  { group: 'Pre-con',  color: '#f59e0b', tags: ['Manufacturers', 'Sales Reps', 'Products'] },
  { group: 'Software', color: '#10b981', tags: ['Changelog', 'Roadmap', 'Tasks'] },
  { group: 'Settings', color: '#64748b', tags: ['Profile', 'Master Pricing', 'Users'] },
  { group: 'General',  color: '#ef4444', tags: ['Construction', 'Design', 'Finance', 'Bug', 'Enhancement'] },
];

const ALL_TAGS = TAG_GROUPS.flatMap(g => g.tags.map(t => ({ tag: t, group: g.group, color: g.color })));
function tagMeta(tag) { return ALL_TAGS.find(t => t.tag === tag) || { tag, group: '', color: '#94a3b8' }; }

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
function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function isOverdue(iso) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

// ── Tag selector ──────────────────────────────────────────────────────────────

function TagSelector({ selected, onChange }) {
  return (
    <div className="space-y-2.5">
      {TAG_GROUPS.map(g => (
        <div key={g.group}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: g.color }}>
            {g.group}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.tags.map(tag => {
              const active = selected.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onChange(active ? selected.filter(t => t !== tag) : [...selected, tag])}
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all"
                  style={active
                    ? { backgroundColor: g.color, color: '#fff', borderColor: g.color }
                    : { backgroundColor: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Attachment row ────────────────────────────────────────────────────────────

function AttachmentRow({ att, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const url      = `/api/uploads/${att.storedPath.replace(/\\/g, '/')}`;
  const isImage  = att.mimeType?.startsWith('image/');
  const isPdf    = att.mimeType === 'application/pdf';
  const isExcel  = att.mimeType?.includes('spreadsheet') || att.mimeType?.includes('excel') || att.originalName?.match(/\.xlsx?$/i);

  async function handleDelete() {
    if (!confirm(`Remove "${att.originalName}"?`)) return;
    setDeleting(true);
    await fetch(`/api/tasks/attachments/${att.id}`, { method: 'DELETE' });
    onDelete(att.id);
  }

  const icon = isImage ? '🖼' : isPdf ? '📄' : isExcel ? '📊' : '📎';

  return (
    <div className="group flex items-center gap-2.5 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
      <span className="text-base shrink-0">{icon}</span>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex-1 min-w-0 text-xs font-medium text-slate-700 hover:text-blue-600 truncate">
        {att.originalName}
      </a>
      <span className="text-[10px] text-slate-400 shrink-0">{fmtBytes(att.size)}</span>
      <button onClick={handleDelete} disabled={deleting}
        className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-slate-300 hover:text-red-500 transition-all">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
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
    tags:        task ? (() => { try { return JSON.parse(task.tags || '[]'); } catch { return []; } })() : [],
  });
  const [attachments, setAttachments] = useState(task?.attachments || []);
  const [uploading,   setUploading]   = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const fileRef = useRef(null);

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave({ ...form, assigneeId: form.assigneeId || null, dueDate: form.dueDate || null });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this task? Attachments will also be removed.')) return;
    setDeleting(true);
    await onDelete(task.id);
    setDeleting(false);
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !task) return;
    setUploading(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/tasks/${task.id}/attachments`, { method: 'POST', body: fd });
      if (res.ok) {
        const { attachment } = await res.json();
        setAttachments(a => [...a, attachment]);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleDeleteAttachment(id) {
    setAttachments(a => a.filter(x => x.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-8 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-auto mb-8">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{task ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Title *</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Task title…" autoFocus />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Description</label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
              rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Details, notes, acceptance criteria…" />
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Priority</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Assignee + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assignee</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                value={form.assigneeId} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}>
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Due Date</label>
              <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tags</label>
            <TagSelector selected={form.tags} onChange={tags => setForm(f => ({ ...f, tags }))} />
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Attachments</label>
            {attachments.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {attachments.map(att => (
                  <AttachmentRow key={att.id} att={att} onDelete={handleDeleteAttachment} />
                ))}
              </div>
            )}
            {task ? (
              <label className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-2 border-dashed border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 cursor-pointer transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                <input ref={fileRef} type="file" className="sr-only" multiple
                  accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
                  onChange={handleFileChange} disabled={uploading} />
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
                <span className="text-sm text-slate-500">
                  {uploading ? 'Uploading…' : 'Attach files — PDF, Excel, JPG, PNG'}
                </span>
              </label>
            ) : (
              <p className="text-xs text-slate-400 italic">Save the task first, then you can add attachments.</p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          {task ? (
            <button onClick={() => setDeleteConfirm(task.id)} disabled={deleting}
              className="text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Delete task'}
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title.trim()}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50">
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
  const tags     = (() => { try { return JSON.parse(task.tags || '[]'); } catch { return []; } })();
  const attCount = task.attachments?.length || 0;

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-3 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer group"
      onClick={() => onEdit(task)}
    >
      {/* Priority + status change */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ color: priority.color, backgroundColor: priority.bg }}>
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
      <p className={`text-sm font-medium leading-snug mb-1.5 ${task.status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
        {task.title}
      </p>

      {/* Description preview */}
      {task.description && (
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 mb-2">{task.description}</p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.slice(0, 3).map(tag => {
            const m = tagMeta(tag);
            return (
              <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: m.color + '20', color: m.color }}>
                {tag}
              </span>
            );
          })}
          {tags.length > 3 && (
            <span className="text-[9px] text-slate-400">+{tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer: assignee + attachments + due date */}
      <div className="flex items-center justify-between mt-1 gap-2">
        <div className="flex items-center gap-2">
          {task.assignee ? (
            <div className="flex items-center gap-1">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                style={{ backgroundColor: avatarColor(task.assignee.email) }}>
                {initials(task.assignee)}
              </div>
              <span className="text-[10px] text-slate-400">{(task.assignee.name || task.assignee.email).split(' ')[0]}</span>
            </div>
          ) : null}
          {attCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
              {attCount}
            </span>
          )}
        </div>
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
      <div className="flex items-center justify-between px-3 py-2.5 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full border"
            style={{ color: s.color, backgroundColor: s.bg, borderColor: s.border }}>
            {s.label}
          </span>
          <span className="text-xs text-slate-400 font-medium">{tasks.length}</span>
        </div>
        <button onClick={() => onAddNew(status)}
          className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
          title={`Add to ${s.label}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
      <div className="space-y-2 flex-1">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} onEdit={onEdit} onStatusChange={onStatusChange} />
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-6 text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">No tasks</div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TasksClient({ tasks: initialTasks, users, currentUser }) {
  const [tasks,  setTasks]  = useState(initialTasks);
  const [modal,  setModal]  = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = tasks.filter(t => {
    if (filter === 'MY' && t.assigneeId !== currentUser.id) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const tags = (() => { try { return JSON.parse(t.tags || '[]'); } catch { return []; } })();
      if (!t.title.toLowerCase().includes(q) &&
          !(t.description || '').toLowerCase().includes(q) &&
          !tags.some(tag => tag.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const byStatus = (status) => filtered.filter(t => t.status === status);

  async function handleCreate(data) {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, tags: data.tags || [] }),
    });
    if (!res.ok) { alert('Failed to create task'); return; }
    const task = await res.json();
    setTasks(ts => [task, ...ts]);
    // Re-open the modal in edit mode so user can add attachments immediately
    setModal({ task });
  }

  async function handleUpdate(data) {
    const taskId = modal.task.id;
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, tags: data.tags || [] }),
    });
    if (!res.ok) { alert('Failed to update task'); return; }
    const updated = await res.json();
    setTasks(ts => ts.map(t => t.id === taskId ? updated : t));
    setModal(null);
  }

  async function handleDelete(taskId) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) { alert('Failed to delete task'); return; }
      setTasks(ts => ts.filter(t => t.id !== taskId));
      setModal(null);
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
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

  return (
    <div className="px-6 py-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track work, assign priorities, move things forward.</p>
        </div>
        <button onClick={() => setModal({ task: null, defaultStatus: 'TODO' })}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input type="text" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-200 w-52" />
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[{ id: 'ALL', label: 'All Tasks' }, { id: 'MY', label: 'My Tasks' }].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filter === f.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>{f.label}</button>
          ))}
        </div>
        <span className="text-xs text-slate-400">{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
        {STATUSES.map(s => (
          <KanbanColumn key={s.id} status={s.id} tasks={byStatus(s.id)} users={users}
            onEdit={t => setModal({ task: t })}
            onStatusChange={handleStatusChange}
            onAddNew={status => setModal({ task: null, defaultStatus: status })} />
        ))}
      </div>

      {/* Modal */}
      {modal !== null && (
        <TaskModal
          task={modal.task}
          users={users}
          onSave={modal.task ? handleUpdate : data => handleCreate({ ...data, status: data.status || modal.defaultStatus || 'TODO' })}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-2">Delete task?</h3>
            <p className="text-sm text-slate-600 mb-6">
              This will permanently delete the task and all its attachments. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
