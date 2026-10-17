'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ConfirmArchiveModal from '@/components/salesAutomation/ConfirmArchiveModal';
import { formatCurrency } from '@/lib/calculations';
import { buildingTypeLabel, phaseLabel, serviceTypeLabel, PROJECT_PHASES, ALL_SERVICE_TYPES } from '@/lib/utils';
import { useUrlView } from '@/lib/useUrlView';
import { FilterToolbar, FilterPanel, countFilters, SearchBox } from '@/components/ui/FilterPanel';
import SortHeader, { Th as PlainTh } from '@/components/ui/SortHeader';
import { WidgetEmpty } from '@/components/ui/WidgetFrame';
import { CARD, BTN_PRIMARY, BTN_SECONDARY, H1, HELPER, TD } from '@/components/ui/tokens';

const FILTER_FIELDS = [
  { key: 'q',       label: 'Search',      kind: 'text' },
  { key: 'phase',   label: 'Phase',       kind: 'pick' },
  { key: 'service', label: 'Service',     kind: 'pick' },
  { key: 'mine',    label: 'My Projects', kind: 'yesno' },
  { key: 'flagged', label: 'Flagged',     kind: 'yesno' },
];
const PANEL_FIELDS = FILTER_FIELDS.filter(f => f.key !== 'q');
const SORT_DEFAULT = { key: 'updatedAt', dir: 'desc' };

const PHASE_COLORS = {
  sd:           'bg-slate-100 text-slate-500',
  dd:           'bg-indigo-100 text-indigo-700',
  cd:           'bg-violet-100 text-violet-700',
  ifc:          'bg-amber-100 text-amber-700',
  construction: 'bg-orange-100 text-orange-700',
  closeout:     'bg-green-100 text-green-700',
};

const SERVICE_COLORS = {
  fullDesign:   'bg-blue-50 text-blue-700',
  designAssist: 'bg-teal-50 text-teal-700',
  peerReview:   'bg-purple-50 text-purple-700',
  bidOnly:      'bg-orange-50 text-orange-700',
  conceptual:   'bg-amber-50 text-amber-700',
  other:        'bg-slate-100 text-slate-500',
};

