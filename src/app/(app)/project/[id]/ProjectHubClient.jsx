'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/calculations';
import { buildingTypeLabel, phaseLabel, serviceTypeLabel, clientTypeLabel, locationTypeLabel, PROJECT_PHASES, SERVICE_TYPES, BUILDING_TYPES } from '@/lib/utils';
import FileDropZone from '@/components/files/FileDropZone';
import ProjectChat from '@/components/ProjectChat';
import TakeoffDashboard from '@/components/TakeoffDashboard';
import ContractWidgets from '@/components/ContractWidgets';
import CAScheduleWidgets from '@/components/CAScheduleWidgets';
import CAScheduleCard from '@/components/CAScheduleCard';
import BudgetDashboard from '@/components/BudgetDashboard';
import MeetingNotes from '@/components/MeetingNotes';
import ProjectDashboard from '@/components/ProjectDashboard';
import ContractsPanel from '@/components/contracts/ContractsPanel';
import ProjectActivityFeed from '@/components/ProjectActivityFeed';
import BudgetLineItemWidget from '@/components/BudgetLineItemWidget';
import DesignScheduleCard from '@/components/DesignScheduleCard';
import FixtureScheduleTab from './FixtureScheduleTab';
import FixtureScheduleEditor from './FixtureScheduleEditor';
import PdfViewerModal from '@/components/ui/PdfViewerModal';
import DrawingMarkupModal from '@/components/drawing/DrawingMarkupModal';
import ParametricEstimatePanel from './ParametricEstimatePanel';
import ShipScheduleTab from '@/components/shipSchedule/ShipScheduleTab';
import NotificationSettingsTab from '@/components/notifications/NotificationSettingsTab';
import ContactsTab from '@/components/contacts/ContactsTab';

const BUDGET_TYPE_META = {
  conceptual:  { label: 'Conceptual Budget',    color: 'bg-slate-100 text-slate-600' },
  design:      { label: 'Full Design',           color: 'bg-amber-100 text-amber-700' },
  peer_review: { label: 'Peer Review Matrix',     color: 'bg-blue-100 text-blue-700' },
};

function PhaseTag({ phase }) {
  const colors = {
    sd:           'bg-slate-100 text-slate-500',
    dd:           'bg-indigo-100 text-indigo-700',
    cd:           'bg-violet-100 text-violet-700',
    ifc:          'bg-amber-100 text-amber-700',
    construction: 'bg-orange-100 text-orange-700',
    closeout:     'bg-green-100 text-green-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[phase] || colors.sd}`}>
      {phaseLabel(phase)}
    </span>
  );
}

function PlaceholderTab({ icon, title, description, phase }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <span className="text-3xl">{icon}</span>
      </div>
      <h3 className="font-semibold text-slate-700 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-4">{description}</p>
      <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-400 text-xs font-medium">
        Coming in {phase}
      </span>
    </div>
  );
}

const DESIGN_SERVICE_TYPES = new Set(['fullDesign', 'designAssist']);

function buildTabs(serviceType) {
  const isDesign = DESIGN_SERVICE_TYPES.has(serviceType);
  return [
    'Dashboard', 'Budgets',
    'Fixture Schedule',
    'Takeoffs', 'Estimate', 'Ship Schedule', 'Drawings', 'Design Info', 'Meetings', 'Correspondence', 'Submittals', 'CA', 'Contracts', 'Contacts', 'Notifications',
  ];
}

const TAB_LABELS = {
  drawings: 'Drawings', correspondence: 'Correspondence', submittals: 'Submittals',
  ca: 'CA', contracts: 'Contracts', meetings: 'Meetings', designInfo: 'Design Info', takeoffs: 'Takeoffs',
};

