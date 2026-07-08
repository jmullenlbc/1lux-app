'use client';
import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  PIPELINE_STAGES, STAGE_LABEL, PIPELINE_STATUS, STATUS_LABEL,
  stageFieldFor, statusFieldFor, revenueFor, inDesignPipeline, stagesOutOfSync,
} from '@/lib/pipeline';

// Re-exported for the (orphaned, Phase-2) Deal components' imports.
export { PIPELINE_STAGES };
export const SERVICE_TYPE_LABELS = {
  fullDesign: 'Full Design', designAssist: 'Design Assist',
  peerReview: 'Peer Review', bidOnly: 'Bid Only', other: 'Other',
};
export const PROJECT_TYPE_LABELS = {};

const STATUS_CONFIG = {
  OPEN:      { label: 'Open',      color: 'text-blue-700  bg-blue-50   border-blue-200'   },
  WON:       { label: 'Won',       color: 'text-green-700 bg-green-50  border-green-200'  },
  LOST:      { label: 'Lost',      color: 'text-red-700   bg-red-50    border-red-200'    },
  COMPLETED: { label: 'Completed', color: 'text-slate-700 bg-slate-100 border-slate-300' },
  ABANDONED: { label: 'Abandoned', color: 'text-slate-500 bg-slate-50  border-slate-200' },
};

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtMoney(val) {
  if (val == null) return null;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}
function fmtDate(str) {
  if (!str) return null;
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  catch { return null; }
}
function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}
const svcLabel  = s => SERVICE_TYPE_LABELS[s] || s || null;
const unitsOf   = p => p.projectData?.numUnits ?? null;

// ── Note Input ───────────────────────────────────────────────────────────────
function NoteInput({ projectId, onClose }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/crm/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteBody: text.trim(),
          projectIds: [projectId],
          title: '',
          meetingDate: null,
          attendees: '[]',
          calendarRef: null,
          clientIds: [],
          activityType: null,
          contactIds: [],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setSaved(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (saved) return <p className="text-xs text-green-600 mt-2">Saved!</p>;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <input
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Quick note..."
        className="text-xs border border-slate-200 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-orange-400"
      />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-1">
        <button
          onClick={handleSave}
          disabled={saving || !text.trim()}
          className="text-xs px-2 py-1 bg-slate-800 text-white rounded disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">
          x
        </button>
      </div>
    </div>
  );
}

