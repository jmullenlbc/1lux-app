'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { NAV_CONFIG, getValidTabIds, getDefaultTab } from '@/lib/projectNavConfig';
import ProjectSidebar from '@/components/project/ProjectSidebar';
import { formatCurrency } from '@/lib/calculations';
import { buildingTypeLabel, phaseLabel, serviceTypeLabel, clientTypeLabel, locationTypeLabel, PROJECT_PHASES, SERVICE_TYPES, BUILDING_TYPES } from '@/lib/utils';
import FileDropZone from '@/components/files/FileDropZone';
import { oversizeMessage, uploadErrorMessage, uploadThrowMessage } from '@/lib/uploadErrorMessage';
import ProjectChat from '@/components/ProjectChat';
import TakeoffDashboard from '@/components/TakeoffDashboard';
import UnitMatrixUpload from '@/components/unitMatrix/UnitMatrixUpload';
import SiteDataUpload from '@/components/site/SiteDataUpload';
import ContractWidgets from '@/components/ContractWidgets';
import CAScheduleWidgets from '@/components/CAScheduleWidgets';
import CAScheduleCard from '@/components/CAScheduleCard';
import BudgetDashboard from '@/components/BudgetDashboard';
import MeetingNotes from '@/components/MeetingNotes';
import ProjectDashboard from '@/components/ProjectDashboard';
import ContractsPanel from '@/components/contracts/ContractsPanel';
import ProjectActivityFeed from '@/components/ProjectActivityFeed';
import ProjectPeopleCard from '@/components/project/ProjectPeopleCard';
import BudgetLineItemWidget from '@/components/BudgetLineItemWidget';
import BudgetQCBadge from '@/components/budgetQC/BudgetQCBadge';
import CorrespondenceTab from '@/components/correspondence/CorrespondenceTab';
import DesignScheduleCard from '@/components/DesignScheduleCard';
import RFIModule from '@/components/rfi/RFIModule';
import FixtureScheduleEditor from './FixtureScheduleEditor';
import DrawingsTab from './DrawingsTab';
import PdfViewerModal from '@/components/ui/PdfViewerModal';
import DrawingMarkupModal from '@/components/drawing/DrawingMarkupModal';
// import ParametricEstimatePanel from './ParametricEstimatePanel'; // TODO: restore when Estimate absorbs into Drawings (Feature 1)
import ShipScheduleTab from '@/components/shipSchedule/ShipScheduleTab';
import NotificationSettingsTab from '@/components/notifications/NotificationSettingsTab';
import ContactsTab from '@/components/contacts/ContactsTab';
import ProjectCodeSearch from '@/components/ProjectCodeSearch';
import LPDCalculator from '@/components/LPDCalculator';
import CodeCheckPanel from '@/components/CodeCheckPanel';
import HumanErrorRadar from '@/components/HumanErrorRadar';
import ChangeOrdersTab from '@/components/changeOrders/ChangeOrdersTab';
import ProposalTab from '@/components/proposals/ProposalTab';
import { appendUpload } from '@/lib/uploadClient';

