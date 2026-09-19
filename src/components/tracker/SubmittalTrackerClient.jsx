'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TrackerTable from './TrackerTable';
import TrackerPanel from './TrackerPanel';
import ImportModal from './ImportModal';
import NewSubmissionModal from './NewSubmissionModal';
import TocImportModal from './TocImportModal';
import { appendUpload } from '@/lib/uploadClient';
import { postParked } from '@/lib/parkedFetch';

const ALL_ROLES = [
  { key: 'ILC',       label: 'ILC Studios' },
  { key: 'Developer', label: 'Developer' },
  { key: 'Architect', label: 'Architect' },
  { key: 'LA',        label: 'Landscape Architect' },
  { key: 'ID',        label: 'Interior Designer' },
  { key: 'EE',        label: 'Electrical Engineer' },
  { key: 'GC',        label: 'General Contractor' },
  { key: 'EC',        label: 'Electrical Contractor' },
];

export default function SubmittalTrackerClient({ projectId, projectName }) {
  const router = useRouter();
  const [tracker,    setTracker]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [activeItem, setActiveItem] = useState(null); // item open in right panel
  const [showImport,    setShowImport]    = useState(false);
  const [showTocImport, setShowTocImport] = useState(false);
  const [showNewSub,    setShowNewSub]    = useState(false);
  const [creating,       setCreating]       = useState(false);
  const [showRoles,      setShowRoles]      = useState(false);
  const [extracting,     setExtracting]     = useState(false);
  const [extractResult,  setExtractResult]  = useState(null); // { notesExtracted, newTypeCodes }
  const [openItems,      setOpenItems]      = useState([]);
  const [showOpenItems,  setShowOpenItems]  = useState(false);
  const extractFileRef = useRef(null);

  const fetchTracker = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/tracker`);
    if (res.ok) {
      const { tracker } = await res.json();
      setTracker(tracker);
      // keep active item in sync
      if (activeItem && tracker) {
        const refreshed = tracker.items.find(i => i.id === activeItem.id);
        if (refreshed) setActiveItem(refreshed);
      }
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchTracker(); }, [fetchTracker]);

  async function fetchOpenItems() {
    const res = await fetch(`/api/projects/${projectId}/tracker/open-items`);
    if (res.ok) {
      const data = await res.json();
      setOpenItems(data.openItems || []);
    }
  }
  useEffect(() => { fetchOpenItems(); }, [projectId]);

  async function handleExtractFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setExtracting(true);
    setExtractResult(null);
    try {
      const fd = new FormData();
      await appendUpload(fd, file, { scope: 'project' });
      fd.append('submissionName', file.name.replace(/\.pdf$/i, ''));
      // Park-and-poll: the read runs in steps behind the front door and the
      // answer arrives with the same body and status it always had.
      const res  = await postParked(`/api/projects/${projectId}/tracker/extract`, fd);
      const data = await res.json();
      if (res.ok) {
        setExtractResult(data);
        await fetchTracker();
        await fetchOpenItems();
      } else {
        setExtractResult({ error: data.error || 'Extraction failed' });
      }
    } catch (err) {
      setExtractResult({ error: err.message });
    }
    setExtracting(false);
  }

  async function createTracker() {
    setCreating(true);
    const res = await fetch(`/api/projects/${projectId}/tracker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) await fetchTracker();
    setCreating(false);
  }

  async function toggleRole(key) {
    const current = JSON.parse(tracker.reviewerRoles);
    const next = current.includes(key)
      ? current.filter(r => r !== key)
      : [...current, key];
    // preserve ALL_ROLES order
    const ordered = ALL_ROLES.map(r => r.key).filter(k => next.includes(k));
    await fetch(`/api/projects/${projectId}/tracker`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewerRoles: ordered }),
    });
    setTracker(prev => ({ ...prev, reviewerRoles: JSON.stringify(ordered) }));
  }

  async function deleteItem(itemId) {
    await fetch(`/api/projects/${projectId}/tracker/items/${itemId}`, { method: 'DELETE' });
    if (activeItem?.id === itemId) setActiveItem(null);
    await fetchTracker();
  }

  async function addReview(versionId, reviewData) {
    const res = await fetch(`/api/projects/${projectId}/tracker/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId, ...reviewData }),
    });
    if (res.ok) await fetchTracker();
    return res.ok;
  }

  async function deleteReview(reviewId) {
    await fetch(`/api/projects/${projectId}/tracker/reviews/${reviewId}`, { method: 'DELETE' });
    await fetchTracker();
  }

  async function addItem(itemData) {
    await fetch(`/api/projects/${projectId}/tracker/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData),
    });
    await fetchTracker();
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  function computeStats() {
    if (!tracker) return { total: 0, approved: 0, resubmit: 0, pending: 0 };
    let approved = 0, resubmit = 0, pending = 0;
    for (const item of tracker.items) {
      const status = getItemOverallStatus(item);
      if (status === 'Approved' || status === 'ApprovedAsNoted') approved++;
      else if (status === 'Resubmit') resubmit++;
      else pending++;
    }
    return { total: tracker.items.length, approved, resubmit, pending };
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading tracker…</p>
      </div>
    );
  }

  const roles = tracker ? JSON.parse(tracker.reviewerRoles) : [];
  const stats = computeStats();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {projectName}
        </button>

        <div className="w-px h-5 bg-slate-200" />

        <div className="flex-1">
          <h1 className="text-base font-semibold text-slate-800">Approval Tracker</h1>
          {tracker?.specSection && (
            <p className="text-xs text-slate-400">Spec {tracker.specSection}</p>
          )}
        </div>

        {tracker && (
          <div className="flex items-center gap-2">
            {/* Role config */}
            <div className="relative">
              <button
                onClick={() => setShowRoles(v => !v)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                Reviewers ▾
              </button>
              {showRoles && (
                <div className="absolute right-0 top-9 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-52 space-y-1">
                  {ALL_ROLES.map(r => (
                    <label key={r.key} className="flex items-center gap-2.5 px-1 py-1 rounded hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roles.includes(r.key)}
                        onChange={() => toggleRole(r.key)}
                        className="accent-amber-500"
                      />
                      <span className="text-sm text-slate-700">{r.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* ── Extract Notes from submitted PDF ── */}
            <input ref={extractFileRef} type="file" accept=".pdf" className="hidden" onChange={handleExtractFile} />
            <button
              onClick={() => extractFileRef.current?.click()}
              disabled={extracting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-60"
              title="Upload a reviewed submittal PDF — reviewer notes auto-extracted and added to tracker"
            >
              {extracting ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              )}
              {extracting ? 'Extracting…' : '⚡ Extract Notes'}
            </button>

            {/* Open items badge */}
            {openItems.length > 0 && (
              <button
                onClick={() => setShowOpenItems(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  openItems.some(i => i.isRepeat)
                    ? 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100'
                    : 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'
                }`}
              >
                {openItems.some(i => i.isRepeat) && <span>🔄</span>}
                {openItems.length} open item{openItems.length !== 1 ? 's' : ''}
              </button>
            )}

            <button
              onClick={() => setShowTocImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors"
              title="Parse fixture types from an uploaded submittal PDF"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Parse PDF TOC
            </button>

            <button
              onClick={() => setShowImport(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              Import Fixture Schedule
            </button>

            <button
              onClick={() => setShowNewSub(true)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-sm"
            >
              + New Submission
            </button>
          </div>
        )}
      </div>

      {/* ── Extract result banner ─────────────────────────────────────────── */}
      {extractResult && (
        <div className={`px-6 py-2.5 text-xs flex items-center gap-3 border-b ${
          extractResult.error
            ? 'bg-red-50 text-red-700 border-red-100'
            : 'bg-green-50 text-green-800 border-green-100'
        }`}>
          {extractResult.error ? (
            <><span>⚠ Extraction failed: {extractResult.error}</span></>
          ) : (
            <>
              <span>✓ <strong>{extractResult.notesExtracted}</strong> reviewer note{extractResult.notesExtracted !== 1 ? 's' : ''} extracted from <strong>{extractResult.pagesScanned}</strong> pages</span>
              {extractResult.newTypeCodes?.length > 0 && (
                <span className="text-green-600">· {extractResult.newTypeCodes.length} new fixture type{extractResult.newTypeCodes.length !== 1 ? 's' : ''} added: {extractResult.newTypeCodes.slice(0, 6).join(', ')}{extractResult.newTypeCodes.length > 6 ? '…' : ''}</span>
              )}
            </>
          )}
          <button onClick={() => setExtractResult(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Open items panel ──────────────────────────────────────────────── */}
      {showOpenItems && openItems.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Open Items — Grouped by Responsible Party</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {openItems.length} unresolved · {openItems.filter(i => i.isRepeat).length} repeat{openItems.filter(i => i.isRepeat).length !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={() => setShowOpenItems(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {['ARCH','EE','ID','CONTRACTOR','ILC','OWNERSHIP'].map(party => {
              const items = openItems.filter(i => i.responsibleParty === party);
              if (!items.length) return null;
              const partyLabel = { ARCH:'Architect', EE:'Electrical Engineer', ID:'Interior Designer', CONTRACTOR:'Contractor', ILC:'ILC Studios', OWNERSHIP:'Ownership' }[party] ?? party;
              const hasRepeats = items.some(i => i.isRepeat);
              return (
                <div key={party} className={`rounded-xl border p-3 ${hasRepeats ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-slate-700">{partyLabel}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${hasRepeats ? 'bg-orange-200 text-orange-800' : 'bg-slate-200 text-slate-600'}`}>
                      {items.length}
                    </span>
                    {hasRepeats && <span className="text-[10px] text-orange-600">🔄 repeats</span>}
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, 4).map(item => (
                      <div key={item.id} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                        <span className="font-mono font-bold text-slate-800 shrink-0">{item.typeCode}</span>
                        <span className="truncate">{item.noteText.slice(0, 60)}{item.noteText.length > 60 ? '…' : ''}</span>
                        {item.isRepeat && <span className="text-orange-500 shrink-0" title="Repeat comment">🔄</span>}
                      </div>
                    ))}
                    {items.length > 4 && <p className="text-[10px] text-slate-400">+{items.length - 4} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      {tracker && tracker.items.length > 0 && (
        <div className="bg-white border-b border-slate-100 px-6 py-2.5 flex items-center gap-6 text-xs text-slate-500">
          <span><strong className="text-slate-700">{stats.total}</strong> types</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            <strong className="text-slate-700">{stats.approved}</strong> approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            <strong className="text-slate-700">{stats.resubmit}</strong> resubmit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
            <strong className="text-slate-700">{stats.pending}</strong> pending
          </span>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      {!tracker ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">No tracker yet</p>
            <p className="text-xs text-slate-400 mt-1">Create one to start tracking fixture approvals</p>
          </div>
          <button
            onClick={createTracker}
            disabled={creating}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors shadow-sm disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create Tracker'}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Table area */}
          <div className={`flex-1 overflow-auto transition-all ${activeItem ? 'pr-0' : ''}`}>
            <TrackerTable
              tracker={tracker}
              roles={roles}
              activeItemId={activeItem?.id}
              onSelectItem={item => setActiveItem(prev => prev?.id === item.id ? null : item)}
              onDeleteItem={deleteItem}
              onAddItem={addItem}
            />
          </div>

          {/* Right panel */}
          {activeItem && (
            <TrackerPanel
              item={activeItem}
              submissions={tracker.submissions}
              roles={roles}
              projectId={projectId}
              onClose={() => setActiveItem(null)}
              onAddReview={addReview}
              onDeleteReview={deleteReview}
            />
          )}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showTocImport && (
        <TocImportModal
          projectId={projectId}
          onClose={() => setShowTocImport(false)}
          onImported={() => { setShowTocImport(false); fetchTracker(); }}
        />
      )}

      {showImport && (
        <ImportModal
          projectId={projectId}
          trackerId={tracker?.id}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); fetchTracker(); }}
        />
      )}

      {showNewSub && (
        <NewSubmissionModal
          projectId={projectId}
          tracker={tracker}
          onClose={() => setShowNewSub(false)}
          onCreated={() => { setShowNewSub(false); fetchTracker(); }}
        />
      )}
    </div>
  );
}

// ── Helpers (shared) ─────────────────────────────────────────────────────────

export function getItemOverallStatus(item) {
  // Collect the latest review per reviewer role across all versions
  const latestPerRole = {};
  const allVersions = [...(item.versions || [])].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
  for (const ver of allVersions) {
    for (const rev of ver.reviews || []) {
      latestPerRole[rev.reviewerRole] = rev.status;
    }
  }
  const statuses = Object.values(latestPerRole);
  if (statuses.length === 0) return 'Pending';
  if (statuses.includes('Resubmit')) return 'Resubmit';
  if (statuses.every(s => s === 'Approved')) return 'Approved';
  if (statuses.every(s => s === 'Approved' || s === 'ApprovedAsNoted')) return 'ApprovedAsNoted';
  if (statuses.includes('Approved') || statuses.includes('ApprovedAsNoted')) return 'InProgress';
  return 'Pending';
}

export function statusMeta(status) {
  return {
    Approved:         { label: 'Approved',          color: 'bg-green-100 text-green-700',   dot: 'bg-green-400' },
    ApprovedAsNoted:  { label: 'Approved as Noted', color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-400' },
    Resubmit:         { label: 'Resubmit',           color: 'bg-red-100 text-red-600',       dot: 'bg-red-400'   },
    NoAction:         { label: 'No Action',          color: 'bg-slate-100 text-slate-500',   dot: 'bg-slate-300' },
    InProgress:       { label: 'In Progress',        color: 'bg-blue-100 text-blue-600',     dot: 'bg-blue-400'  },
    Pending:          { label: 'Pending',            color: 'bg-slate-50 text-slate-400',    dot: 'bg-slate-200' },
  }[status] ?? { label: status, color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' };
}