function initials(user) {
  if (!user) return '?';
  const name = user.name || user.email || '';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function relativeTime(date) {
  const now = new Date();
  const d = new Date(date);
  const secAgo = (now - d) / 1000;
  if (secAgo < 60) return 'just now';
  if (secAgo < 3600) return `${Math.floor(secAgo / 60)}m ago`;
  if (secAgo < 86400) return `${Math.floor(secAgo / 3600)}h ago`;
  const daysAgo = Math.floor(secAgo / 86400);
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo < 30) return `${daysAgo}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export default function DashboardClient({ projects = [], user }) {
  const router = useRouter();
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: FILTER_FIELDS, sortDefault: SORT_DEFAULT });
  const [filterOpen,  setFilterOpen]  = useState(false);
  const search      = filters.q || '';
  const phaseFilter = filters.phase || 'all';
  const svcFilter   = filters.service || 'all';
  const myProjects  = filters.mine === 'yes';
  const flagged     = filters.flagged === 'yes';
  const sortCol     = sort.key;
  const sortDir     = sort.dir;
  const [actionRow,   setActionRow]   = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null); // { id, name } waiting on "Archive it"

  useEffect(() => {
    router.refresh();
    const onFocus = () => router.refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [router]);

  // Projects are archived, never deleted (Mike, 2026-09-11). The budget, files,
  // notes and history are all kept; the Archive page puts it back.
  async function archiveProject() {
    const target = archiveTarget;
    if (!target) return;
    setActionRow(target.id);
    try {
      const res = await fetch(`/api/projects/${target.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Could not archive that project.');
        return;
      }
      setArchiveTarget(null);
      router.refresh();
    } finally {
      setActionRow(null);
    }
  }

  async function duplicateProject(id) {
    setActionRow(id);
    try {
      const res = await fetch(`/api/projects/${id}/duplicate`, { method: 'POST' });
      if (!res.ok) { alert('Failed to duplicate project'); return; }
      const { project } = await res.json();
      router.refresh();
      router.push(`/project/${project.id}`);
    } finally {
      setActionRow(null);
    }
  }

  const filtered = projects.filter(p => {
    if (phaseFilter !== 'all' && p.phase !== phaseFilter) return false;
    if (svcFilter   !== 'all' && p.serviceType !== svcFilter) return false;
    if (myProjects && p.createdBy?.id !== user.id && !p.assignees?.some(a => a.id === user.id)) return false;
    if (flagged && !p.flagged) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![p.name, p.client?.name, p.city, p.state, p.location].some(v => v?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    switch (sortCol) {
      case 'name':        av = a.name.toLowerCase();                             bv = b.name.toLowerCase(); break;
      case 'client':      av = (a.client?.name || '').toLowerCase();             bv = (b.client?.name || '').toLowerCase(); break;
      case 'location':    av = (a.city || a.location || '').toLowerCase();       bv = (b.city || b.location || '').toLowerCase(); break;
      case 'serviceType': av = (a.serviceType || '').toLowerCase();              bv = (b.serviceType || '').toLowerCase(); break;
      case 'phase':       av = a.phase || '';                                    bv = b.phase || ''; break;
      case 'budget':      av = a.budget?.totalWithControls || 0;                 bv = b.budget?.totalWithControls || 0; break;
      case 'updatedAt':   av = new Date(a.updatedAt).getTime();                  bv = new Date(b.updatedAt).getTime(); break;
      default:            av = ''; bv = '';
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  const flaggedCount = projects.filter(p => p.flagged).length;
  const filterCount  = countFilters(filters, PANEL_FIELDS);
  const choices = {
    phase:   PROJECT_PHASES.map(p => [p.value, p.label]),
    service: ALL_SERVICE_TYPES.map(t => [t.value, t.label]),
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className={H1}>Projects</h1>
          <p className={`${HELPER} tabular-nums mt-0.5`}>
            {projects.length} total{filtered.length !== projects.length ? ` · ${filtered.length} shown` : ''}
            {flaggedCount > 0 ? ` · ${flaggedCount} flagged` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/clients')} className={BTN_SECONDARY}>
            Clients
          </button>
          <button onClick={() => router.push('/project/new')} className={BTN_PRIMARY}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5">
        <FilterToolbar
          count={filterCount}
          open={filterOpen}
          onToggle={() => setFilterOpen(o => !o)}
          onClear={() => { clearFilters(); }}
          shown={filtered.length}
          total={projects.length}
          noun="projects"
          right={(
            <SearchBox
              value={search}
              onChange={v => setFilter('q', v)}
              placeholder="Search projects, clients, locations..."
              className="w-72"
            />
          )}
        />
        <FilterPanel
          open={filterOpen}
          fields={PANEL_FIELDS}
          filters={filters}
          choices={choices}
          onChange={setFilter}
        />
      </div>

      {/* Table */}
      <div className={`${CARD} overflow-hidden`}>
        {sorted.length === 0 ? (
          <div className="py-10 text-center">
            <WidgetEmpty>
              {projects.length === 0 ? 'No projects yet.' : 'No projects match your filters.'}
            </WidgetEmpty>
            {projects.length === 0 && (
              <button onClick={() => router.push('/project/new')} className={`${BTN_PRIMARY} mt-2`}>
                New Project
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="w-4 px-4" />
                <SortHeader label="Project"  field="name"        sort={sort} onSort={toggleSort} className="min-w-[180px]" />
                <SortHeader label="Client"   field="client"      sort={sort} onSort={toggleSort} className="min-w-[130px]" />
                <SortHeader label="Location" field="location"    sort={sort} onSort={toggleSort} className="hidden md:table-cell" />
                <SortHeader label="Service"  field="serviceType" sort={sort} onSort={toggleSort} className="hidden lg:table-cell" />
                <PlainTh className="hidden lg:table-cell">Building</PlainTh>
                <SortHeader label="Phase"    field="phase"       sort={sort} onSort={toggleSort} />
                <SortHeader label="Budget"   field="budget"      sort={sort} onSort={toggleSort} align="right" />
                <SortHeader label="Updated"  field="updatedAt"   sort={sort} onSort={toggleSort} className="hidden xl:table-cell whitespace-nowrap" />
                <th className="px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map(project => {
                const budget   = project.budget;
                const total    = project.budgetType === 'peer_review' ? null : (budget?.totalWithControls || 0);
                const location = project.city && project.state ? `${project.city}, ${project.state}` : (project.location || '—');

                return (
                  <tr key={project.id} className="hover:bg-slate-50 transition-colors group">
                    {/* Flag dot */}
                    <td className="px-4 py-2">
                      {project.flagged
                        ? <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 7l2.55 2.4A1 1 0 0116 11H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" /></svg>
                        : <div className="w-1.5 h-1.5 rounded-full bg-slate-200 group-hover:bg-orange-400 transition-colors" />
                      }
                    </td>

                    {/* Project name */}
                    <td className="px-3 py-2 text-sm text-slate-700">
                      <Link href={`/project/${project.id}`}
                        className="font-medium text-slate-800 hover:text-orange-600 transition-colors line-clamp-1">
                        {project.name}{project.conceptualDraft?.budgetName ? <span className="font-normal text-slate-500">, {project.conceptualDraft.budgetName}</span> : null}
                      </Link>
                      {project.assignees?.length > 0 && (
                        <div className="flex -space-x-1 mt-1">
                          {project.assignees.slice(0, 3).map(u => (
                            <div key={u.id} title={u.name || u.email}
                              className="w-4 h-4 rounded-full bg-orange-50 text-orange-700 text-[8px] font-bold flex items-center justify-center border border-white">
                              {initials(u)}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Client */}
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {project.client ? (
                        <Link href={`/clients/${project.client.id}`} className="text-sm text-orange-600 hover:underline">
                          {project.client.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Location */}
                    <td className="px-3 py-2 text-sm text-slate-700 hidden md:table-cell">
                      <span className="text-xs text-slate-500">{location}</span>
                    </td>

                    {/* Service type */}
                    <td className="px-3 py-2 text-sm text-slate-700 hidden lg:table-cell">
                      {project.serviceType
                        ? <span className={`px-1.5 py-0.5 rounded-lg text-[11px] font-semibold ${SERVICE_COLORS[project.serviceType] || SERVICE_COLORS.other}`}>
                            {serviceTypeLabel(project.serviceType)}
                          </span>
                        : <span className="text-slate-400">—</span>
                      }
                    </td>

                    {/* Building type */}
                    <td className="px-3 py-2 text-sm text-slate-700 hidden lg:table-cell">
                      <span className="text-xs text-slate-500">{project.buildingType ? buildingTypeLabel(project.buildingType) : '—'}</span>
                    </td>

                    {/* Phase */}
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {project.phase
                        ? <span className={`px-1.5 py-0.5 rounded-lg text-[11px] font-semibold ${PHASE_COLORS[project.phase] || PHASE_COLORS.sd}`}>
                            {phaseLabel(project.phase)}
                          </span>
                        : <span className="text-slate-400">—</span>
                      }
                    </td>

                    {/* Budget */}
                    <td className="px-3 py-2 text-sm text-slate-700 text-right whitespace-nowrap tabular-nums">
                      {project.budgetType === 'peer_review'
                        ? <span className="text-xs text-slate-500">Peer Review</span>
                        : total > 0
                          ? <div>
                              <div className="text-sm font-semibold text-slate-800">{formatCurrency(total, true)}</div>
                              {budget?.perSf > 0 && <div className="text-[11px] text-slate-500 tabular-nums">${budget.perSf.toFixed(2)}/SF</div>}
                            </div>
                          : <span className="text-slate-400">—</span>
                      }
                    </td>

                    {/* Updated */}
                    <td className="px-3 py-2 text-sm text-slate-700 hidden xl:table-cell whitespace-nowrap tabular-nums" title={new Date(project.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}>
                      <span className="text-xs text-slate-500">
                        {relativeTime(project.updatedAt)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 text-sm text-slate-700">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/project/${project.id}`} title="Open"
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </Link>
                        <button onClick={() => duplicateProject(project.id)} title="Duplicate"
                          disabled={actionRow === project.id}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50">
                          {actionRow === project.id ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                        <button onClick={() => setArchiveTarget({ id: project.id, name: project.name })} title="Archive"
                          disabled={actionRow === project.id}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50">
                          {actionRow === project.id ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-8 text-center">
        <Link href="/archive" className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
          Archived companies, projects, people and notes →
        </Link>
      </div>

      <ConfirmArchiveModal
        open={!!archiveTarget}
        title="Archive this project?"
        what={archiveTarget?.name || 'Untitled project'}
        body="It disappears from this list, the pipeline boards and every dashboard number. Nothing is deleted: its budget, files, notes and history are all kept, and you can restore it from the Archive page at any time."
        busy={!!actionRow}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={archiveProject}
      />
    </div>
  );
}
