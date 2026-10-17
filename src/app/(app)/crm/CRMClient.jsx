'use client';
import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  PIPELINE_STAGES, STAGE_LABEL, PIPELINE_STATUS, STATUS_LABEL,
  stageFieldFor, statusFieldFor, revenueFor, inDesignPipeline, stagesOutOfSync,
  winRate, winRateAllProjects, averageProbability, WIN_RATE_DESCRIPTION, WIN_RATE_ALL_DESCRIPTION,
  WEIGHTED_PROBABILITY_LABEL, WEIGHTED_PROBABILITY_HINT, WEIGHTED_REVENUE_LABEL,
  weightedRevenue, weightedForecast, FORECAST_WINDOW_DAYS,
} from '@/lib/pipeline';
import PipelineSidePanel from '@/components/crm/PipelineSidePanel';
import SectionTabs, { PIPELINE_TABS } from '@/components/ui/SectionTabs';
import { ALL_SERVICE_TYPES, BUILDING_TYPES, PROJECT_TYPES } from '@/lib/utils';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { Th, sortRows } from '@/components/ui/SortHeader';
import StatTile from '@/components/ui/StatTile';
import { useUrlView } from '@/lib/useUrlView';
import { CARD, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, BTN_COMPACT_PRIMARY, H1, LABEL, INPUT, TD, NUM } from '@/components/ui/tokens';