const BUDGET_TYPE_META = {
  conceptual:  { label: 'Conceptual Budget',    color: 'bg-slate-100 text-slate-600' },
  design:      { label: 'Full Design',           color: 'bg-amber-100 text-amber-700' },
  peer_review: { label: 'Budget Matrix',           color: 'bg-blue-100 text-blue-700' },
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

const TAB_LABELS = {
  drawings: 'Drawings', correspondence: 'Correspondence', submittals: 'Submittals',
  'construction-schedule': 'Construction Schedule', rfis: 'RFIs', 'change-orders': 'Change Orders',
  contracts: 'Contracts', meetings: 'Meetings', code: 'Code', 'design-schedule': 'Design Schedule',
  'design-contracts': 'Design Contracts', takeoffs: 'Takeoffs', notifications: 'Client Portal Access',
  'site-plan': 'Site Plan',
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

// ── Auto-tagged file tab (RFIs, Change Orders) ────────────────────────────────
// Uploads files with a fixed tag (no modal). Shows flat list with view/download/delete.
// ── RFI Tab ───────────────────────────────────────────────────────────────────


// Extract up to 3 short sentences from raw text content for a quick summary
function extractSummary(textContent, maxChars = 280) {
  if (!textContent) return null;
  // Collapse whitespace, strip header noise
  const clean = textContent
    .replace(/\s+/g, ' ')
    .replace(/^[\s\d\-–—|:]+/, '')
    .trim();
  if (clean.length < 20) return null;
  // Take first 3 sentences
  const sentences = clean.match(/[^.!?]*[.!?]+/g) || [];
  const summary = sentences.slice(0, 3).join(' ').trim() || clean.slice(0, maxChars);
  return summary.length > maxChars ? summary.slice(0, maxChars).replace(/\s+\S*$/, '…') : summary;
}

function AutoTaggedFileTab({ title, subtitle, autoTag, files, projectId, tab, onFileAdded, onFileDeleted, statLabel, statValue, renderFileExtra, beforeUpload, showSummary = false, hideHeader = false, showReparseButton = false }) {
  const [dragging,    setDragging]    = useState(false);
  const [uploading,   setUploading]   = useState([]); // [name]
  const [viewingFile, setViewingFile] = useState(null);
  const [reparsing,   setReparsing]   = useState({}); // { fileId: true }
  const [reparseMsg,  setReparseMsg]  = useState({}); // { fileId: 'message' }
  const [uploadErrors, setUploadErrors] = useState([]); // [{ id, msg }] — shown until dismissed
  const fileRef = useRef(null);

  async function upload(fileList) {
    const all = Array.from(fileList);
    const arr = all.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    // Dropping a .docx here used to do nothing at all, with no explanation.
    for (const f of all.filter(f => !arr.includes(f))) {
      setUploadErrors(prev => [...prev, { id: `${f.name}-${prev.length}`, msg: `${f.name} isn't a PDF. This panel only accepts PDF files.` }]);
    }
    if (!arr.length) return;
    // Run beforeUpload check (e.g. duplicate schedule warning)
    if (beforeUpload && !beforeUpload()) return;
    setUploading(prev => [...prev, ...arr.map(f => f.name)]);
    for (const file of arr) {
      // Never let a failure be silent — say what went wrong and what to do about it.
      const fail = (msg) => setUploadErrors(prev => [...prev, { id: `${file.name}-${prev.length}`, msg }]);
      const tooBig = oversizeMessage(file);
      if (tooBig) { fail(tooBig); continue; }
      try {
        const form = new FormData();
        await appendUpload(form, file, { scope: 'project' });
        form.append('tab', tab);
        form.append('tags', JSON.stringify([autoTag]));
        const res  = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: form });
        if (res.ok) {
          const data = await res.json();
          // API returns { file, contractUpdate, scheduleUpdate, designScheduleUpdate }
          onFileAdded?.(data.file, data.contractUpdate ?? null, data.scheduleUpdate ?? null, data.designScheduleUpdate ?? null);
        } else {
          fail(await uploadErrorMessage(res, file));
        }
      } catch (e) {
        fail(uploadThrowMessage(e, file));
      }
    }
    setUploading(prev => prev.filter(n => !arr.map(f => f.name).includes(n)));
  }

  async function deleteFile(id) {
    if (!confirm('Delete this file?')) return;
    await fetch(`/api/projects/${projectId}/files/${id}`, { method: 'DELETE' });
    onFileDeleted?.(id);
  }

  async function reparseFile(fileId) {
    setReparsing(prev => ({ ...prev, [fileId]: true }));
    setReparseMsg(prev => ({ ...prev, [fileId]: '' }));
    try {
      const res  = await fetch(`/api/projects/${projectId}/files/${fileId}/reparse`, { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setReparseMsg(prev => ({ ...prev, [fileId]: data.error }));
      } else {
        setReparseMsg(prev => ({ ...prev, [fileId]: `✓ Found ${data.count} milestone${data.count !== 1 ? 's' : ''} — refresh to see Gantt` }));
      }
    } catch (e) {
      setReparseMsg(prev => ({ ...prev, [fileId]: 'Parse failed' }));
    } finally {
      setReparsing(prev => ({ ...prev, [fileId]: false }));
    }
  }

  const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-5">
      {viewingFile && <PdfViewerModal file={viewingFile} projectId={projectId} onClose={() => setViewingFile(null)} />}
      {!hideHeader && (
        <>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
          </div>
          {/* Stat widget */}
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 inline-flex flex-col gap-1 min-w-[200px]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{statLabel}</p>
            {statValue
              ? <p className="text-2xl font-bold text-slate-800">{statValue}</p>
              : <p className="text-sm text-slate-300 italic">No {title.toLowerCase()} uploaded yet</p>}
          </div>
        </>
      )}
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm text-slate-600">Drop PDFs here or click to browse</p>
        <p className="text-xs text-slate-400">PDF only · automatically tagged as {autoTag}</p>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" multiple className="hidden"
          onChange={e => { upload(e.target.files); e.target.value = ''; }} />
      </div>
      {/* Upload progress */}
      {uploading.length > 0 && uploading.map((name, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          <svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          <span className="truncate">Uploading {name}…</span>
        </div>
      ))}
      {/* Upload failures — stay on screen until dismissed so nothing fails silently */}
      {uploadErrors.map(err => (
        <div key={err.id} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="flex-1">{err.msg}</span>
          <button
            onClick={() => setUploadErrors(prev => prev.filter(e => e.id !== err.id))}
            className="shrink-0 text-red-400 hover:text-red-600 font-bold leading-none"
            title="Dismiss"
          >×</button>
        </div>
      ))}
      {/* File list */}
      {files.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title} — {files.length} document{files.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="divide-y divide-slate-50">
            {files.map(f => {
              const isPdf = f.originalName?.toLowerCase().endsWith('.pdf');
              const fileUrl = `/api/uploads/${f.storedPath?.replace(/\\/g, '/')}`;
              return (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 transition-colors">
                  {/* PDF icon */}
                  <svg className="w-6 h-7 text-red-400 shrink-0" viewBox="0 0 24 28" fill="none">
                    <rect width="24" height="28" rx="2" fill="currentColor" fillOpacity="0.12"/>
                    <text x="12" y="18" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold">PDF</text>
                  </svg>
                  {/* Filename + optional summary */}
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => isPdf && setViewingFile(f)}
                      className="text-sm text-slate-800 hover:text-amber-600 transition-colors text-left block w-full truncate"
                    >
                      {f.originalName}
                    </button>
                    {showSummary && (() => {
                      const summary = extractSummary(f.textContent);
                      return summary ? (
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-2">{summary}</p>
                      ) : null;
                    })()}
                  </div>
                  {/* Extra (e.g. CO amount) */}
                  {renderFileExtra?.(f)}
                  {/* Date */}
                  <span className="text-xs text-slate-400 shrink-0">{fmtDate(f.createdAt)}</span>
                  {/* Download */}
                  <a href={fileUrl} download={f.originalName}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors shrink-0" title="Download">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </a>
                  {/* Delete */}
                  <button onClick={() => deleteFile(f.id)}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0" title="Delete">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectHubClient({ userId, userRole, project, budget, peerReviewTotal, clients = [], allUsers = [], initialFiles = [], initialDesignInfo = {}, masterTypes = [], meetingNotesCount = 0 }) {
  // Inline super-admin check — the auth helper module imports next/headers
  // which isn't usable in a client component, so we replicate the predicate
  // here. Mirrors isSuperAdmin() in src/lib/auth.js exactly.
  const isSuper = userRole === 'SUPER_ADMIN' || userRole === 'ILC_ADMIN';

  async function copyProjectAsJson() {
    try {
      const res = await fetch(`/api/admin/projects/${project.id}/export`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Export failed (${res.status}): ${body?.error || 'unknown error'}`);
        return;
      }
      const json = await res.json();
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      // Lightweight inline confirmation — avoids hauling in a toast lib.
      const el = document.getElementById('qc-export-toast');
      if (el) {
        el.textContent = 'Copied! Paste into Hive / chat.';
        el.style.opacity = '1';
        setTimeout(() => { el.style.opacity = '0'; }, 2500);
      }
    } catch (err) {
      alert(`Export failed: ${err?.message || err}`);
    }
  }
  const router       = useRouter();
  const searchParams = useSearchParams();
  const pathname     = usePathname();

  // URL-driven tab state — ?tab=budgets persists on refresh and is shareable
  const validTabs = getValidTabIds(project.serviceType);
  const rawTab    = searchParams.get('tab');
  const activeTab = validTabs.includes(rawTab) ? rawTab : getDefaultTab();

  function setActiveTab(tabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Sidebar nav config for this project's service type
  const navConfig = NAV_CONFIG[project.serviceType] ?? NAV_CONFIG.fullDesign;
  const [phase,          setPhase]          = useState(project.phase || 'sd');
  const [savingPhase,    setSavingPhase]    = useState(false);
  const [serviceType,    setServiceType]    = useState(project.serviceType || '');
  const [savingSvc,      setSavingSvc]      = useState(false);
  const [flagged,        setFlagged]        = useState(project.flagged || false);
  const [flagNote,       setFlagNote]       = useState(project.flagNote || '');
  const [projectName,    setProjectName]    = useState(project.name || '');
  const [editingName,    setEditingName]    = useState(false);
  const [nameInput,      setNameInput]      = useState('');
  const [savingFlag,     setSavingFlag]     = useState(false);
  const [showFlagNote,   setShowFlagNote]   = useState(false);
  const [assignees,      setAssignees]      = useState(project.assignees || []);
  const [showAssignees,  setShowAssignees]  = useState(false);
  const [assigningClient, setAssigningClient] = useState(false);
  const [clientId,       setClientId]       = useState('');
  const [savingClient,   setSavingClient]   = useState(false);
  const [showBudgetNudge, setShowBudgetNudge] = useState(false);

  useEffect(() => {
    const hasBudget = budget?.totalWithControls > 0 || peerReviewTotal > 0;
    const hasSeenNudge = localStorage.getItem(`budget_nudge_${project.id}`);
    if (!hasBudget && !hasSeenNudge) {
      setShowBudgetNudge(true);
    }
  }, [budget, peerReviewTotal, project.id]);
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

  async function saveProjectName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === projectName) { setEditingName(false); return; }
    setProjectName(trimmed);
    setEditingName(false);
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
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
  const codeRef = { iecc: useRef(null), ibc: useRef(null), nec: useRef(null), ashrae: useRef(null), nfpa: useRef(null) };
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
          {/* Breadcrumb + admin tools */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Link href="/dashboard" className="hover:text-amber-600 transition-colors">Dashboard</Link>
              <span>›</span>
              {project.client && (
                <>
                  <Link href={`/clients/${project.client.id}`} className="text-slate-500 hover:text-amber-600 transition-colors">
                    {project.client.name}
                  </Link>
                  <span>›</span>
                </>
              )}
              <span className="text-slate-600 font-medium">{project.name}</span>
            </div>
            {isSuper && (
              <div className="flex items-center gap-2">
                <span
                  id="qc-export-toast"
                  className="text-xs text-green-700 transition-opacity"
                  style={{ opacity: 0 }}
                />
                <button
                  onClick={copyProjectAsJson}
                  title="Copy full project data (inputs + budget breakdown + pricing) as JSON. For QC / debugging."
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 text-[11px] font-medium transition-colors"
                >
                  Copy as JSON
                </button>
              </div>
            )}
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
                {/* Project name — click pencil to rename */}
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveProjectName(); if (e.key === 'Escape') setEditingName(false); }}
                      className="text-2xl font-bold text-slate-900 border-b-2 border-blue-400 bg-transparent outline-none leading-tight w-72"
                    />
                    <button onClick={saveProjectName} className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">Save</button>
                    <button onClick={() => setEditingName(false)} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h1 className="text-2xl font-bold text-slate-900 leading-tight">{projectName}</h1>
                    <button
                      onClick={() => { setNameInput(projectName); setEditingName(true); }}
                      title="Rename project"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                )}
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
                  disabled={savingPhase}
                  value={phase}
                  onChange={e => updatePhase(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-700 disabled:opacity-50"
                >
                  {PROJECT_PHASES.map(p => (
                    <option key={p.value} value={p.value}>{p.label} — {p.long}</option>
                  ))}
                </select>

                {/* Service type selector */}
                <select
                  disabled={savingSvc}
                  value={serviceType}
                  onChange={e => updateServiceType(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-700 disabled:opacity-50"
                >
                  <option value="">Service type…</option>
                  {SERVICE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>

                {(savingPhase || savingSvc) && <span className="text-xs text-slate-400">Saving...</span>}

                {budgetTotal > 0 && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${budgetMeta.color}`}>
                    {formatCurrency(budgetTotal)} {budgetMeta.label}
                  </span>
                )}

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

      </div>

      {/* Two-column body: sidebar + content */}
      <div className="flex">
        <ProjectSidebar
          config={navConfig}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userId={userId}
          badges={{ meetings: meetingNotesCount }}
        />
        <div className="flex-1 min-w-0">
          {/* Project Search */}
          <ProjectSearch projectId={project.id} />

          {showBudgetNudge && (
            <div className="bg-amber-50 border-b border-amber-200 px-8 py-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-amber-900 font-medium">Your project is ready</p>
                <p className="text-xs text-amber-800 mt-1">Open the Budgets tab to get started with budget calculations.</p>
              </div>
              <button onClick={() => { setShowBudgetNudge(false); localStorage.setItem(`budget_nudge_${project.id}`, 'true'); }} className="text-xs text-amber-600 hover:text-amber-700 font-medium shrink-0">Dismiss</button>
            </div>
          )}

          {/* Tab content — correspondence gets no padding (owns its own layout) */}
          <div className={activeTab === 'correspondence' ? '' : 'px-8 py-8'}>

        {/* ── DASHBOARD ────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <ProjectDashboard
              project={project}
              budget={budget}
              contractValue={contractValue}
              files={allFiles}
              onProjectUpdate={() => router.refresh()}
              onProjectDataUpdate={() => router.refresh()}
              designInfo={designInfo}
              saveDesignInfo={saveDesignInfo}
              clients={clients}
            />
            <ProjectPeopleCard projectId={project.id} />
            <ProjectActivityFeed projectId={project.id} />
          </div>
        )}

        {/* ── PROPOSAL ─────────────────────────────────────────────────── */}
        {activeTab === 'proposal' && (
          <ProposalTab projectId={project.id} />
        )}

        {/* ── BUDGETS ──────────────────────────────────────────────────── */}
        {activeTab === 'budgets' && (
          <div className="space-y-6">

            {/* ── Create / Open Budget type cards ────────────────────────── */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold text-slate-800">Budgets</h2>
                <BudgetQCBadge projectId={project.id} />
              </div>

                {/* Budget type cards — click any to navigate directly, no confirmation */}
              {convertLoading && (
                <div className="mb-4 flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
                  <svg className="animate-spin w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Switching budget type…
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
                      <div className="text-sm font-semibold text-amber-800">Conceptual Budget</div>
                      <div className="text-xs text-slate-400 mt-0.5">Short questionnaire · quick SF estimate</div>
                    </div>
                  </Link>
                ) : (
                  <button onClick={() => convertBudgetType('conceptual')} disabled={convertLoading}
                    className="group flex flex-col gap-2 p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50 transition-all text-left disabled:opacity-60">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-amber-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">Conceptual Budget</div>
                      <div className="text-xs text-slate-400 mt-0.5">Short questionnaire · quick SF estimate</div>
                    </div>
                  </button>
                )}

                {/* Full Design Budget */}
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
                      <div className="text-sm font-semibold text-amber-800">Full Design Questionnaire</div>
                      <div className="text-xs text-slate-400 mt-0.5">Full questionnaire · all design questions</div>
                    </div>
                  </Link>
                ) : (
                  <button onClick={() => convertBudgetType('design')} disabled={convertLoading}
                    className="group flex flex-col gap-2 p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50 transition-all text-left disabled:opacity-60">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-amber-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">Full Design Questionnaire</div>
                      <div className="text-xs text-slate-400 mt-0.5">Full questionnaire · all design questions</div>
                    </div>
                  </button>
                )}

                {/* Budget Matrix (was Peer Review) */}
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
                      <div className="text-sm font-semibold text-blue-800">Budget Matrix</div>
                      <div className="text-xs text-slate-400 mt-0.5">Line-by-line fixture matrix</div>
                    </div>
                  </Link>
                ) : (
                  <button onClick={() => convertBudgetType('peer_review')} disabled={convertLoading}
                    className="group flex flex-col gap-2 p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all text-left disabled:opacity-60">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">Budget Matrix</div>
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
        {activeTab === 'drawings' && (() => {
          return (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Drawing Sets</h2>
                  <p className="text-sm text-slate-400 mt-0.5">SD, DD, CD, IFC drawing packages · upload by submission · tag by phase</p>
                </div>
              </div>

              <DrawingsTab projectId={project.id} />
            </div>
          );
        })()}

        {/* ── CORRESPONDENCE ───────────────────────────────────────────── */}
        {activeTab === 'correspondence' && (
          <CorrespondenceTab
            projectId={project.id}
            projectName={project.name}
          />
        )}

        {/* ── SUBMITTALS ───────────────────────────────────────────────── */}
        {activeTab === 'submittals' && (
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

        {/* ── CONSTRUCTION SCHEDULE ────────────────────────────────────── */}
        {activeTab === 'construction-schedule' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Construction Schedule</h2>
              <p className="text-sm text-slate-400 mt-0.5">Upload a PDF — milestones auto-parse and the Gantt updates automatically</p>
            </div>
            <CAScheduleCard
              files={filesByTab('ca')}
              projectId={project.id}
              onFileUpdated={updatedFile => setAllFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f))}
            />
            <AutoTaggedFileTab
              title="Construction Schedule"
              subtitle="All uploads are automatically tagged as Construction Schedule · milestones parse from the PDF"
              autoTag="Construction Schedule"
              files={filesByTab('ca').filter(f => {
                try { return (typeof f.tags === 'string' ? JSON.parse(f.tags) : f.tags ?? []).includes('Construction Schedule'); } catch { return false; }
              })}
              projectId={project.id}
              tab="ca"
              onFileAdded={onFileAdded}
              onFileDeleted={onFileDeleted}
              statLabel="Schedule Files"
              statValue={null}
              hideHeader
              showReparseButton
              beforeUpload={() => {
                const existing = filesByTab('ca').some(f => {
                  try { return (typeof f.tags === 'string' ? JSON.parse(f.tags) : f.tags ?? []).includes('Construction Schedule'); } catch { return false; }
                });
                if (!existing) return true;
                return window.confirm(
                  'A construction schedule is already on file.\n\nUpload this as the new version? The existing file will remain, but this one will be used for milestones going forward.'
                );
              }}
            />
          </div>
        )}

        {/* ── RFIs ─────────────────────────────────────────────────────── */}
        {activeTab === 'rfis' && (
          <RFIModule
            projectId={project.id}
            allUsers={allUsers}
            currentUserName={project.createdBy?.name ?? 'ILC Designer'}
          />
        )}

        {/* ── CHANGE ORDERS ────────────────────────────────────────────── */}
        {activeTab === 'change-orders' && (
          <div className="space-y-6">
            {/* New structured CO system */}
            <ChangeOrdersTab projectId={project.id} />

            {/* Historical PDF uploads (legacy) */}
            {(() => {
              const coFiles = filesByTab('ca').filter(f => {
                try { return (typeof f.tags === 'string' ? JSON.parse(f.tags) : f.tags ?? []).includes('Change Order'); } catch { return false; }
              });
              if (coFiles.length === 0) return null;
              return (
                <details className="group">
                  <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors list-none select-none">
                    <svg className="w-3.5 h-3.5 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Historical CO Documents ({coFiles.length} uploaded PDFs)
                  </summary>
                  <div className="mt-3">
                    <AutoTaggedFileTab
                      title=""
                      subtitle="Legacy CO PDF uploads — for reference only"
                      autoTag="Change Order"
                      files={coFiles}
                      projectId={project.id}
                      tab="ca"
                      onFileAdded={onFileAdded}
                      onFileDeleted={onFileDeleted}
                      statLabel=""
                      statValue={null}
                      hideHeader
                      renderFileExtra={f => f.parsedAmount != null && (
                        <span className="text-sm font-semibold text-blue-700 shrink-0">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(f.parsedAmount)}
                        </span>
                      )}
                    />
                  </div>
                </details>
              );
            })()}
          </div>
        )}

        {/* ── CONTRACTS (Supply) ───────────────────────────────────────── */}
        {activeTab === 'contracts' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Supply Contracts</h2>
              <p className="text-sm text-slate-400 mt-0.5">Supply contracts · COIs · SOVs · Amendments — supply contracts auto-reviewed by Claude AI</p>
            </div>
            <ContractWidgets
              projectId={project.id}
              value={contractValue}
              signedDate={contractSignedDate}
              onValueChange={setContractValue}
              onSignedDateChange={setContractSignedDate}
              supplyOnly
            />
            <ContractsPanel
              projectId={project.id}
              initialFiles={filesByTab('contracts')}
              onFileAdded={onFileAdded}
              onFileDeleted={onFileDeleted}
              supplyOnly
            />
          </div>
        )}

        {/* ── MEETINGS ─────────────────────────────────────────────────── */}
        {activeTab === 'meetings' && (
          <div className="space-y-6">
            <MeetingNotes projectId={project.id} />
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Meeting Files</h3>
              <FileDropZone projectId={project.id} tab="meetings" initialFiles={filesByTab('meetings')} onFileAdded={onFileAdded} onFileDeleted={onFileDeleted} />
            </div>
          </div>
        )}

        {/* ── CODE ──────────────────────────────────────────────────────── */}
        {activeTab === 'code' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Code</h2>
                <p className="text-sm text-slate-400 mt-0.5">Design criteria, code research, and LPD calculations</p>
              </div>
            </div>

            {/* Design criteria fields */}
            <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Design Criteria</p>
              {(() => {
                const lines = (designInfo.codes || '').split('\n').map(l => l.trim()).filter(Boolean);
                const extract = prefix => {
                  const line = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase()));
                  return line ? line.slice(prefix.length).trim() : '';
                };
                const parsed = {
                  iecc:   extract('IECC'),
                  ibc:    extract('IBC'),
                  nec:    extract('NEC'),
                  ashrae: extract('ASHRAE 90.1') || extract('ASHRAE'),
                  nfpa:   extract('NFPA 101')    || extract('NFPA'),
                };
                function saveCodeFields() {
                  const parts = [
                    codeRef.iecc.current?.value   ? `IECC ${codeRef.iecc.current.value.trim()}`          : '',
                    codeRef.ibc.current?.value    ? `IBC ${codeRef.ibc.current.value.trim()}`            : '',
                    codeRef.nec.current?.value    ? `NEC ${codeRef.nec.current.value.trim()}`            : '',
                    codeRef.ashrae.current?.value ? `ASHRAE 90.1 ${codeRef.ashrae.current.value.trim()}` : '',
                    codeRef.nfpa.current?.value   ? `NFPA 101 ${codeRef.nfpa.current.value.trim()}`     : '',
                  ].filter(Boolean).join('\n');
                  if (parts !== (designInfo.codes || '').trim()) saveDesignInfo('codes', parts);
                }
                const fieldCls = 'w-full text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent';
                const labelCls = 'block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5';
                return (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {[
                      { label: 'IECC',        ref: codeRef.iecc,   val: parsed.iecc,   ph: '2021' },
                      { label: 'IBC',         ref: codeRef.ibc,    val: parsed.ibc,    ph: '2021' },
                      { label: 'NEC',         ref: codeRef.nec,    val: parsed.nec,    ph: '2020' },
                      { label: 'ASHRAE 90.1', ref: codeRef.ashrae, val: parsed.ashrae, ph: '2019' },
                      { label: 'NFPA 101',    ref: codeRef.nfpa,   val: parsed.nfpa,   ph: '2021' },
                    ].map(f => (
                      <div key={f.label}>
                        <label className={labelCls}>{f.label}</label>
                        <input ref={f.ref} type="text" placeholder={f.ph} defaultValue={f.val}
                          onBlur={saveCodeFields} className={fieldCls} />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Code Intelligence — passes code editions + location + project type */}
            <ProjectCodeSearch
              projectContext={{
                projectName:  project.name,
                buildingType: buildingTypeLabel(project.buildingType),
                city:         project.city  || '',
                state:        project.state || '',
                serviceType:  project.serviceType || '',
                codes: (() => {
                  const lines = (designInfo.codes || '').split('\n').map(l => l.trim()).filter(Boolean);
                  const extract = prefix => { const ln = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase())); return ln ? ln.slice(prefix.length).trim() : ''; };
                  return {
                    iecc:   extract('IECC'),
                    ibc:    extract('IBC'),
                    nec:    extract('NEC'),
                    ashrae: extract('ASHRAE 90.1') || extract('ASHRAE'),
                    nfpa:   extract('NFPA 101')    || extract('NFPA'),
                  };
                })(),
              }}
            />

            {/* LPD Calculator */}
            <LPDCalculator projectId={project.id} />
          </div>
        )}

        {/* ── DESIGN SCHEDULE ───────────────────────────────────────────── */}
        {activeTab === 'design-schedule' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Design Schedule</h2>
              <p className="text-sm text-slate-400 mt-0.5">Milestones, review dates, and submission deadlines</p>
            </div>
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

        {/* ── DESIGN CONTRACTS ──────────────────────────────────────────── */}
        {activeTab === 'design-contracts' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Design Contracts</h2>
              <p className="text-sm text-slate-400 mt-0.5">Design service agreements, scopes of work, and fee schedules</p>
            </div>
            {/* Design contract value + signed date */}
            <ContractWidgets
              projectId={project.id}
              designValue={designContractValue}
              designDate={designContractDate}
              onDesignValueChange={setDesignContractValue}
              onDesignDateChange={setDesignContractDate}
              designOnly
            />
            {/* Design contract files */}
            <ContractsPanel
              projectId={project.id}
              initialFiles={filesByTab('contracts')}
              onFileAdded={onFileAdded}
              onFileDeleted={onFileDeleted}
              designOnly
            />
          </div>
        )}

        {/* ── FIXTURE SCHEDULE ─────────────────────────────────────────── */}
        {activeTab === 'fixture-schedule' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Fixture Schedule</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                {['peerReview', 'bidOnly'].includes(project.serviceType)
                  ? 'Parse a fixture schedule PDF to auto-populate the table, or enter manually · Push to Bid to create a versioned matrix'
                  : 'Specify products for each fixture type · Push to Bid to create a versioned pricing run'}
              </p>
            </div>
            <FixtureScheduleEditor projectId={project.id} serviceType={project.serviceType} />
            <CodeCheckPanel projectId={project.id} />
            <HumanErrorRadar projectId={project.id} />
          </div>
        )}

        {/* ── TAKEOFFS ─────────────────────────────────────────────────── */}
        {activeTab === 'takeoffs' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Takeoffs</h2>
                <p className="text-sm text-slate-400 mt-0.5">Fixture counts across submissions — tag each upload with its phase (SD, DD, CD, IFC…)</p>
              </div>
            </div>
            <UnitMatrixUpload projectId={project.id} />
            <SiteDataUpload projectId={project.id} />
            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">Fixture Takeoffs</div>
            <FileDropZone projectId={project.id} tab="takeoffs" initialFiles={filesByTab('takeoffs')} onFileAdded={onFileAdded} onFileDeleted={onFileDeleted} />
            <TakeoffDashboard files={filesByTab('takeoffs')} />
          </div>
        )}

        {/* ── ESTIMATE ─────────────────────────────────────────────────── */}
        {/* TODO: estimate tab removed per nav refactor — content to be absorbed into Drawings tab (Feature 1) */}
        {/* {activeTab === 'estimate' && (
          <ParametricEstimatePanel projectId={project.id} />
        )} */}

        {/* ── SHIP SCHEDULE ────────────────────────────────────────────── */}
        {activeTab === 'ship-schedule' && (
          <ShipScheduleTab projectId={project.id} />
        )}

        {/* ── CLIENT PORTAL ACCESS ─────────────────────────────────────── */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <ContactsTab projectId={project.id} />
            <NotificationSettingsTab projectId={project.id} />
          </div>
        )}

          </div>
        </div>
      </div>
    </div>

    <ProjectChat projectId={project.id} />
    </>
  );
}
