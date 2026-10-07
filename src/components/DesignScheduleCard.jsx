'use client';
import { useState, useRef } from 'react';

const DEFAULT_MILESTONES = [
  { id: '100-sd',     label: '100% SD',       color: '#3b82f6', badge: 'SD',   badgeCss: 'bg-blue-100 text-blue-600' },
  { id: '100-dd',     label: '100% DD',        color: '#6366f1', badge: 'DD',   badgeCss: 'bg-indigo-100 text-indigo-600' },
  { id: '50-cd',      label: '50% CD',         color: '#8b5cf6', badge: '50CD', badgeCss: 'bg-purple-100 text-purple-600' },
  { id: '90-cd',      label: '90% CD',         color: '#a78bfa', badge: '90CD', badgeCss: 'bg-violet-100 text-violet-600' },
  { id: 'permit-set', label: 'Permit Set',      color: '#f59e0b', badge: 'PRMT', badgeCss: 'bg-amber-100 text-amber-600' },
  { id: 'gmp',        label: 'GMP',            color: '#f97316', badge: 'GMP',  badgeCss: 'bg-orange-100 text-orange-600' },
  { id: '100-cd-ifc', label: '100% CD (IFC)', color: '#10b981', badge: 'IFC',  badgeCss: 'bg-emerald-100 text-emerald-600' },
];

const MILESTONE_STYLE = Object.fromEntries(
  DEFAULT_MILESTONES.map(m => [m.id, { color: m.color, badge: m.badge, badgeCss: m.badgeCss }])
);

function fmtDate(str) {
  if (!str) return null;
  try {
    return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return str; }
}

