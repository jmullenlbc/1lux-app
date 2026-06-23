'use client';
import { useState, useMemo, useEffect, useRef } from 'react';

// ── Milestone type config (8 canonical types) ─────────────────────────────────
const MILESTONE_CONFIG = {
  'construction-start':  { label: 'Construction Start',         badge: 'START', color: '#3b82f6', badgeCss: 'bg-blue-100 text-blue-600' },
  'electrical-rough':    { label: 'Electrical Rough-In',        badge: 'ELEC',  color: '#6366f1', badgeCss: 'bg-indigo-100 text-indigo-600' },
  'mep-rough':           { label: 'MEP Rough-In',               badge: 'MEP',   color: '#8b5cf6', badgeCss: 'bg-purple-100 text-purple-600' },
  'light-fixtures':      { label: 'Interior Light Fixtures',    badge: 'LTNG',  color: '#f59e0b', badgeCss: 'bg-amber-100 text-amber-600' },
  'site-lighting':       { label: 'Exterior / Site Lighting',   badge: 'SITE',  color: '#f97316', badgeCss: 'bg-orange-100 text-orange-600' },
  'electrical-devicing': { label: 'Electrical Devicing / Trim', badge: 'TRIM',  color: '#a78bfa', badgeCss: 'bg-violet-100 text-violet-600' },
  'tco':                 { label: 'TCO',                        badge: 'TCO',   color: '#10b981', badgeCss: 'bg-emerald-100 text-emerald-600' },
  'construction-end':    { label: 'Final Completion',           badge: 'END',   color: '#22c55e', badgeCss: 'bg-green-100 text-green-600' },
};

// Priority for sorting undated milestones in canonical order
const TYPE_PRIORITY = {
  'construction-start': 0,
  'electrical-rough':   1,
  'mep-rough':          1,
  'light-fixtures':     2,
  'site-lighting':      3,
  'electrical-devicing':4,
  'tco':                5,
  'construction-end':   6,
};

// The 5 defaults always shown (even with no file uploaded)
const DEFAULT_MILESTONES = [
  { id: 'construction-start', label: 'Construction Start',       date: null },
  { id: 'electrical-rough-1', label: 'Electrical Rough-In',      date: null },
  { id: 'site-lighting',      label: 'Exterior / Site Lighting', date: null },
  { id: 'tco',                label: 'TCO',                      date: null },
  { id: 'construction-end',   label: 'Final Completion',         date: null },
];

// Singletons: only one instance allowed (no -N suffix)
const SINGLETON_TYPES = new Set(['construction-start', 'light-fixtures', 'site-lighting', 'electrical-devicing', 'tco', 'construction-end']);

// ── Helpers ───────────────────────────────────────────────────────────────────

// Strips trailing -N from multi-phase IDs to find base config
function getConfig(id) {
  const base = id.replace(/-\d+$/, '');
  return MILESTONE_CONFIG[base] ?? MILESTONE_CONFIG[id] ?? MILESTONE_CONFIG['construction-start'];
}

function getBaseType(id) {
  return id.replace(/-\d+$/, '');
}

function sortMilestones(list) {
  return [...list].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    const ap = TYPE_PRIORITY[getBaseType(a.id)] ?? 99;
    const bp = TYPE_PRIORITY[getBaseType(b.id)] ?? 99;
    return ap - bp;
  });
}

function parseIso(iso) { return new Date(iso + 'T00:00:00'); }

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

function relativeLabel(iso) {
  if (!iso) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((parseIso(iso) - today) / 86_400_000);
  if (diff === 0) return { text: 'today',             past: false };
  if (diff  > 0) return { text: `in ${diff}d`,        past: false };
  return              { text: `${Math.abs(diff)}d ago`, past: true  };
}

function isPast(iso) {
  if (!iso) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return parseIso(iso) < today;
}

