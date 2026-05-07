'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TrackerTable from './TrackerTable';
import TrackerPanel from './TrackerPanel';
import ImportModal from './ImportModal';
import NewSubmissionModal from './NewSubmissionModal';
import TocImportModal from './TocImportModal';

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
  const [creating,   setCreating]   = useState(false);
  const [showRoles,  setShowRoles]  = useState(false);

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