// Pipeline filters (Mike 10-8: "You still haven't added a filtering option to
// the pipeline tab"). One Filter button opens the panel; the address keeps
// the choices (useUrlView). Every list is built from the jobs on the board,
// so a choice never comes back empty.
const EXPECTED_OPTIONS = [
  { value: 'overdue', label: 'Expected date passed' },
  { value: '30',      label: 'Expected in 30 days' },
  { value: '90',      label: 'Expected in 90 days' },
  { value: '180',     label: 'Expected in 180 days' },
  { value: 'none',    label: 'No expected date' },
];
const FILTER_FIELDS = [
  { key: 'search',       label: 'Search',        kind: 'text' },
  { key: 'status',       label: 'Status',        kind: 'pick' },
  { key: 'serviceType',  label: 'Service type',  kind: 'pick' },
  { key: 'salesOwnerId', label: 'Sales owner',   kind: 'pick' },
  { key: 'stage',        label: 'Stage',         kind: 'pick' },
  { key: 'clientId',     label: 'Client',        kind: 'pick' },
  { key: 'state',        label: 'State',         kind: 'pick' },
  { key: 'city',         label: 'City',          kind: 'pick' },
  { key: 'buildingType', label: 'Building type', kind: 'pick' },
  { key: 'projectType',  label: 'Project type',  kind: 'pick' },
  { key: 'minProb',      label: 'Win %',         kind: 'pick' },
  { key: 'expected',     label: 'Expected date', kind: 'pick' },
  { key: 'units',        label: 'Units',         kind: 'range' },
  { key: 'value',        label: 'Value $',       kind: 'range' },
];
// The panel shows every field except search, which sits in the toolbar.
const PANEL_FIELDS = FILTER_FIELDS.filter(f => f.key !== 'search');
// Sort keys live in the address too; useUrlView only keeps a sort it knows.
const SORT_KEYS = ['name', 'client', 'stage', 'revenue', 'probability', 'weighted', 'expectedOrderDate', 'procurementStatus', 'designStatus', 'updatedAt'];
const VIEW_FIELDS = [...FILTER_FIELDS, ...SORT_KEYS.map(k => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'updatedAt', dir: 'desc' };

// Re-exported for the (orphaned, Phase-2) Deal components' imports.
export { PIPELINE_STAGES };
export const SERVICE_TYPE_LABELS = {
  fullDesign: 'Full Design', designAssist: 'Design Assist',
  peerReview: 'Peer Review', bidOnly: 'Bid Only', conceptual: 'Conceptual Budget', other: 'Other',
};
export const PROJECT_TYPE_LABELS = {};

const STATUS_CONFIG = {
  OPEN:      { label: 'Open',      color: 'text-blue-700  bg-blue-50   border-blue-200'   },
  ON_HOLD:   { label: 'On Hold',   color: 'text-amber-700 bg-amber-50  border-amber-200'  },
  WON:       { label: 'Won',       color: 'text-green-700 bg-green-50  border-green-200'  },
  LOST:      { label: 'Lost',      color: 'text-red-700   bg-red-50    border-red-200'    },
  COMPLETED: { label: 'Completed', color: 'text-slate-700 bg-slate-100 border-slate-300' }, // legacy rows only, not in the picker
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
// Range filter: blank bounds pass; a row with no value fails any set bound.
function inRange(v, r) {
  if (!r || typeof r !== 'object') return true;
  const lo = r.min === '' || r.min == null ? null : Number(r.min);
  const hi = r.max === '' || r.max == null ? null : Number(r.max);
  if (lo == null && hi == null) return true;
  if (v == null) return false;
  if (lo != null && v < lo) return false;
  if (hi != null && v > hi) return false;
  return true;
}

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
        className={`${INPUT} text-xs px-2 py-1`}
      />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-1">
        <button
          onClick={handleSave}
          disabled={saving || !text.trim()}
          className={BTN_COMPACT_PRIMARY}
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
function ProjectCard({ project, pipeline, onOpen, onDragStart, onDragEnd, isDragging }) {
  const status   = project[statusFieldFor(pipeline)] || 'OPEN';
  const st       = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN;
  // Why it was lost or abandoned, hover the status chip to read it.
  const statusReason = project[`${statusFieldFor(pipeline)}Reason`] || '';
  const rev      = revenueFor(project, pipeline);
  const outSync  = stagesOutOfSync(project);
  const isStale  = status === 'OPEN' && daysSince(project.updatedAt) >= 30;
  const didDrag  = useRef(false);
  const [noteOpen, setNoteOpen] = useState(false);

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
          <span className="text-[11px] font-mono font-bold text-slate-400">
            {project.projectNumber ? `PRJ-${String(project.projectNumber).padStart(4, '0')}` : '—'}
          </span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {isStale && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200" title="No updates in 30+ days">
                Stale
              </span>
            )}
            {outSync && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200" title="Procurement and Design stages differ">
                ⚠ stages differ
              </span>
            )}
            {status !== 'OPEN' && (
              <span title={statusReason || undefined}
                className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${st.color}`}>
                {st.label}{statusReason ? ' ⓘ' : ''}
              </span>
            )}
            {svcLabel(project.serviceType) && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                {svcLabel(project.serviceType)}
              </span>
            )}
          </div>
        </div>

        <p className="text-sm font-semibold text-slate-900 leading-snug mb-0.5 line-clamp-2">{project.name}</p>

        <div className="mb-2">
          {project.client && <p className="text-xs text-slate-500 truncate">{project.client.name}</p>}
          {(project.city || project.state) && (
            <p className="text-[11px] text-slate-400 truncate">
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

        {/* Weighted Probability % is DERIVED (win % + move-forward %, averaged), so it
            is shown read-only here. Edit the two source fields on the project. */}
        <div className="flex items-center gap-2 mt-1.5"
          title={`${WEIGHTED_PROBABILITY_HINT} Edit Probability to Win / to Move Forward on the project.`}>
          <div className="w-12 h-1 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full bg-orange-400" style={{ width: `${averageProbability(project) ?? 0}%` }} />
          </div>
          <span className="text-[11px] text-slate-400">{averageProbability(project) ?? 0}%</span>
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
          <p className="text-[11px] text-slate-400 mt-0.5 select-none">
            {project._count.noteLinks} note{project._count.noteLinks !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// ── New web request card ──────────────────────────────────────────────────────
// A request from the public budget form that nobody has linked or turned into
// a project yet. Its own colour so it can't be mistaken for a job, and not
// draggable, it isn't a job until someone says so on the review screen.
function WebRequestCard({ request }) {
  const where = [request.city, request.state].filter(Boolean).join(', ');
  const looksLike = request.suggestedProject && !request.suggestionDismissedAt ? request.suggestedProject : null;
  const age = daysSince(request.createdAt);
  return (
    <a href={`/admin/intake?id=${request.id}`}
      className="block rounded-xl border-2 border-sky-300 bg-sky-50 hover:bg-sky-100 p-3 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-white bg-sky-600 rounded px-1.5 py-0.5">New web request</span>
        <span className="text-[11px] text-sky-700">{age < 1 ? 'today' : `${age}d ago`}</span>
      </div>
      <p className="text-sm font-semibold text-slate-900 mt-1.5 leading-tight">{request.proposedName}</p>
      {where && <p className="text-[11px] text-slate-500">{where}</p>}
      <p className="text-[11px] text-slate-600 mt-1">From {request.submitterName}</p>
      {looksLike && <p className="text-[11px] font-semibold text-amber-700 mt-1">Looks like: {looksLike.name}</p>}
      <p className="text-[11px] font-semibold text-sky-700 mt-1.5">Review and follow up →</p>
    </a>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({ stageCfg, projects, requests = [], pipeline, onOpen, onAdd, draggingId, onDragStart, onDragEnd, onDrop }) {
  const [dragOver, setDragOver] = useState(false);
  const totalValue = projects.reduce((s, p) => s + (revenueFor(p, pipeline) || 0), 0);
  const isActiveDrop = dragOver && draggingId;

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      <div className="rounded-xl mb-2 px-3 py-2.5 border border-slate-200 border-t-[3px] border-t-slate-500 bg-slate-50">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">{stageCfg.label}</span>
          <span className="text-[11px] font-bold text-slate-400 bg-slate-200 rounded-full px-1.5 py-0.5">{projects.length}</span>
        </div>
        <p className="text-[11px] font-semibold mt-0.5 text-slate-500">{totalValue > 0 ? fmtMoney(totalValue) : '—'}</p>
      </div>

      <div
        className={`flex-1 min-h-[200px] rounded-xl transition-all space-y-2 p-2 ${isActiveDrop ? 'border-2 border-dashed border-orange-400 bg-orange-50/40' : 'bg-slate-100/50'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
        onDrop={() => { setDragOver(false); onDrop(stageCfg.key); }}
      >
        {requests.map(r => <WebRequestCard key={`req-${r.id}`} request={r} />)}
        {projects.map(p => (
          <ProjectCard key={p.id} project={p} pipeline={pipeline} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} isDragging={draggingId === p.id} />
        ))}
        {isActiveDrop && projects.length === 0 && (
          <div className="flex items-center justify-center h-16 rounded-lg text-xs font-semibold text-orange-500">Drop here → {stageCfg.label}</div>
        )}
        {!isActiveDrop && projects.length === 0 && requests.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-slate-400">No projects at this stage</div>
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
function PipelineSummary({ projects, pipeline, onNeedsAttention }) {
  const sf       = statusFieldFor(pipeline);
  const open     = projects.filter(p => p[sf] === 'OPEN');
  const won      = projects.filter(p => p[sf] === 'WON' && daysSince(p.updatedAt) <= 30);
  const onHold   = projects.filter(p => p[sf] === 'ON_HOLD');
  // Probability + win rate come from src/lib/pipeline.js, one definition, used by
  // the CRM bar AND the dashboards. Do not recompute either of them here.
  const highProb = open.filter(p => (averageProbability(p) ?? 0) >= 80);
  const stale    = open.filter(p => daysSince(p.updatedAt) >= 30);
  const sum = arr => arr.reduce((s, p) => s + (revenueFor(p, pipeline) || 0), 0);

  const rate    = winRate(projects, sf);                 // won ÷ everything past Open
  const rateStr = rate == null ? '—' : `${rate}%`;
  const rateAll = winRateAllProjects(projects, sf);      // won ÷ everything on the board
  const rateAllStr = rateAll == null ? '—' : `${rateAll}%`;
  const weightedTotal = open.reduce((s, p) => s + weightedRevenue(p, pipeline), 0);
  // Maram 9-17 / Mike 9-18: the 90-day figure is WEIGHTED (revenue × probability)
  // and the tile says so. One definition in src/lib/pipeline.js.
  const forecast90 = weightedForecast(open, pipeline, FORECAST_WINDOW_DAYS);

  const stats = [
    { label: 'Open Pipeline',    value: fmtMoney(sum(open))     || '—', tone: 'default'  },
    { label: 'High Prob (80%+)', value: fmtMoney(sum(highProb)) || '—', tone: 'brand',
      hint: `${WEIGHTED_PROBABILITY_LABEL} of 80 or more.` },
    { label: WEIGHTED_REVENUE_LABEL, value: fmtMoney(Math.round(weightedTotal)) || '—', tone: 'default',
      hint: `Open pipeline value × each project’s ${WEIGHTED_PROBABILITY_LABEL}.` },
    { label: `Weighted ${FORECAST_WINDOW_DAYS}-Day Forecast`, value: fmtMoney(Math.round(forecast90)) || '—', tone: 'default',
      hint: `Open projects with an Expected Order Date in the next ${FORECAST_WINDOW_DAYS} days, each counted at revenue × ${WEIGHTED_PROBABILITY_LABEL}. Weighted, not gross.` },
    { label: 'On Hold',          value: fmtMoney(sum(onHold))   || '—', tone: 'warning',
      hint: `Revenue parked On Hold (${onHold.length} project${onHold.length === 1 ? '' : 's'}). Not in the open pipeline and not in the win rate.` },
    { label: 'Won (30 days)',    value: fmtMoney(sum(won))      || '—', tone: 'success'  },
    { label: 'Win Rate',         value: rateStr,                        tone: rate != null && rate >= 50 ? 'success' : 'danger',
      hint: WIN_RATE_DESCRIPTION },
    { label: 'Win Rate (all)',   value: rateAllStr,                     tone: 'default',
      hint: WIN_RATE_ALL_DESCRIPTION },
    { label: 'Needs Attention',  value: stale.length,                   tone: stale.length > 0 ? 'warning' : 'muted',
      hint: 'Open projects with no update in 30+ days. Click to see the list.',
      onClick: stale.length > 0 && onNeedsAttention ? onNeedsAttention : undefined },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 xl:grid-cols-9 gap-2 mb-4">
      {stats.map((s, i) => (
        <div key={i} title={s.hint || undefined} className="min-w-0">
          <StatTile label={s.label} value={s.value} tone={s.tone} onClick={s.onClick} className="w-full h-full" />
        </div>
      ))}
    </div>
  );
}

// ── List View ─────────────────────────────────────────────────────────────────
function ListView({ projects, pipeline, onOpen, onUpdate, sort, onSort }) {
  const [savingStatus, setSavingStatus] = useState(null);
  const stageField  = stageFieldFor(pipeline);
  const statusField = statusFieldFor(pipeline);
  const rev = p => revenueFor(p, pipeline);

  const getters = {
    name:              p => p.name || '',
    client:            p => p.client?.name || '',
    stage:             p => p[stageField] || '',
    revenue:           p => rev(p),
    probability:       p => averageProbability(p) ?? 0,
    weighted:          p => weightedRevenue(p, pipeline),
    expectedOrderDate: p => p.expectedOrderDate ? new Date(p.expectedOrderDate).getTime() : null,
    [statusField]:     p => p[statusField] || '',
    updatedAt:         p => p.updatedAt ? new Date(p.updatedAt).getTime() : null,
  };
  const sorted = sortRows(projects, sort, getters);

  async function changeStatus(project, newStatus) {
    const body = { [statusField]: newStatus };

    // Mike's rule: you cannot mark a deal Lost or Abandoned without saying why.
    // The API rejects it too, so this prompt just saves a round trip.
    if (newStatus === 'LOST' || newStatus === 'ABANDONED') {
      const word   = newStatus === 'LOST' ? 'lost' : 'abandoned';
      const reason = prompt(`Why was "${project.name}" ${word}? (required)`, project[`${statusField}Reason`] || '');
      if (reason === null) return;                 // they hit Cancel
      if (!reason.trim()) { alert(`A reason is required to mark a project ${word}.`); return; }
      body[`${statusField}Reason`] = reason.trim();
    }

    setSavingStatus(project.id);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) onUpdate(d.project || d);
      else alert(d.error || 'Could not change the status.');
    } finally { setSavingStatus(null); }
  }

  const hdr = 'whitespace-normal leading-tight align-bottom';

  return (
    <div className={`${CARD} overflow-hidden`}>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {/* Maram 9-17: no project-number column here; headers wrap instead of forcing a scroll. */}
            <SortHeader className={hdr} field="name" label="Project" sort={sort} onSort={onSort} />
            <SortHeader className={hdr} field="client" label="Client" sort={sort} onSort={onSort} />
            <SortHeader className={hdr} field="stage" label="Stage" sort={sort} onSort={onSort} />
            <SortHeader className={hdr} field="revenue" label={pipeline === 'DESIGN' ? 'Design Fee' : 'Product Sale'} sort={sort} onSort={onSort} />
            <SortHeader className={hdr} field="probability" label={WEIGHTED_PROBABILITY_LABEL} sort={sort} onSort={onSort} />
            <SortHeader className={hdr} field="weighted" label={WEIGHTED_REVENUE_LABEL} sort={sort} onSort={onSort} />
            <SortHeader className={hdr} field="expectedOrderDate" label="Expected Order" sort={sort} onSort={onSort} />
            <SortHeader className={hdr} field={statusField} label="Status" sort={sort} onSort={onSort} />
            <Th className={hdr}>Sales Owner</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(project => {
            const st = STATUS_CONFIG[project[statusField]] || STATUS_CONFIG.OPEN;
            return (
              <tr key={project.id} onClick={() => onOpen(project)} className="cursor-pointer hover:bg-slate-50 transition-colors">
                <td className={TD}>
                  <p className="font-semibold text-slate-900 truncate max-w-[200px]">{project.name}</p>
                  {(project._count?.noteLinks ?? 0) > 0 && (
                    <span className="text-[11px] text-slate-400">
                      {project._count.noteLinks}
                      {project._count.noteLinks !== 1 ? ' notes' : ' note'}
                    </span>
                  )}
                </td>
                <td className={`${TD} truncate max-w-[140px]`}>{project.client?.name || '—'}</td>
                <td className={`${TD} whitespace-nowrap`}>{STAGE_LABEL[project[stageField]] || project[stageField]}</td>
                <td className={`${TD} ${NUM} font-semibold text-slate-800 whitespace-nowrap`}>{fmtMoney(rev(project)) || <span className="text-slate-300">—</span>}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  <div className="flex items-center gap-1.5">
                    <div className="w-10 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-orange-400" style={{ width: `${averageProbability(project) ?? 0}%` }} /></div>
                    <span className={`text-[11px] text-slate-500 ${NUM}`} title={WEIGHTED_PROBABILITY_HINT}>{averageProbability(project) ?? 0}%</span>
                  </div>
                </td>
                <td className={`${TD} ${NUM} font-semibold text-slate-800 whitespace-nowrap`} title={`${fmtMoney(rev(project)) || '$0'} × ${averageProbability(project) ?? 0}%`}>{fmtMoney(Math.round(weightedRevenue(project, pipeline))) || <span className="text-slate-300">—</span>}</td>
                <td className={`${TD} ${NUM} whitespace-nowrap`}>{fmtDate(project.expectedOrderDate) || '—'}</td>
                <td className={TD} onClick={e => e.stopPropagation()}>
                  <select
                    value={project[statusField] || 'OPEN'}
                    disabled={savingStatus === project.id}
                    onChange={e => changeStatus(project, e.target.value)}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500 ${st.color}`}
                  >
                    {PIPELINE_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  {project[`${statusField}Reason`] && (
                    <p className="text-[11px] text-slate-400 mt-1 max-w-[160px] truncate"
                      title={project[`${statusField}Reason`]}>
                      {project[`${statusField}Reason`]}
                    </p>
                  )}
                </td>
                <td className={`${TD} whitespace-nowrap`}>{project.salesOwner?.name || '—'}</td>
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
export default function CRMClient({ initialProjects, users, newRequests = [] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects || []);
  const [pipeline, setPipeline] = useState('PROCUREMENT');
  const [viewMode, setViewMode] = useState('kanban');
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [moreOpen, setMoreOpen] = useState(false);
  const [needsAttention, setNeedsAttention] = useState(false);
  const dragId = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  // Which job the side panel is showing, if any. Holds the id, not the row, so
  // the panel always reads the freshest copy after a save.
  const [panelId, setPanelId] = useState(null);

  const stages      = PIPELINE_STAGES[pipeline] || [];
  const stageField  = stageFieldFor(pipeline);
  const statusField = statusFieldFor(pipeline);

  // Board membership: Procurement = all; Design = design-fee service types only.
  const inBoard = p => pipeline === 'DESIGN' ? inDesignPipeline(p) : true;

  const filtered = useMemo(() => projects.filter(p => {
    if (!inBoard(p)) return false;
    if (filters.status && p[statusField] !== filters.status) return false;
    if (filters.serviceType    && p.serviceType    !== filters.serviceType)    return false;
    if (filters.salesOwnerId   && p.salesOwner?.id !== filters.salesOwnerId)   return false;
    if (filters.stage          && p[stageField]    !== filters.stage)          return false;
    if (filters.clientId       && p.client?.id     !== filters.clientId)       return false;
    if (filters.state          && (p.state || '')  !== filters.state)          return false;
    if (filters.city           && (p.city  || '')  !== filters.city)           return false;
    if (filters.buildingType   && p.buildingType   !== filters.buildingType)   return false;
    if (filters.projectType    && p.projectType    !== filters.projectType)    return false;
    if (filters.minProb  && (averageProbability(p) ?? -1) < Number(filters.minProb))  return false;
    if (!inRange(unitsOf(p), filters.units)) return false;
    if (!inRange(revenueFor(p, pipeline), filters.value)) return false;
    if (filters.expected) {
      const raw = pipeline === 'DESIGN' ? p.expectedContractExecutionDate : p.expectedOrderDate;
      const d   = raw ? new Date(raw).getTime() : null;
      if (filters.expected === 'none')         { if (d) return false; }
      else if (filters.expected === 'overdue') { if (!d || d >= Date.now()) return false; }
      else { const horizon = Date.now() + Number(filters.expected) * 86_400_000; if (!d || d < Date.now() || d > horizon) return false; }
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!(p.name || '').toLowerCase().includes(q) && !(p.client?.name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [projects, pipeline, filters]);

  // Choices for the Filters panel, read off the jobs on this board.
  const filterOptions = useMemo(() => {
    const onBoard = projects.filter(inBoard);
    const distinct = pick => [...new Set(onBoard.map(pick).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    const clients  = new Map();
    onBoard.forEach(p => { if (p.client?.id) clients.set(p.client.id, p.client.name || ''); });
    return {
      clients:       [...clients].sort((a, b) => a[1].localeCompare(b[1])),
      states:        distinct(p => p.state),
      cities:        distinct(p => p.city),
      buildingTypes: distinct(p => p.buildingType),
      projectTypes:  distinct(p => p.projectType),
    };
  }, [projects, pipeline]);
  const labelOf = (list, v) => list.find(t => t.value === v)?.label || v;
  const filterCount = countFilters(filters, FILTER_FIELDS);
  const filterChoices = useMemo(() => ({
    status:       PIPELINE_STATUS.map(s => [s.key, s.label]),
    serviceType:  Object.entries(SERVICE_TYPE_LABELS),
    salesOwnerId: (users || []).map(u => [u.id, u.name || u.email]),
    stage:        stages.map(s => [s.key, STAGE_LABEL[s.key] || s.label || s.key]),
    clientId:     filterOptions.clients,
    state:        filterOptions.states,
    city:         filterOptions.cities,
    buildingType: filterOptions.buildingTypes.map(b => [b, labelOf(BUILDING_TYPES, b)]),
    projectType:  filterOptions.projectTypes.map(t => [t, labelOf(PROJECT_TYPES, t)]),
    minProb:      [20, 50, 80, 90].map(n => [String(n), `Win % ${n} or more`]),
    expected:     EXPECTED_OPTIONS.map(o => [o.value, o.label]),
  }), [users, stages, filterOptions]);

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
    // Proposal Sent (Design board only) is the same fact as proposalSentDate on
    // the project. Dropping a card into that column stamps today on a blank
    // date; dragging it back out leaves the date alone.
    const patch = { [stageField]: newStage };
    if (pipeline === 'DESIGN' && newStage === 'PROPOSAL_SENT' && !project.proposalSentDate) {
      patch.proposalSentDate = new Date().toISOString().slice(0, 10);
    }
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      setProjects(prev => prev.map(p => p.id === id ? project : p));
    }
  }

  function handleExportCSV() {
    const sf = statusFieldFor(pipeline);
    const stagef = stageFieldFor(pipeline);
    const headers = [
      'Project', 'Client', 'Stage', 'Status',
      'Revenue', WEIGHTED_PROBABILITY_LABEL, WEIGHTED_REVENUE_LABEL, 'Expected Contract Execution', 'Expected Order',
    ];
    const rows = filtered.map(p => [
      p.name,
      p.client?.name || '',
      p[stagef] || '',
      p[sf] || '',
      revenueFor(p, pipeline)
        ? `$${revenueFor(p, pipeline).toLocaleString()}` : '',
      `${averageProbability(p) ?? 0}%`,
      weightedRevenue(p, pipeline) ? `${Math.round(weightedRevenue(p, pipeline)).toLocaleString()}` : '',
      p.expectedContractExecutionDate
        ? new Date(p.expectedContractExecutionDate).toLocaleDateString() : '',
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

  // Mike, 2026-09-09: "So we don't have to go into a project and come back, go
  // into a project, come back." Clicking a job on the board no longer leaves the
  // board, it slides the sales fields out on the right. The panel still carries
  // an "Open full project" link for everything else on the job.
  const openProject = p => setPanelId(p.id);
  const newProject  = () => router.push('/project/new');

  // Read the live row out of state, not a copy, so a save inside the panel shows
  // on the card behind it at the same moment.
  const panelProject = panelId ? projects.find(p => p.id === panelId) : null;

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        {/* Pipeline / Contacts / Check-ins tabs (Mike 10-6), same look as Sales Automation. */}
        <SectionTabs tabs={PIPELINE_TABS} className="mb-4 -mt-1" />
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className={`${LABEL} text-orange-500`}>ILC Studios</span>
            <h1 className={H1}>Pipeline</h1>
          </div>

          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
            {['PROCUREMENT', 'DESIGN'].map(p => (
              <button key={p} onClick={() => setPipeline(p)} className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${pipeline === p ? 'bg-orange-50 border-orange-400 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {p === 'PROCUREMENT' ? '📦 Procurement' : '✏️ Design'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              <button onClick={() => setViewMode('kanban')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${viewMode === 'kanban' ? 'bg-orange-50 border-orange-400 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Board</button>
              <button onClick={() => setViewMode('list')}   className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${viewMode === 'list' ? 'bg-orange-50 border-orange-400 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>List</button>
            </div>
            <button onClick={handleExportCSV} className={BTN_SECONDARY}>
              Export CSV
            </button>
            {/* Contacts and Check-ins moved to the tabs above (Mike 10-6); the Brief is a Sales dashboard tab. */}
            <button onClick={newProject} className={BTN_PRIMARY}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New Project
            </button>
          </div>
        </div>

        {/* Filters: one Filter button, the panel below, search on the right. */}
        <FilterToolbar
          className="mt-3"
          count={filterCount}
          open={moreOpen}
          onToggle={() => setMoreOpen(o => !o)}
          onClear={() => { clearFilters(); setNeedsAttention(false); }}
          shown={filtered.length}
          total={projects.filter(inBoard).length}
          noun="projects"
          right={<SearchBox value={filters.search || ''} onChange={v => setFilter('search', v)} placeholder="Search projects..." />}
        >
          <button
            onClick={() => setNeedsAttention(n => !n)}
            className={`${BTN_COMPACT} ${
              needsAttention
                ? 'border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-50'
                : needsAttentionFiltered.length > 0
                ? 'border-amber-400 text-amber-600 hover:bg-amber-50'
                : ''
            }`}
          >
            {needsAttention
              ? `Needs Attention (${needsAttentionFiltered.length})`
              : needsAttentionFiltered.length > 0
              ? `! Needs Attention (${needsAttentionFiltered.length})`
              : 'Needs Attention'}
          </button>
        </FilterToolbar>
        <FilterPanel open={moreOpen} fields={PANEL_FIELDS} filters={filters} choices={filterChoices} onChange={setFilter} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 py-4">
        {newRequests.length > 0 && (
          <a href="/admin/intake"
            className="mb-3 flex items-center gap-2 rounded-xl border-2 border-sky-300 bg-sky-50 hover:bg-sky-100 px-4 py-2 text-sm text-sky-800 transition-colors shrink-0">
            <span className="font-bold">{newRequests.length} new web budget request{newRequests.length !== 1 ? 's' : ''}</span>
            <span className="text-sky-700">waiting for someone to follow up, they&apos;re the blue cards in the first column.</span>
            <span className="ml-auto font-semibold">Review them →</span>
          </a>
        )}
        <PipelineSummary projects={activeList} pipeline={pipeline} onNeedsAttention={() => setNeedsAttention(true)} />

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
                  requests={stageCfg.key === stages[0]?.key ? newRequests : []}
                  pipeline={pipeline}
                  onOpen={openProject}
                  onAdd={newProject}
                  draggingId={draggingId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                />
              );
            })}
          </div>
        )}

        {activeViewMode === 'list' && (
          <div className="flex-1 overflow-y-auto">
            <ListView projects={activeList} pipeline={pipeline} onOpen={openProject} onUpdate={handleUpdated} sort={sort} onSort={toggleSort} />
          </div>
        )}
      </div>

      {panelProject && (
        <PipelineSidePanel
          project={panelProject}
          onClose={() => setPanelId(null)}
          onUpdate={handleUpdated}
        />
      )}
    </div>
  );
}