function ProjectSearch({ projectId }) {
  const [open,        setOpen]        = useState(false);
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [searched,    setSearched]    = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const inputRef = useState(null);

  async function search(q) {
    if (!q.trim() || q.length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/projects/${projectId}/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
      setSearched(true);
    } catch {}
    setLoading(false);
  }

  function handleKey(e) {
    if (e.key === 'Enter') search(query);
    if (e.key === 'Escape') { setOpen(false); setQuery(''); setResults([]); }
  }

  return (
    <>
    {viewingFile && (
      <PdfViewerModal
        file={viewingFile}
        projectId={projectId}
        onClose={() => setViewingFile(null)}
      />
    )}
    <div className="border-b border-slate-100 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        {!open ? (
          <button onClick={() => setOpen(true)}
            className="flex items-center gap-2 py-2.5 text-sm text-slate-400 hover:text-amber-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            Search all files in this project…
          </button>
        ) : (
          <div className="py-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey}
                placeholder="Search across all uploaded files…"
                className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent" />
              <button onClick={() => search(query)} disabled={loading}
                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold disabled:opacity-60">
                {loading ? '…' : 'Search'}
              </button>
              <button onClick={() => { setOpen(false); setQuery(''); setResults([]); setSearched(false); }}
                className="text-slate-400 hover:text-slate-600 text-xs">
                Close
              </button>
            </div>

            {/* Results */}
            {searched && results.length === 0 && !loading && (
              <p className="text-xs text-slate-400 mt-3 pb-2">No results found. Make sure files have been uploaded and are PDFs (text is extracted automatically).</p>
            )}
            {results.length > 0 && (
              <div className="mt-3 space-y-3 pb-3 max-h-80 overflow-y-auto">
                {results.map(r => (
                  <div key={r.fileId} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <button
                        onClick={() => setViewingFile({ id: r.fileId, originalName: r.originalName })}
                        className="text-xs font-semibold text-amber-700 hover:text-amber-600 truncate text-left">
                        {r.originalName}
                      </button>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 shrink-0">
                        {TAB_LABELS[r.tab] || r.tab}
                      </span>
                      {r.tags?.map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 shrink-0">{tag}</span>
                      ))}
                    </div>
                    {r.snippets.map((s, i) => (
                      <p key={i} className="text-xs text-slate-600 leading-relaxed border-l-2 border-amber-300 pl-2 mt-1.5">{s}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function initials(user) {
  if (!user) return '?';
  const name = user.name || user.email || '';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function ProjectHubClient({ project, budget, peerReviewTotal, clients = [], allUsers = [], initialFiles = [], initialDesignInfo = {}, masterTypes = [] }) {
  const router = useRouter();
  const TABS = buildTabs(project.serviceType);
  const [activeTab,      setActiveTab]      = useState('Dashboard');
  const [phase,          setPhase]          = useState(project.phase || 'sd');
  const [savingPhase,    setSavingPhase]    = useState(false);
  const [serviceType,    setServiceType]    = useState(project.serviceType || '');
  const [savingSvc,      setSavingSvc]      = useState(false);
  const [flagged,        setFlagged]        = useState(project.flagged || false);
  const [flagNote,       setFlagNote]       = useState(project.flagNote || '');
  const [savingFlag,     setSavingFlag]     = useState(false);
  const [showFlagNote,   setShowFlagNote]   = useState(false);
  const [assignees,      setAssignees]      = useState(project.assignees || []);
  const [showAssignees,  setShowAssignees]  = useState(false);
  const [assigningClient, setAssigningClient] = useState(false);
  const [clientId,       setClientId]       = useState('');
  const [savingClient,   setSavingClient]   = useState(false);
  const [assignedClient, setAssignedClient] = useState(project.client || null);

  // Project info editing (city, state, buildingType)
  const [editingInfo,   setEditingInfo]   = useState(false);
  const [infoDraft,     setInfoDraft]     = useState({ city: project.city || '', state: project.state || '', buildingType: project.buildingType || '' });
  const [savedInfo,     setSavedInfo]     = useState({ city: project.city || '', state: project.state || '', buildingType: project.buildingType || '' });
  const [savingInfo,    setSavingInfo]    = useState(false);

  async function saveProjectInfo() {
    setSavingInfo(true);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city:         infoDraft.city.trim()         || null,
        state:        infoDraft.state.trim()        || null,
        buildingType: infoDraft.buildingType        || null,
      }),
    });
    if (res.ok) {
      setSavedInfo({ ...infoDraft });
      setEditingInfo(false);
    }
    setSavingInfo(false);
  }

  const budgetMeta = BUDGET_TYPE_META[project.budgetType] || BUDGET_TYPE_META.conceptual;
  const budgetTotal = project.budgetType === 'peer_review'
    ? peerReviewTotal
    : (budget?.totalWithControls || 0);

  const locationStr = savedInfo.city && savedInfo.state
    ? `${savedInfo.city}, ${savedInfo.state}`
    : (project.location || null);

  async function updatePhase(newPhase) {
    setPhase(newPhase);
    setSavingPhase(true);
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: newPhase }),
    });
    setSavingPhase(false);
  }

  async function updateServiceType(val) {
    setServiceType(val);
    setSavingSvc(true);
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceType: val || null }),
    });
    setSavingSvc(false);
  }

  async function toggleFlag() {
    const newFlagged = !flagged;
    setFlagged(newFlagged);
    setSavingFlag(true);
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flagged: newFlagged, flagNote: newFlagged ? flagNote : null }),
    });
    setSavingFlag(false);
    if (!newFlagged) setShowFlagNote(false);
  }

  async function saveFlagNote() {
    setSavingFlag(true);
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flagNote }),
    });
    setSavingFlag(false);
    setShowFlagNote(false);
  }

  async function addAssignee(userId) {
    await fetch(`/api/projects/${project.id}/assignees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const u = allUsers.find(u => u.id === userId);
    if (u && !assignees.find(a => a.id === userId)) setAssignees(prev => [...prev, u]);
  }

  async function removeAssignee(userId) {
    await fetch(`/api/projects/${project.id}/assignees`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setAssignees(prev => prev.filter(a => a.id !== userId));
  }

  async function saveClient() {
    setSavingClient(true);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: clientId || null }),
    });
    if (res.ok) {
      const found = clients.find(c => c.id === clientId) || null;
      setAssignedClient(found);
      setAssigningClient(false);
      router.refresh();
    }
    setSavingClient(false);
  }

  const [budgetType,         setBudgetType]         = useState(project.budgetType || 'conceptual');
  const [convertingTo,       setConvertingTo]       = useState(null);   // 'conceptual' | 'design' | null
  const [convertLoading,     setConvertLoading]     = useState(false);
  const [viewingPdf,         setViewingPdf]         = useState(null);
  const [markupFile,         setMarkupFile]         = useState(null);

  async function convertBudgetType(newType) {
    setConvertLoading(true);
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetType: newType }),
    });
    setBudgetType(newType);
    setConvertingTo(null);
    setConvertLoading(false);
    router.push(`/project/${project.id}/wizard`);
  }

  const [allFiles,              setAllFiles]              = useState(initialFiles);
  const [designInfo,            setDesignInfo]            = useState(initialDesignInfo);
  const [designMilestonesVer,   setDesignMilestonesVer]   = useState(0);
  const [contractValue,         setContractValue]         = useState(project.contractValue ?? null);
  const [contractSignedDate,    setContractSignedDate]    = useState(project.contractSignedDate ?? null);
  const [designContractValue,   setDesignContractValue]   = useState(project.designContractValue ?? null);
  const [designContractDate,    setDesignContractDate]    = useState(project.designContractSignedDate ?? null);
  const [constructionStartDate, setConstructionStartDate] = useState(project.constructionStartDate ?? null);
  const [mepRoughInDate,        setMepRoughInDate]        = useState(project.mepRoughInDate ?? null);
  const [constructionEndDate,   setConstructionEndDate]   = useState(project.constructionEndDate ?? null);

  const filesByTab    = tab => allFiles.filter(f => f.tab === tab);
  const onFileAdded   = (f, contractUpdate, scheduleUpdate, designScheduleUpdate) => {
    setAllFiles(prev => [f, ...prev]);
    if (contractUpdate) {
      if (contractUpdate.contractValue           != null) setContractValue(contractUpdate.contractValue);
      if (contractUpdate.contractSignedDate      != null) setContractSignedDate(contractUpdate.contractSignedDate);
      if (contractUpdate.designContractValue     != null) setDesignContractValue(contractUpdate.designContractValue);
      if (contractUpdate.designContractSignedDate != null) setDesignContractDate(contractUpdate.designContractSignedDate);
    }
    if (scheduleUpdate) {
      if (scheduleUpdate.constructionStartDate) setConstructionStartDate(scheduleUpdate.constructionStartDate);
      if (scheduleUpdate.mepRoughInDate)        setMepRoughInDate(scheduleUpdate.mepRoughInDate);
      if (scheduleUpdate.constructionEndDate)   setConstructionEndDate(scheduleUpdate.constructionEndDate);
    }
    if (designScheduleUpdate?.milestones) {
      setDesignInfo(prev => ({ ...prev, designMilestones: designScheduleUpdate.milestones }));
      setDesignMilestonesVer(v => v + 1);
    }
  };
  const onFileDeleted = id => setAllFiles(prev => prev.filter(f => f.id !== id));

  async function saveDesignInfo(key, value) {
    const updated = { ...designInfo, [key]: value };
    setDesignInfo(updated);
    await fetch(`/api/projects/${project.id}/responses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 'design-info', responses: updated }),
    });
  }

  const wizardUrl = `/project/${project.id}/wizard`;
  const summaryUrl = `/project/${project.id}/summary`;

  return (
    <>
    {viewingPdf && (
      <PdfViewerModal
        file={viewingPdf}
        projectId={project.id}
        onClose={() => setViewingPdf(null)}
      />
    )}
    {markupFile && (
      <DrawingMarkupModal
        file={markupFile}
        projectId={project.id}
        masterTypes={masterTypes}
        onClose={() => setMarkupFile(null)}
      />
    )}
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
            <Link href="/dashboard" className="hover:text-amber-600 transition-colors">Dashboard</Link>
            <span>›</span>
            {project.client && (
              <>
                <span className="text-slate-500">{project.client.name}</span>
                <span>›</span>
              </>
            )}
            <span className="text-slate-600 font-medium">{project.name}</span>
          </div>

          {/* Project header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {project.projectNumber && (
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                    PRJ-{String(project.projectNumber).padStart(4, '0')}
                  </span>
                )}
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">{project.name}</h1>
                {/* Flag toggle */}
                <button
                  onClick={toggleFlag}
                  title={flagged ? 'Remove flag' : 'Flag this project'}
                  className={`p-1 rounded transition-colors ${flagged ? 'text-red-500 hover:text-red-400' : 'text-slate-300 hover:text-red-400'}`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 7l2.55 2.4A1 1 0 0116 11H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
                  </svg>
                </button>
                {flagged && (
                  <button onClick={() => setShowFlagNote(v => !v)} className="text-xs text-red-400 hover:text-red-600">
                    {flagNote ? `"${flagNote}"` : 'Add note'}
                  </button>
                )}
              </div>

              {/* Flag note input */}
              {showFlagNote && (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    value={flagNote}
                    onChange={e => setFlagNote(e.target.value)}
                    placeholder="Flag note (optional)…"
                    className="text-xs border border-red-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-400 w-56"
                    onKeyDown={e => e.key === 'Enter' && saveFlagNote()}
                  />
                  <button onClick={saveFlagNote} className="text-xs text-red-500 font-medium hover:text-red-700">
                    {savingFlag ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-2">
                {/* Phase selector */}
                <select
                  value={phase}
                  onChange={e => updatePhase(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-700"
                >
                  {PROJECT_PHASES.map(p => (
                    <option key={p.value} value={p.value}>{p.label} — {p.long}</option>
                  ))}
                </select>

                {/* Service type selector */}
                <select
                  value={serviceType}
                  onChange={e => updateServiceType(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-700"
                >
                  <option value="">Service type…</option>
                  {SERVICE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>

                {(savingPhase || savingSvc) && <span className="text-xs text-slate-400">Saving...</span>}

                {/* Building type + location — click pencil to edit */}
                {!editingInfo ? (
                  <>
                    {savedInfo.buildingType && (
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {buildingTypeLabel(savedInfo.buildingType)}
                      </span>
                    )}
                    {(savedInfo.city || savedInfo.state) && (
                      <span className="text-xs text-slate-400">
                        {[savedInfo.city, savedInfo.state].filter(Boolean).join(', ')}
                      </span>
                    )}
                    <button
                      onClick={() => { setInfoDraft({ ...savedInfo }); setEditingInfo(true); }}
                      title="Edit city, state, building type"
                      className="flex items-center gap-1 text-xs text-slate-300 hover:text-amber-500 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                      </svg>
                      {!savedInfo.city && !savedInfo.buildingType && <span>Add location &amp; type</span>}
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      value={infoDraft.city}
                      onChange={e => setInfoDraft(d => ({ ...d, city: e.target.value }))}
                      placeholder="City"
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    />
                    <input
                      value={infoDraft.state}
                      onChange={e => setInfoDraft(d => ({ ...d, state: e.target.value }))}
                      placeholder="ST"
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 w-14 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    />
                    <select
                      value={infoDraft.buildingType}
                      onChange={e => setInfoDraft(d => ({ ...d, buildingType: e.target.value }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="">Building type…</option>
                      {BUILDING_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={saveProjectInfo}
                      disabled={savingInfo}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-60 transition-colors"
                    >
                      {savingInfo ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingInfo(false)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Assignees */}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex -space-x-1">
                  {assignees.map(u => (
                    <div key={u.id}
                      className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center border-2 border-white"
                      title={u.name || u.email}>
                      {initials(u)}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowAssignees(v => !v)}
                  className="text-xs text-slate-400 hover:text-amber-600 transition-colors"
                >
                  {assignees.length === 0 ? '+ Assign people' : '+ Edit'}
                </button>
              </div>

              {/* Assignee picker */}
              {showAssignees && (
                <div className="mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-64">
                  <div className="text-xs font-semibold text-slate-500 mb-2">Team Members</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {allUsers.map(u => {
                      const assigned = assignees.some(a => a.id === u.id);
                      return (
                        <button key={u.id}
                          onClick={() => assigned ? removeAssignee(u.id) : addAssignee(u.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${assigned ? 'bg-amber-50 text-amber-800' : 'hover:bg-slate-50 text-slate-700'}`}
                        >
                          <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                            {initials(u)}
                          </div>
                          <span className="text-xs truncate">{u.name || u.email}</span>
                          {assigned && (
                            <svg className="w-3.5 h-3.5 text-amber-500 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setShowAssignees(false)} className="mt-2 text-xs text-slate-400 hover:text-slate-600 w-full text-center">
                    Done
                  </button>
                </div>
              )}
            </div>

            {/* Client card */}
            {assignedClient && !assigningClient ? (
              <div className="shrink-0 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-right">
                <div className="text-xs text-slate-400 mb-0.5">Client</div>
                <div className="font-semibold text-slate-800 text-sm">{assignedClient.name}</div>
                <div className="flex items-center justify-end gap-1.5 mt-1">
                  <span className="text-[11px] text-slate-400">{clientTypeLabel(assignedClient.type)}</span>
                  {assignedClient.locationType && assignedClient.locationType !== 'none' && (
                    <span className="text-[11px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                      {locationTypeLabel(assignedClient.locationType)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setClientId(assignedClient.id); setAssigningClient(true); }}
                  className="text-[10px] text-slate-400 hover:text-amber-600 mt-1 transition-colors"
                >
                  Change
                </button>
              </div>
            ) : assigningClient ? (
              <div className="shrink-0 bg-white border border-amber-300 rounded-xl px-4 py-2.5 min-w-[200px]">
                <div className="text-xs text-slate-500 mb-1.5 font-medium">Assign Client</div>
                <select
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 mb-2"
                  autoFocus
                >
                  <option value="">No client</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="flex gap-1.5">
                  <button
                    onClick={saveClient}
                    disabled={savingClient}
                    className="flex-1 px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold disabled:opacity-60"
                  >
                    {savingClient ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setAssigningClient(false)}
                    className="flex-1 px-2 py-1 rounded border border-slate-200 text-slate-500 text-xs hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="shrink-0 bg-slate-50 border border-dashed border-slate-200 rounded-xl px-4 py-2.5 text-right">
                <div className="text-xs text-slate-400 mb-0.5">Client</div>
                <button
                  onClick={() => { setClientId(''); setAssigningClient(true); }}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                >
                  Assign client →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab
                    ? 'border-amber-500 text-amber-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Project Search */}
      <ProjectSearch projectId={project.id} />

      {/* Tab content */}
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── DASHBOARD ────────────────────────────────────────────────── */}
        {activeTab === 'Dashboard' && (
          <div className="space-y-6">
            <ProjectDashboard
              project={project}
              budget={budget}
              contractValue={contractValue}
              files={allFiles}
              onProjectUpdate={() => router.refresh()}
              onProjectDataUpdate={() => router.refresh()}
            />
            <ProjectActivityFeed projectId={project.id} />
          </div>
        )}

        {/* ── BUDGETS ──────────────────────────────────────────────────── */}
        {activeTab === 'Budgets' && (
          <div className="space-y-6">

            {/* ── Create / Open Budget type cards ────────────────────────── */}
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Budgets</h2>

              {/* Conversion confirmation banner */}
              {convertingTo && (
                <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 flex items-start gap-4">
                  <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-900">
                      {convertingTo === 'design' ? 'Switch to Full Design?' : convertingTo === 'peer_review' ? 'Switch to Peer Review Matrix?' : 'Switch to Conceptual Budget?'}
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      {convertingTo === 'design'
                        ? 'All existing project data and questionnaire answers carry over. The design wizard will open with extra questions to fill in — nothing is lost.'
                        : convertingTo === 'peer_review'
                        ? 'Opens the Peer Review Matrix — a fixture-by-fixture review matrix. Enter specified vs. proposed products and the savings auto-calculate. Existing project data is preserved.'
                        : 'Your project data carries over. Design-only answers will be hidden but not deleted — you can convert back at any time.'}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => convertBudgetType(convertingTo)}
                      disabled={convertLoading}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-60"
                    >
                      {convertLoading ? 'Converting…' : 'Yes, convert'}
                    </button>
                    <button
                      onClick={() => setConvertingTo(null)}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-xs font-medium hover:bg-amber-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">

                {/* Conceptual Budget */}
                {budgetType === 'conceptual' ? (
                  <Link href={wizardUrl} className="group flex flex-col gap-2 p-4 rounded-2xl border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">Active</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-amber-800">Open Conceptual Budget</div>
                      <div className="text-xs text-slate-400 mt-0.5">Short questionnaire · quick SF estimate</div>
                    </div>
                  </Link>
                ) : (
                  <button
                    onClick={() => setConvertingTo('conceptual')}
                    className="group flex flex-col gap-2 p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50 transition-all text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-amber-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">Switch to Conceptual Budget</div>
                      <div className="text-xs text-slate-400 mt-0.5">Short questionnaire · quick SF estimate</div>
                    </div>
                  </button>
                )}

                {/* Design Budget */}
                {budgetType === 'design' ? (
                  <Link href={wizardUrl} className="group flex flex-col gap-2 p-4 rounded-2xl border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">Active</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-amber-800">Open Full Design</div>
                      <div className="text-xs text-slate-400 mt-0.5">Full questionnaire · all design questions</div>
                    </div>
                  </Link>
                ) : (
                  <button
                    onClick={() => setConvertingTo('design')}
                    className="group flex flex-col gap-2 p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50 transition-all text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-amber-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">Switch to Full Design</div>
                      <div className="text-xs text-slate-400 mt-0.5">Full questionnaire · all design questions</div>
                    </div>
                  </button>
                )}

                {/* Peer Review Budget */}
                {budgetType === 'peer_review' ? (
                  <Link href={wizardUrl} className="group flex flex-col gap-2 p-4 rounded-2xl border-2 border-blue-400 bg-blue-50 hover:bg-blue-100 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">Active</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-blue-800">Open Peer Review Matrix</div>
                      <div className="text-xs text-slate-400 mt-0.5">Fixture-by-fixture review &amp; pricing matrix</div>
                    </div>
                  </Link>
                ) : (
                  <button
                    onClick={() => setConvertingTo('peer_review')}
                    className="group flex flex-col gap-2 p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">Switch to Peer Review Matrix</div>
                      <div className="text-xs text-slate-400 mt-0.5">Line-by-line fixture matrix</div>
                    </div>
                  </button>
                )}

              </div>
            </div>

            {/* ── Budget Progression chart (no drop zone) ─────────────────── */}
            <BudgetDashboard
              projectId={project.id}
              files={filesByTab('budgets')}
              onFileAdded={onFileAdded}
              onFileDeleted={onFileDeleted}
              showDropZone={false}
            />

            {/* ── Active budget card ──────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{budgetMeta.label}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${budgetMeta.color}`}>
                        {project.budgetType === 'peer_review' ? 'Peer Review' : project.budgetType === 'design' ? 'Design' : 'Conceptual'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Last updated {new Date(project.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-slate-900">
                    {project.budgetType === 'peer_review'
                      ? (peerReviewTotal < 0 ? `-${formatCurrency(Math.abs(peerReviewTotal))}` : peerReviewTotal > 0 ? formatCurrency(peerReviewTotal) : '—')
                      : (budgetTotal > 0 ? formatCurrency(budgetTotal) : '—')
                    }
                  </div>
                  {project.budgetType !== 'peer_review' && budget?.perSf > 0 && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      ${budget.perSf.toFixed(2)}/SF · {formatCurrency(budget.perUnit)}/unit
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3 bg-slate-50">
                <Link
                  href={wizardUrl}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
                >
                  Open Budget
                </Link>
                {project.budgetType !== 'peer_review' && (
                  <Link
                    href={summaryUrl}
                    className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors"
                  >
                    View Summary
                  </Link>
                )}
                <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-medium ${
                  (project.status || 'DRAFT') === 'DRAFT' ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'
                }`}>
                  {project.status || 'Draft'}
                </span>
              </div>
            </div>

            {/* ── Top 10 Line Items from latest budget PDF ────────────────── */}
            <BudgetLineItemWidget files={filesByTab('budgets')} />

            {/* ── Budget file drop zone ───────────────────────────────────── */}
            <FileDropZone
              projectId={project.id}
              tab="budgets"
              initialFiles={filesByTab('budgets')}
              onFileAdded={onFileAdded}
              onFileDeleted={onFileDeleted}
            />

            {/* ── Future budget types ─────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4 opacity-50">
              {[
                { label: 'Full Line Item DD Budget', phase: '1B', icon: '📋' },
                { label: 'Full Line Item CD Budget', phase: '1B', icon: '📐' },
                { label: 'Buyout Budget',            phase: '2',  icon: '🛒' },
              ].map(item => (
                <div key={item.label} className="bg-white border border-dashed border-slate-200 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <div className="text-sm font-medium text-slate-500">{item.label}</div>
                  <div className="text-xs text-slate-400 mt-1">Phase {item.phase}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DRAWINGS ─────────────────────────────────────────────────── */}
        {activeTab === 'Drawings' && (() => {
          const drawingFiles  = filesByTab('drawings').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          const latestDrawing = drawingFiles[0] ?? null;
          // drawingUrl kept for reference but we now use PdfViewerModal
          function drawingTag(f) {
            try { const t = JSON.parse(f.tags || '[]'); return t.length ? t.join(' · ') : null; } catch { return null; }
          }
          function fmtDrawingDate(str) {
            if (!str) return null;
            try { return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return str; }
          }
          return (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Drawing Sets</h2>
                  <p className="text-sm text-slate-400 mt-0.5">SD, DD, CD, IFC drawing packages</p>
                </div>
              </div>

              {/* Latest drawing card */}
              <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Current Drawing Set</p>
                {latestDrawing ? (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{latestDrawing.originalName}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-400">{fmtDrawingDate(latestDrawing.createdAt)}</span>
                        {drawingTag(latestDrawing) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">
                            {drawingTag(latestDrawing)}
                          </span>
                        )}
                        {latestDrawing.size && (
                          <span className="text-xs text-slate-300">{(latestDrawing.size / 1024 / 1024).toFixed(1)} MB</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setViewingPdf(latestDrawing)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        Open PDF
                      </button>
                      <button
                        onClick={() => setMarkupFile(latestDrawing)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                        </svg>
                        Mark Up
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-1">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-300 italic">No drawing sets uploaded yet</p>
                  </div>
                )}
                {drawingFiles.length > 1 && (
                  <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
                    {drawingFiles.length - 1} older set{drawingFiles.length > 2 ? 's' : ''} below
                  </p>
                )}
              </div>

              <FileDropZone projectId={project.id} tab="drawings" initialFiles={filesByTab('drawings')} onFileAdded={onFileAdded} onFileDeleted={onFileDeleted} />
            </div>
          );
        })()}

        {/* ── CORRESPONDENCE ───────────────────────────────────────────── */}
        {activeTab === 'Correspondence' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Correspondence</h2>
                <p className="text-sm text-slate-400 mt-0.5">Emails, letters, meeting notes — Phase 2: Outlook label integration</p>
              </div>
            </div>
            <FileDropZone projectId={project.id} tab="correspondence" initialFiles={filesByTab('correspondence')} onFileAdded={onFileAdded} onFileDeleted={onFileDeleted} />
          </div>
        )}

        {/* ── SUBMITTALS ───────────────────────────────────────────────── */}
        {activeTab === 'Submittals' && (
          <div className="space-y-6">
            {/* Approval Tracker card */}
            <Link
              href={`/project/${project.id}/tracker`}
              className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-amber-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Approval Tracker</p>
                  <p className="text-xs text-slate-400 mt-0.5">Track fixture approvals per type across all reviewers and submission rounds</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-amber-500 group-hover:text-amber-600 transition-colors whitespace-nowrap">
                Open Tracker →
              </span>
            </Link>

            {/* File drop */}
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Submittal Files</h3>
              <FileDropZone projectId={project.id} tab="submittals" initialFiles={filesByTab('submittals')} onFileAdded={onFileAdded} onFileDeleted={onFileDeleted} />
            </div>
          </div>
        )}

        {/* ── CONSTRUCTION ADMIN ───────────────────────────────────────── */}
        {activeTab === 'CA' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Construction Administration</h2>
                <p className="text-sm text-slate-400 mt-0.5">RFIs, change orders, construction schedules — Phase 2: Procore RFI email integration</p>
              </div>
            </div>
            <CAScheduleWidgets files={filesByTab('ca')} />
            <CAScheduleCard files={filesByTab('ca')} projectId={project.id} />
            <FileDropZone
              projectId={project.id}
              tab="ca"
              initialFiles={filesByTab('ca')}
              onFileAdded={onFileAdded}
              onFileDeleted={onFileDeleted}
              onBeforeTaggedUpload={(tags) => {
                if (!tags.includes('Construction Schedule')) return true;
                const existing = filesByTab('ca').some(f => {
                  try { return (typeof f.tags === 'string' ? JSON.parse(f.tags) : f.tags ?? []).includes('Construction Schedule'); } catch { return false; }
                });
                if (!existing) return true;
                return window.confirm(
                  'A construction schedule is already on file.\n\nUpload this as the new version? The existing file will remain but this one will be used for milestones going forward.'
                );
              }}
            />
          </div>
        )}

        {/* ── CONTRACTS ────────────────────────────────────────────────── */}
        {activeTab === 'Contracts' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Contracts</h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  Supply contracts · COIs · SOVs · Amendments — supply contracts are auto-reviewed by Claude AI
                </p>
              </div>
            </div>

            <ContractWidgets
              projectId={project.id}
              value={contractValue}
              signedDate={contractSignedDate}
              onValueChange={setContractValue}
              onSignedDateChange={setContractSignedDate}
              designValue={designContractValue}
              designDate={designContractDate}
              onDesignValueChange={setDesignContractValue}
              onDesignDateChange={setDesignContractDate}
            />

            {/* ── Unified file zone: upload + AI review in one place ────── */}
            <ContractsPanel
              projectId={project.id}
              initialFiles={filesByTab('contracts')}
              onFileAdded={onFileAdded}
              onFileDeleted={onFileDeleted}
            />
          </div>
        )}

        {/* ── MEETINGS ─────────────────────────────────────────────────── */}
        {activeTab === 'Meetings' && (
          <div className="space-y-6">
            <MeetingNotes projectId={project.id} />
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Meeting Files</h3>
              <FileDropZone projectId={project.id} tab="meetings" initialFiles={filesByTab('meetings')} onFileAdded={onFileAdded} onFileDeleted={onFileDeleted} />
            </div>
          </div>
        )}

        {/* ── DESIGN INFO ───────────────────────────────────────────────── */}
        {activeTab === 'Design Info' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Design Information</h2>
                <p className="text-sm text-slate-400 mt-0.5">Code research, product specs, design criteria, calculations</p>
              </div>
            </div>

            {/* Design criteria fields */}
            <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Design Criteria</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Building Codes — multi-line */}
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Building Codes &amp; Years
                  </label>
                  <textarea
                    rows={4}
                    placeholder={"IBC 2021\nNEC 2020\nNFPA 101 2021\nASHRAE 90.1 2019"}
                    defaultValue={designInfo.codes || ''}
                    onBlur={e => {
                      const val = e.target.value.trim();
                      if (val !== (designInfo.codes || '').trim()) saveDesignInfo('codes', val);
                    }}
                    className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent leading-relaxed"
                  />
                  <p className="text-[10px] text-slate-300 mt-1">One code per line — saves on focus out</p>
                </div>

                {/* Revit Year */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Revit Year
                  </label>
                  <input
                    type="number"
                    placeholder="2024"
                    min="2010"
                    max="2035"
                    defaultValue={designInfo.revitYear || ''}
                    onBlur={e => {
                      const val = e.target.value.trim();
                      if (val !== (designInfo.revitYear || '').toString()) saveDesignInfo('revitYear', val);
                    }}
                    className="w-full text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Design Schedule widget */}
            <DesignScheduleCard
              key={designMilestonesVer}
              projectId={project.id}
              initialMilestones={designInfo.designMilestones}
              onSaved={m => setDesignInfo(prev => ({ ...prev, designMilestones: m }))}
            />

            <FileDropZone
              projectId={project.id}
              tab="designInfo"
              initialFiles={filesByTab('designInfo')}
              onFileAdded={onFileAdded}
              onFileDeleted={onFileDeleted}
            />
          </div>
        )}

        {/* ── FIXTURE SCHEDULE ─────────────────────────────────────────── */}
        {activeTab === 'Fixture Schedule' && (
          DESIGN_SERVICE_TYPES.has(project.serviceType) ? (
            /* New Design Fixture Schedule editor */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Fixture Schedule</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Specify products for each fixture type · Push to Bid to create a versioned pricing run</p>
                </div>
              </div>
              <FixtureScheduleEditor projectId={project.id} />
            </div>
          ) : (
            /* Existing PDF parser for non-design projects */
            <div>
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-slate-800">Fixture Schedule</h2>
                <p className="text-sm text-slate-400 mt-0.5">Parse an electrical drawing PDF to extract the fixture schedule, then push directly to the Peer Review Matrix.</p>
              </div>
              <FixtureScheduleTab projectId={project.id} />
            </div>
          )
        )}

        {/* ── TAKEOFFS ─────────────────────────────────────────────────── */}
        {activeTab === 'Takeoffs' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Takeoffs</h2>
                <p className="text-sm text-slate-400 mt-0.5">Fixture counts across submissions — tag each upload with its phase (SD, DD, CD, IFC…)</p>
              </div>
            </div>
            <TakeoffDashboard files={filesByTab('takeoffs')} />
            <FileDropZone projectId={project.id} tab="takeoffs" initialFiles={filesByTab('takeoffs')} onFileAdded={onFileAdded} onFileDeleted={onFileDeleted} />
          </div>
        )}

        {/* ── ESTIMATE ─────────────────────────────────────────────────── */}
        {activeTab === 'Estimate' && (
          <ParametricEstimatePanel projectId={project.id} />
        )}

        {/* ── SHIP SCHEDULE ────────────────────────────────────────────── */}
        {activeTab === 'Ship Schedule' && (
          <ShipScheduleTab projectId={project.id} />
        )}

        {/* ── CONTACTS ─────────────────────────────────────────────────── */}
        {activeTab === 'Contacts' && (
          <ContactsTab projectId={project.id} />
        )}

        {/* ── NOTIFICATIONS ────────────────────────────────────────────── */}
        {activeTab === 'Notifications' && (
          <NotificationSettingsTab projectId={project.id} />
        )}

      </div>
    </div>

    <ProjectChat projectId={project.id} />
    </>
  );
}