// ── Gantt chart ───────────────────────────────────────────────────────────────
function GanttChart({ milestones, onStartEdit }) {
  const withDates = milestones.filter(m => m.date);

  if (withDates.length < 2) {
    return (
      <p className="text-xs text-slate-300 italic py-2">
        Add at least 2 milestone dates to see the timeline.
      </p>
    );
  }

  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const dates   = withDates.map(m => parseIso(m.date));
  const minDate = new Date(+Math.min(...dates) - 60 * 86_400_000);
  const maxDate = new Date(+Math.max(...dates) + 60 * 86_400_000);
  const totalMs = maxDate - minDate;

  const pct      = iso => ((parseIso(iso) - minDate) / totalMs) * 100;
  const todayPct = ((today - minDate) / totalMs) * 100;

  const quarters = [];
  const cur = new Date(minDate);
  cur.setDate(1);
  cur.setMonth(Math.floor(cur.getMonth() / 3) * 3);
  while (cur <= maxDate) {
    const p = ((cur - minDate) / totalMs) * 100;
    if (p >= 0 && p <= 101) quarters.push({
      label: `Q${Math.floor(cur.getMonth() / 3) + 1} '${String(cur.getFullYear()).slice(2)}`,
      pct: p,
    });
    cur.setMonth(cur.getMonth() + 3);
  }

  const ROW_H = 50;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: '500px' }}>

        {/* Quarter labels */}
        <div className="relative h-6 mb-1">
          {quarters.map((q, i) => (
            <span key={i}
              className="absolute text-[10px] text-slate-400 -translate-x-1/2 font-mono select-none"
              style={{ left: `${q.pct}%` }}>
              {q.label}
            </span>
          ))}
        </div>

        <div className="relative" style={{ height: `${milestones.length * ROW_H + 8}px` }}>

          {/* Quarter grid lines */}
          {quarters.map((q, i) => (
            <div key={i} className="absolute top-0 bottom-0 border-l border-slate-100"
              style={{ left: `${q.pct}%` }} />
          ))}

          {/* Past shade */}
          {todayPct > 0 && (
            <div className="absolute top-0 bottom-0 bg-slate-50/70 pointer-events-none"
              style={{ left: 0, width: `${Math.min(todayPct, 100)}%` }} />
          )}

          {/* Today line */}
          {todayPct >= 0 && todayPct <= 100 && (
            <div className="absolute top-0 bottom-0 z-20 pointer-events-none"
              style={{ left: `${todayPct}%` }}>
              <div className="absolute top-0 bottom-0 border-l-2 border-orange-400" />
              <span className="absolute text-[9px] font-bold text-orange-500 -translate-x-1/2 bg-white px-0.5 rounded-sm select-none"
                style={{ top: 0 }}>
                TODAY
              </span>
            </div>
          )}

          {milestones.map((m, i) => {
            const config     = getConfig(m.id);
            const pos        = m.date ? pct(m.date) : null;
            const past       = isPast(m.date);
            const dotColor   = past ? '#cbd5e1' : config.color;
            const flipLabel  = pos !== null && pos > 65;

            return (
              <div key={m.id} className="absolute w-full group"
                style={{ top: `${i * ROW_H + 4}px`, height: `${ROW_H - 4}px` }}>

                <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-slate-100" />

                {m.date && pos !== null ? (
                  <>
                    <div className="absolute top-1/2 h-px -translate-y-1/2 pointer-events-none"
                      style={{ left: 0, width: `${pos}%`, backgroundColor: dotColor, opacity: past ? 0.25 : 0.4 }} />

                    <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${pos}%`, top: '42%' }}>
                      <div
                        className="w-3 h-3 rotate-45 cursor-pointer group-hover:scale-125 transition-transform"
                        style={{
                          backgroundColor: dotColor,
                          boxShadow: past ? 'none' : `0 0 7px ${config.color}55`,
                        }}
                        onClick={() => onStartEdit(m.id, m.date)}
                        title="Click to edit date"
                      />
                    </div>

                    <div className="absolute z-10 -translate-x-1/2 pointer-events-none"
                      style={{ left: `${pos}%`, top: 'calc(42% + 10px)' }}>
                      <span className="text-[9px] text-slate-400 whitespace-nowrap font-mono select-none">
                        {formatDate(m.date)}
                      </span>
                    </div>

                    <div className="absolute z-10 flex items-center gap-1 pointer-events-none"
                      style={flipLabel
                        ? { right: `calc(${100 - pos}% + 12px)`, flexDirection: 'row-reverse', top: '5%' }
                        : { left: `calc(${pos}% + 12px)`, top: '5%' }
                      }>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${config.badgeCss}`}>
                        {config.badge}
                      </span>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap hidden sm:block">
                        {m.label}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none"
                    style={{ left: '4px' }}>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded opacity-30 ${config.badgeCss}`}>
                      {config.badge}
                    </span>
                    <span className="text-[10px] text-slate-300 italic">no date</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Add-milestone picker ──────────────────────────────────────────────────────
function AddPicker({ milestones, onAdd, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Multi-phase types can always be added; singletons only if not yet present
  const addableTypes = Object.keys(MILESTONE_CONFIG).filter(type => {
    if (!SINGLETON_TYPES.has(type)) return true; // electrical-rough, mep-rough — always addable
    return !milestones.some(m => m.id === type);
  });

  if (addableTypes.length === 0) return null;

  return (
    <div ref={ref}
      className="absolute bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-30 min-w-[210px] py-1">
      {addableTypes.map(type => {
        const config = MILESTONE_CONFIG[type];
        return (
          <button key={type} onClick={() => onAdd(type)}
            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 transition-colors">
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${config.badgeCss}`}>
              {config.badge}
            </span>
            <span className="text-slate-700">{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CAScheduleCard({ files, projectId, onFileUpdated }) {
  const scheduleFile = useMemo(() => {
    return files
      .filter(f => {
        try {
          const tags = typeof f.tags === 'string' ? JSON.parse(f.tags) : (f.tags ?? []);
          return tags.includes('Construction Schedule');
        } catch { return false; }
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] ?? null;
  }, [files]);

  // Build milestone list: stored data merged with 5 required defaults
  const sourceMilestones = useMemo(() => {
    let stored = [];
    try { stored = JSON.parse(scheduleFile?.takeoffData || '{}')?.milestones ?? []; } catch {}

    if (stored.length === 0) return DEFAULT_MILESTONES;

    const result = [...stored];

    // Ensure singleton defaults exist
    const singletonDefaults = ['construction-start', 'site-lighting', 'tco', 'construction-end'];
    for (const id of singletonDefaults) {
      if (!result.some(m => m.id === id)) {
        result.push({ id, label: MILESTONE_CONFIG[id].label, date: null });
      }
    }

    // Ensure at least one rough-in entry exists
    const hasRough = result.some(m => /^(electrical-rough|mep-rough)/.test(m.id));
    if (!hasRough) {
      result.push({ id: 'electrical-rough-1', label: 'Electrical Rough-In', date: null });
    }

    return sortMilestones(result);
  }, [scheduleFile]);

  const [milestones,     setMilestones]     = useState(sourceMilestones);
  const [editingId,      setEditingId]      = useState(null);
  const [editValue,      setEditValue]      = useState('');
  const [dirty,          setDirty]          = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [saveError,      setSaveError]      = useState(null);
  const [showGantt,      setShowGantt]      = useState(true);
  const [showAddPicker,  setShowAddPicker]  = useState(false);
  const [autoParsing,    setAutoParsing]    = useState(false);
  const [autoParseError, setAutoParseError] = useState(null);

  // Re-sync milestones when the schedule file changes
  useEffect(() => {
    setMilestones(sourceMilestones);
    setDirty(false);
    setEditingId(null);
  }, [scheduleFile?.id]);

  // Auto-parse: when a schedule file exists with no stored milestones, run AI extraction automatically
  useEffect(() => {
    if (!scheduleFile || !projectId) return;
    // Skip if already has milestone data
    let stored = [];
    try { stored = JSON.parse(scheduleFile.takeoffData || '{}')?.milestones ?? []; } catch {}
    if (stored.length > 0) return;
    // Skip if already parsing. (No textContent precondition — /reparse re-extracts
    // the PDF from disk itself, and returns a clear error if it truly can't.)
    if (autoParsing) return;

    setAutoParsing(true);
    setAutoParseError(null);

    fetch(`/api/projects/${projectId}/files/${scheduleFile.id}/reparse`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.milestones?.length > 0) {
          const parsed = sortMilestones(data.milestones);
          setMilestones(prev => {
            // Merge: keep user-entered dates, fill in AI-found dates for empty milestones
            return prev.map(m => {
              const found = parsed.find(p => p.id === m.id);
              return found && !m.date ? { ...m, date: found.date } : m;
            }).concat(parsed.filter(p => !prev.some(m => m.id === p.id)));
          });
          // Notify parent so file record updates in state (no refresh needed)
          onFileUpdated?.({ ...scheduleFile, takeoffData: JSON.stringify({ milestones: data.milestones }) });
        } else if (data.error) {
          setAutoParseError(data.error);
        }
      })
      .catch(e => setAutoParseError(e.message))
      .finally(() => setAutoParsing(false));
  }, [scheduleFile?.id]);

  const startEdit = (id, currentDate) => {
    setEditingId(id);
    setEditValue(currentDate || '');
  };

  const commitEdit = (id) => {
    const newDate = editValue || null;
    setMilestones(prev => sortMilestones(prev.map(m => m.id === id ? { ...m, date: newDate } : m)));
    setEditingId(null);
    setDirty(true);
  };

  const cancelEdit = () => setEditingId(null);

  const deleteMilestone = (id) => {
    setMilestones(prev => prev.filter(m => m.id !== id));
    setDirty(true);
  };

  const addMilestone = (type) => {
    let newId = type;
    // Multi-phase types get a numeric suffix
    if (!SINGLETON_TYPES.has(type)) {
      const existing = milestones.filter(m => getBaseType(m.id) === type);
      const maxN = existing.reduce((max, m) => {
        const match = m.id.match(/-(\d+)$/);
        return match ? Math.max(max, parseInt(match[1])) : max;
      }, 0);
      newId = `${type}-${maxN + 1}`;
    }
    const config = MILESTONE_CONFIG[type];
    setMilestones(prev => sortMilestones([...prev, { id: newId, label: config.label, date: null }]));
    setDirty(true);
    setShowAddPicker(false);
  };

  const save = async () => {
    if (!scheduleFile) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${scheduleFile.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ milestones }),
      });
      if (!res.ok) throw new Error();
      setDirty(false);
    } catch {
      setSaveError('Save failed — try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Construction Schedule
          </p>
          {scheduleFile ? (
            <p className="text-[11px] text-slate-300 truncate mt-0.5 flex items-center gap-1.5" title={scheduleFile.originalName}>
              {scheduleFile.originalName}
              {autoParsing && (
                <span className="flex items-center gap-1 text-purple-500 font-medium shrink-0">
                  <svg className="animate-spin w-2.5 h-2.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Reading dates…
                </span>
              )}
              {autoParseError && !autoParsing && (
                <span className="text-slate-400 shrink-0 italic">
                  {autoParseError.includes('authentication') || autoParseError.includes('apiKey')
                    ? 'Auto-parse unavailable · enter dates manually'
                    : `⚠ ${autoParseError}`}
                </span>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-slate-300 italic mt-0.5">
              No schedule uploaded — enter dates manually
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saveError && <span className="text-[11px] text-red-500">{saveError}</span>}
          {dirty && (
            <button
              onClick={save}
              disabled={saving || !scheduleFile}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
          <button
            onClick={() => setShowGantt(v => !v)}
            className="text-xs text-slate-400 hover:text-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 whitespace-nowrap transition-colors"
          >
            {showGantt ? 'Hide timeline' : 'Show timeline'}
          </button>
        </div>
      </div>

      {/* Milestone list */}
      <div className="px-5 py-2">
        {milestones.map(m => {
          const config    = getConfig(m.id);
          const rel       = relativeLabel(m.date);
          const past      = isPast(m.date);
          const isEditing = editingId === m.id;

          return (
            <div key={m.id}
              className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0 group/row">

              {/* Color dot */}
              <div className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: m.date ? (past ? '#cbd5e1' : config.color) : '#e2e8f0' }} />

              {/* Label */}
              <span className="text-sm text-slate-600 flex-1 min-w-0 truncate" title={m.label}>
                {m.label}
              </span>

              {/* Date — inline edit on click */}
              {isEditing ? (
                <input
                  type="date"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(m.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  commitEdit(m.id);
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  autoFocus
                  className="text-sm border border-blue-400 rounded px-2 py-0.5 outline-none ring-1 ring-blue-200"
                />
              ) : (
                <button
                  onClick={() => startEdit(m.id, m.date)}
                  className={`text-sm font-medium whitespace-nowrap hover:text-blue-600 hover:underline ${
                    m.date ? 'text-slate-800' : 'text-slate-300 italic'
                  }`}
                  title="Click to edit"
                >
                  {m.date ? formatDate(m.date) : 'add date'}
                </button>
              )}

              {/* Relative days */}
              {rel && !isEditing ? (
                <span className="text-[11px] w-16 text-right shrink-0 tabular-nums text-slate-400">
                  {rel.text}
                </span>
              ) : (
                !isEditing && <span className="w-16 shrink-0" />
              )}

              {/* Delete button — visible on row hover */}
              {!isEditing && (
                <button
                  onClick={() => deleteMilestone(m.id)}
                  className="opacity-0 group-hover/row:opacity-100 text-slate-300 hover:text-red-400 transition-all ml-1 shrink-0"
                  title="Remove milestone"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}

        {/* Add milestone row */}
        <div className="relative mt-1 pb-1">
          <button
            onClick={() => setShowAddPicker(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 py-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add milestone
          </button>
          {showAddPicker && (
            <AddPicker
              milestones={milestones}
              onAdd={addMilestone}
              onClose={() => setShowAddPicker(false)}
            />
          )}
        </div>
      </div>

      {/* Gantt chart */}
      {showGantt && (
        <div className="px-5 pt-3 pb-6 border-t border-slate-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-4">
            Timeline
          </p>
          <GanttChart milestones={milestones} onStartEdit={startEdit} />
          <p className="text-[10px] text-slate-300 mt-3">
            Click any diamond or date to edit. Changes update the timeline instantly.
          </p>
        </div>
      )}
    </div>
  );
}