// ── Project Card ────────────────────────────────────────────────────────────
function ProjectCard({ project, pipeline, onOpen, onDragStart, onDragEnd, isDragging, onProbabilityChange }) {
  const status   = project[statusFieldFor(pipeline)] || 'OPEN';
  const st       = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN;
  const rev      = revenueFor(project, pipeline);
  const outSync  = stagesOutOfSync(project);
  const didDrag  = useRef(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [editingProb, setEditingProb] = useState(false);

  return (
    <div
      draggable
      onDragStart={e => { didDrag.current = true; e.dataTransfer.effectAllowed = 'move'; onDragStart(project.id); }}
      onDragEnd={() => { onDragEnd(); setTimeout(() => { didDrag.current = false; }, 50); }}
      onClick={() => { if (!didDrag.current) onOpen(project); }}
      className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-grab active:cursor-grabbing select-none ${isDragging ? 'opacity-40 scale-[0.97] shadow-none' : ''}`}
    >
      <div className={`h-0.5 rounded-t-xl ${pipeline === 'PROCUREMENT' ? 'bg-orange-400' : 'bg-blue-400'}`} />
      <div className="px-3 py-3">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[10px] font-mono font-bold text-slate-400">
            {project.projectNumber ? `PRJ-${String(project.projectNumber).padStart(4, '0')}` : '—'}
          </span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {outSync && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200" title="Procurement and Design stages differ">
                ⚠ stages differ
              </span>
            )}
            {status !== 'OPEN' && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${st.color}`}>{st.label}</span>
            )}
            {svcLabel(project.serviceType) && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                {svcLabel(project.serviceType)}
              </span>
            )}
          </div>
        </div>

        <p className="text-sm font-semibold text-slate-900 leading-snug mb-0.5 line-clamp-2">{project.name}</p>

        <div className="mb-2">
          {project.client && <p className="text-xs text-slate-500 truncate">{project.client.name}</p>}
          {(project.city || project.state) && (
            <p className="text-[10px] text-slate-400 truncate">
              {[project.city, project.state].filter(Boolean).join(', ')}
              {unitsOf(project) ? ` · ${unitsOf(project)} units` : ''}
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 mb-2" />

        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">
            {rev ? fmtMoney(rev) : <span className="text-slate-400 font-normal">No value</span>}
          </span>
          {project.expectedOrderDate && <span className="text-slate-400">{fmtDate(project.expectedOrderDate)}</span>}
        </div>

        <div className="flex items-center gap-2 mt-1.5">
          <div className="w-12 h-1 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-orange-400" style={{ width: `${project.pipelineProbability ?? 0}%` }} />
          </div>
          {editingProb ? (
            <input
              type="number" min="0" max="100"
              defaultValue={project.pipelineProbability ?? 0}
              autoFocus
              className="w-10 text-[10px] border border-slate-200 rounded px-1 focus:outline-none focus:ring-1 focus:ring-orange-400"
              onBlur={e => {
                setEditingProb(false);
                onProbabilityChange(project.id, e.target.value);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.target.blur();
                if (e.key === 'Escape') setEditingProb(false);
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600 hover:underline"
              title="Click to edit"
              onClick={e => { e.stopPropagation(); setEditingProb(true); }}
            >
              {project.pipelineProbability ?? 0}%
            </span>
          )}
        </div>

        {!noteOpen ? (
          <button
            onClick={() => setNoteOpen(true)}
            className="text-xs text-slate-400 hover:text-slate-600 mt-2 w-full text-left"
          >
            + Note
          </button>
        ) : (
          <NoteInput projectId={project.id} onClose={() => setNoteOpen(false)} />
        )}
        {(project._count?.noteLinks ?? 0) > 0 && (
          <p className="text-[10px] text-slate-400 mt-0.5 select-none">
            {project._count.noteLinks} note{project._count.noteLinks !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({ stageCfg, projects, pipeline, onOpen, onAdd, draggingId, onDragStart, onDragEnd, onDrop, onProbabilityChange }) {
  const [dragOver, setDragOver] = useState(false);
  const totalValue = projects.reduce((s, p) => s + (revenueFor(p, pipeline) || 0), 0);
  const isActiveDrop = dragOver && draggingId;
  const color = '#6b7280';

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      <div className="rounded-xl mb-2 px-3 py-2.5" style={{ border: '1px solid #e2e8f0', borderTopColor: color, borderTopWidth: 3, background: '#f8fafc' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">{stageCfg.label}</span>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-200 rounded-full px-1.5 py-0.5">{projects.length}</span>
        </div>
        <p className="text-[11px] font-semibold mt-0.5 text-slate-500">{totalValue > 0 ? fmtMoney(totalValue) : '—'}</p>
      </div>

      <div
        className={`flex-1 min-h-[200px] rounded-xl transition-all space-y-2 p-2 ${isActiveDrop ? 'border-2 border-dashed border-orange-400 bg-orange-50/40' : 'bg-slate-100/50'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
        onDrop={() => { setDragOver(false); onDrop(stageCfg.key); }}
      >
        {projects.map(p => (
          <ProjectCard key={p.id} project={p} pipeline={pipeline} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} isDragging={draggingId === p.id} onProbabilityChange={onProbabilityChange} />
        ))}
        {isActiveDrop && projects.length === 0 && (
          <div className="flex items-center justify-center h-16 rounded-lg text-xs font-semibold text-orange-500">Drop here → {stageCfg.label}</div>
        )}
        <button onClick={onAdd} className="w-full py-2 rounded-lg text-xs text-slate-400 hover:text-slate-600 hover:bg-white border border-dashed border-slate-300 hover:border-slate-400 transition-all flex items-center justify-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New project
        </button>
      </div>
    </div>
  );
}

// ── Pipeline Summary Bar ──────────────────────────────────────────────────────
function PipelineSummary({ projects, pipeline }) {
  const sf       = statusFieldFor(pipeline);
  const open     = projects.filter(p => p[sf] === 'OPEN');
  const won      = projects.filter(p => p[sf] === 'WON' && daysSince(p.updatedAt) <= 30);
  const lost     = projects.filter(p => p[sf] === 'LOST');
  const highProb = open.filter(p => (p.pipelineProbability ?? 0) >= 80);
  const stale    = open.filter(p => daysSince(p.updatedAt) >= 30);
  const sum = arr => arr.reduce((s, p) => s + (revenueFor(p, pipeline) || 0), 0);

  const stats = [
    { label: 'Open Pipeline',    value: fmtMoney(sum(open))     || '—', color: 'text-slate-900'  },
    { label: 'High Prob (80%+)', value: fmtMoney(sum(highProb)) || '—', color: 'text-orange-600' },
    { label: 'Won (30 days)',    value: fmtMoney(sum(won))      || '—', color: 'text-green-700'  },
    { label: 'Lost',             value: lost.length,                    color: 'text-red-600'    },
    { label: 'Open Projects',    value: open.length,                    color: 'text-slate-700'  },
    { label: 'Needs Attention',  value: stale.length,                   color: stale.length > 0 ? 'text-amber-600' : 'text-slate-400' },
  ];

  return (
    <div className="flex items-center gap-px bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-4">
      {stats.map((s, i) => (
        <div key={i} className={`flex-1 px-4 py-2.5 ${i < stats.length - 1 ? 'border-r border-slate-100' : ''}`}>
          <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── List View ─────────────────────────────────────────────────────────────────
function ListView({ projects, pipeline, onOpen, onUpdate }) {
  const [sortKey, setSortKey] = useState('updatedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [savingStatus, setSavingStatus] = useState(null);
  const stageField  = stageFieldFor(pipeline);
  const statusField = statusFieldFor(pipeline);
  const rev = p => revenueFor(p, pipeline);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...projects].sort((a, b) => {
    let av = sortKey === 'revenue' ? rev(a) : sortKey === 'stage' ? a[stageField] : sortKey === 'client' ? (a.client?.name || '') : a[sortKey];
    let bv = sortKey === 'revenue' ? rev(b) : sortKey === 'stage' ? b[stageField] : sortKey === 'client' ? (b.client?.name || '') : b[sortKey];
    if (typeof av === 'string' || typeof bv === 'string') {
      const as = String(av ?? ''), bs = String(bv ?? '');
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    }
    if (av == null) return 1;
    if (bv == null) return -1;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  async function changeStatus(project, newStatus) {
    setSavingStatus(project.id);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [statusField]: newStatus }),
      });
      if (res.ok) { const d = await res.json(); onUpdate(d.project || d); }
    } finally { setSavingStatus(null); }
  }

  const Th = ({ col, label }) => (
    <th onClick={() => toggleSort(col)} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 whitespace-nowrap select-none">
      {label}{sortKey === col && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-16">#</th>
            <Th col="name" label="Project" />
            <Th col="client" label="Client" />
            <Th col="stage" label="Stage" />
            <Th col="revenue" label={pipeline === 'DESIGN' ? 'Design Fee' : 'Product Sale'} />
            <Th col="pipelineProbability" label="Prob" />
            <Th col="expectedOrderDate" label="Expected" />
            <Th col={statusField} label="Status" />
            <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sales Owner</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(project => {
            const st = STATUS_CONFIG[project[statusField]] || STATUS_CONFIG.OPEN;
            return (
              <tr key={project.id} onClick={() => onOpen(project)} className="cursor-pointer hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2.5 text-[10px] font-mono text-slate-400">{project.projectNumber ? `PRJ-${String(project.projectNumber).padStart(4, '0')}` : '—'}</td>
                <td className="px-3 py-2.5"><p className="font-semibold text-slate-900 truncate max-w-[200px]">{project.name}</p></td>
                <td className="px-3 py-2.5 text-slate-500 truncate max-w-[140px]">{project.client?.name || '—'}</td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{STAGE_LABEL[project[stageField]] || project[stageField]}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{fmtMoney(rev(project)) || <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <div className="w-10 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-orange-400" style={{ width: `${project.pipelineProbability ?? 0}%` }} /></div>
                    <span className="text-[11px] text-slate-500">{project.pipelineProbability ?? 0}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap text-xs">{fmtDate(project.expectedOrderDate) || '—'}</td>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <select
                    value={project[statusField] || 'OPEN'}
                    disabled={savingStatus === project.id}
                    onChange={e => changeStatus(project, e.target.value)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-400 ${st.color}`}
                  >
                    {PIPELINE_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">{project.salesOwner?.name || '—'}</td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm">No projects match your filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Main CRMClient ────────────────────────────────────────────────────────────
export default function CRMClient({ initialProjects, users }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects || []);
  const [pipeline, setPipeline] = useState('PROCUREMENT');
  const [viewMode, setViewMode] = useState('kanban');
  const [filters,  setFilters]  = useState({ search: '', status: '', serviceType: '', salesOwnerId: '' });
  const [needsAttention, setNeedsAttention] = useState(false);
  const dragId = useRef(null);
  const [draggingId, setDraggingId] = useState(null);

  const stages      = PIPELINE_STAGES[pipeline] || [];
  const stageField  = stageFieldFor(pipeline);
  const statusField = statusFieldFor(pipeline);

  // Board membership: Procurement = all; Design = design-fee service types only.
  const inBoard = p => pipeline === 'DESIGN' ? inDesignPipeline(p.serviceType) : true;

  const filtered = useMemo(() => projects.filter(p => {
    if (!inBoard(p)) return false;
    if (filters.status && p[statusField] !== filters.status) return false;
    if (filters.serviceType    && p.serviceType    !== filters.serviceType)    return false;
    if (filters.salesOwnerId   && p.salesOwner?.id !== filters.salesOwnerId)   return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!(p.name || '').toLowerCase().includes(q) && !(p.client?.name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [projects, pipeline, filters]);

  const byStage = useMemo(() => {
    const map = {};
    stages.forEach(s => { map[s.key] = []; });
    filtered.forEach(p => { const k = p[stageField]; if (map[k]) map[k].push(p); });
    return map;
  }, [filtered, pipeline]);

  const needsAttentionFiltered = useMemo(() => {
    return projects
      .filter(p => inBoard(p) && p[statusField] === 'OPEN' && daysSince(p.updatedAt) >= 30)
      .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
  }, [projects, pipeline]);

  const activeList = needsAttention ? needsAttentionFiltered : filtered;
  const activeViewMode = needsAttention ? 'list' : viewMode;

  function handleDragStart(id) { dragId.current = id; setDraggingId(id); }
  function handleDragEnd()      { dragId.current = null; setDraggingId(null); }

  async function handleDrop(newStage) {
    const id = dragId.current;
    dragId.current = null; setDraggingId(null);
    if (!id) return;
    const project = projects.find(p => p.id === id);
    if (!project || project[stageField] === newStage) return;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, [stageField]: newStage } : p));
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [stageField]: newStage }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      setProjects(prev => prev.map(p => p.id === id ? project : p));
    }
  }

  async function handleProbabilityChange(id, value) {
    const clamped = Math.max(0, Math.min(100, Number(value)));
    setProjects(prev => prev.map(p =>
      p.id === id ? { ...p, pipelineProbability: clamped } : p
    ));
    try {
      await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineProbability: clamped }),
      });
    } catch { /* optimistic already applied; fail silently */ }
  }

  function handleExportCSV() {
    const sf = statusFieldFor(pipeline);
    const stagef = stageFieldFor(pipeline);
    const headers = [
      'Project', 'Client', 'Stage', 'Status',
      'Revenue', 'Probability', 'Expected Order',
    ];
    const rows = filtered.map(p => [
      p.name,
      p.client?.name || '',
      p[stagef] || '',
      p[sf] || '',
      revenueFor(p, pipeline)
        ? `$${revenueFor(p, pipeline).toLocaleString()}` : '',
      `${p.pipelineProbability ?? 0}%`,
      p.expectedOrderDate
        ? new Date(p.expectedOrderDate).toLocaleDateString() : '',
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v =>
        `"${String(v).replace(/"/g, '""')}"`
      ).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-${pipeline.toLowerCase()}-`
      + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleUpdated(updated) {
    setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
  }

  const openProject = p => router.push(`/project/${p.id}`);
  const newProject  = () => router.push('/project/new');

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">ILC Studios</span>
            <h1 className="text-xl font-bold text-slate-900">Pipeline</h1>
          </div>

          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
            {['PROCUREMENT', 'DESIGN'].map(p => (
              <button key={p} onClick={() => setPipeline(p)} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${pipeline === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {p === 'PROCUREMENT' ? '📦 Procurement' : '✏️ Design'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              <button onClick={() => setViewMode('kanban')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Board</button>
              <button onClick={() => setViewMode('list')}   className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'list'   ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>List</button>
            </div>
            <button onClick={handleExportCSV} className="text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg">
              Export CSV
            </button>
            <button onClick={() => router.push('/crm/brief')} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-sm font-semibold transition-colors">
              Brief →
            </button>
            <button onClick={newProject} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New Project
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} placeholder="Search projects…" className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 w-44" />
          </div>
          <div className="flex items-center gap-1">
            {[{ val: '', label: 'All' }, { val: 'OPEN', label: 'Open' }, { val: 'WON', label: 'Won' }, { val: 'LOST', label: 'Lost' }].map(s => (
              <button key={s.val} onClick={() => setFilters(f => ({ ...f, status: s.val }))} className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${filters.status === s.val ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-200'}`}>{s.label}</button>
            ))}
            <button
              onClick={() => setNeedsAttention(n => !n)}
              className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${
                needsAttention
                  ? 'bg-amber-500 text-white'
                  : needsAttentionFiltered.length > 0
                  ? 'border border-amber-400 text-amber-600 hover:bg-amber-50'
                  : 'text-slate-400 hover:bg-slate-200'
              }`}
            >
              {needsAttention
                ? `Needs Attention (${needsAttentionFiltered.length})`
                : needsAttentionFiltered.length > 0
                ? `! Needs Attention (${needsAttentionFiltered.length})`
                : 'Needs Attention'}
            </button>
          </div>
          <select value={filters.serviceType} onChange={e => setFilters(f => ({ ...f, serviceType: e.target.value }))} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">All service types</option>
            {Object.entries(SERVICE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filters.salesOwnerId} onChange={e => setFilters(f => ({ ...f, salesOwnerId: e.target.value }))} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">All owners</option>
            {(users || []).map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </select>
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 py-4">
        <PipelineSummary projects={activeList} pipeline={pipeline} />

        {activeViewMode === 'kanban' && (
          <div className="flex gap-3 overflow-x-auto flex-1 pb-4">
            {stages.map(stageCfg => {
              const stageProjMap = {};
              stages.forEach(s => { stageProjMap[s.key] = []; });
              activeList.forEach(p => { const k = p[stageField]; if (stageProjMap[k]) stageProjMap[k].push(p); });
              return (
                <KanbanColumn
                  key={stageCfg.key}
                  stageCfg={stageCfg}
                  projects={stageProjMap[stageCfg.key] || []}
                  pipeline={pipeline}
                  onOpen={openProject}
                  onAdd={newProject}
                  draggingId={draggingId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                  onProbabilityChange={handleProbabilityChange}
                />
              );
            })}
          </div>
        )}

        {activeViewMode === 'list' && (
          <div className="flex-1 overflow-y-auto">
            <ListView projects={activeList} pipeline={pipeline} onOpen={openProject} onUpdate={handleUpdated} />
          </div>
        )}
      </div>
    </div>
  );
}