function fmtDateShort(str) {
  if (!str) return null;
  try {
    return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch { return str; }
}

function initMilestones(saved) {
  if (saved && Array.isArray(saved) && saved.length > 0) return saved;
  return DEFAULT_MILESTONES.map(m => ({ id: m.id, label: m.label, date: null }));
}

// ── Simple Gantt timeline strip ────────────────────────────────────────────────
function GanttStrip({ milestones }) {
  const withDates = milestones.filter(m => m.date);
  if (withDates.length < 2) return null;

  const times    = withDates.map(m => new Date(m.date + 'T12:00:00').getTime());
  const minTime  = Math.min(...times);
  const maxTime  = Math.max(...times);
  const range    = maxTime - minTime || 1;
  const today    = Date.now();
  const todayPct = Math.max(0, Math.min(100, ((today - minTime) / range) * 100));
  const showToday = today > minTime && today < maxTime;

  return (
    <div className="relative h-14 mb-5 select-none px-2">
      {/* baseline */}
      <div className="absolute top-7 left-2 right-2 h-px bg-slate-200" />

      {/* today line */}
      {showToday && (
        <div
          className="absolute top-3 w-px bg-orange-400"
          style={{ left: `calc(${todayPct}% + 0.5rem)`, height: '20px' }}
        >
          <div className="absolute -top-3 -translate-x-1/2 text-[8px] font-bold text-orange-500 whitespace-nowrap">
            TODAY
          </div>
        </div>
      )}

      {/* diamonds */}
      {withDates.map((m, idx) => {
        const pct    = ((new Date(m.date + 'T12:00:00').getTime() - minTime) / range) * 100;
        const style  = MILESTONE_STYLE[m.id] || { color: '#94a3b8' };
        const isPast = new Date(m.date + 'T12:00:00').getTime() < today;
        const flip   = pct > 65;

        return (
          <div
            key={m.id}
            className="absolute flex flex-col items-center"
            style={{ left: `calc(${pct}% + 0.5rem)`, top: '20px', transform: 'translateX(-50%)' }}
          >
            <div
              className="w-3.5 h-3.5 rounded-sm rotate-45 shadow-sm"
              style={{ backgroundColor: isPast ? '#cbd5e1' : style.color }}
            />
            <div
              className={`absolute text-[8px] font-semibold whitespace-nowrap mt-5 ${isPast ? 'text-slate-300' : 'text-slate-500'}`}
              style={{ [flip ? 'right' : 'left']: 0 }}
            >
              {fmtDateShort(m.date)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DesignScheduleCard({ projectId, initialMilestones, onSaved }) {
  const [milestones, setMilestones] = useState(() => initMilestones(initialMilestones));
  const [dirty,      setDirty]      = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [editingId,  setEditingId]  = useState(null);
  const [editValue,  setEditValue]  = useState('');
  const [showGantt,  setShowGantt]  = useState(true);
  const [addingNew,  setAddingNew]  = useState(false);
  const [newLabel,   setNewLabel]   = useState('');
  const [newDate,    setNewDate]    = useState('');
  const inputRef = useRef(null);

  function startEdit(id, currentDate) {
    setEditingId(id);
    setEditValue(currentDate || '');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commitEdit(id) {
    const val = editValue.trim() || null;
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, date: val } : m));
    setEditingId(null);
    setDirty(true);
  }

  function deleteMilestone(id) {
    setMilestones(prev => prev.filter(m => m.id !== id));
    setDirty(true);
  }

  function addMilestone() {
    if (!newLabel.trim()) return;
    const id = `custom-${Date.now()}`;
    setMilestones(prev => [...prev, { id, label: newLabel.trim(), date: newDate || null }]);
    setNewLabel('');
    setNewDate('');
    setAddingNew(false);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/projects/${projectId}/responses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section:   'design-info',
        responses: { designMilestones: JSON.stringify(milestones) },
      }),
    });
    setSaving(false);
    setDirty(false);
    onSaved?.(milestones);
  }

  const hasDates = milestones.some(m => m.date);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Design Schedule</p>
          {hasDates && (
            <button
              onClick={() => setShowGantt(v => !v)}
              className="text-[10px] text-slate-300 hover:text-slate-500 transition-colors"
            >
              {showGantt ? 'Hide timeline' : 'Show timeline'}
            </button>
          )}
        </div>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>

      {/* Gantt strip */}
      {showGantt && hasDates && <GanttStrip milestones={milestones} />}

      {/* Milestone rows */}
      <div className="space-y-0.5">
        {milestones.map(m => {
          const style    = MILESTONE_STYLE[m.id] || { color: '#94a3b8', badge: '•', badgeCss: 'bg-slate-100 text-slate-500' };
          const isEditing = editingId === m.id;

          return (
            <div
              key={m.id}
              className="group flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {/* Badge */}
              <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${style.badgeCss}`}>
                {style.badge || m.label.slice(0, 4).toUpperCase()}
              </span>

              {/* Label */}
              <span className="flex-1 text-sm font-medium text-slate-700 min-w-0 truncate">
                {m.label}
              </span>

              {/* Date — click to edit */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="date"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(m.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  commitEdit(m.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="text-xs border border-amber-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              ) : (
                <button
                  onClick={() => startEdit(m.id, m.date)}
                  className={`text-xs font-medium transition-colors whitespace-nowrap ${
                    m.date ? 'text-slate-600 hover:text-amber-600' : 'text-slate-300 hover:text-amber-500'
                  }`}
                >
                  {fmtDate(m.date) || 'add date'}
                </button>
              )}

              {/* Delete */}
              <button
                onClick={() => deleteMilestone(m.id)}
                title="Remove milestone"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-400 shrink-0 ml-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}

        {/* Add new milestone */}
        {addingNew ? (
          <div className="flex items-center gap-2 py-2 px-2 bg-slate-50 rounded-lg mt-1">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 shrink-0">
              NEW
            </span>
            <input
              autoFocus
              type="text"
              placeholder="Milestone label"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addMilestone()}
              className="flex-1 text-sm border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400 min-w-0"
            />
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="text-xs border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400 shrink-0"
            />
            <button
              onClick={addMilestone}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 whitespace-nowrap shrink-0"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingNew(false); setNewLabel(''); setNewDate(''); }}
              className="text-xs text-slate-400 hover:text-slate-600 shrink-0"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingNew(true)}
            className="w-full flex items-center gap-2 py-1.5 px-2 text-xs text-slate-400 hover:text-amber-600 transition-colors rounded-lg hover:bg-slate-50 mt-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add milestone
          </button>
        )}
      </div>
    </div>
  );
}
