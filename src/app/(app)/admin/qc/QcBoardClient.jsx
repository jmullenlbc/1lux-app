'use client';
import { useState } from 'react';
import ConfirmArchiveModal, { ArchiveBoxIcon, setArchived } from '@/components/salesAutomation/ConfirmArchiveModal';

const SEV_STYLE = {
  BLOCKER:  'bg-red-50 border-red-200 text-red-700',
  MAJOR:    'bg-amber-50 border-amber-200 text-amber-700',
  MINOR:    'bg-blue-50 border-blue-200 text-blue-700',
  COSMETIC: 'bg-slate-100 border-slate-200 text-slate-500',
};

const STATUSES     = ['NEW', 'IN_PROGRESS', 'FIXED'];
const STATUS_LABEL = { NEW: 'New', IN_PROGRESS: 'In Progress', FIXED: 'Fixed' };
const STATUS_DOT   = { NEW: 'bg-slate-400', IN_PROGRESS: 'bg-amber-500', FIXED: 'bg-green-500' };
const STATUS_ACTIVE = {
  NEW:         "bg-orange-50 border border-orange-400 text-orange-700",
  IN_PROGRESS: "bg-orange-50 border border-orange-400 text-orange-700",
  FIXED:       "bg-orange-50 border border-orange-400 text-orange-700",
};

function sevLabel(s = '') {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function timeAgo(str) {
  const diff = Math.floor((Date.now() - new Date(str)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(str) {
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function shortId(id = '') {
  return '#' + id.slice(-6).toUpperCase();
}

// Staff reports link a user. A public beta visitor has no account (reporterId
// is null), so the name/email they typed ride on the report itself.
function reporterLabel(bug, short = false) {
  const trim = email => (email && short ? email.split('@')[0] : email);
  return bug.reporter?.name || trim(bug.reporter?.email)
      || bug.reporterName   || trim(bug.reporterEmail)
      || 'No name given';
}

function BetaTag() {
  return (
    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-semibold uppercase tracking-wide">
      Beta client
    </span>
  );
}

function BugCard({ bug, active, onClick }) {
  return (
    <div
      onClick={() => onClick(bug.id)}
      className={`bg-white border rounded-xl shadow-sm p-3.5 cursor-pointer transition-all hover:shadow-md ${
        active ? 'border-orange-400 ring-1 ring-orange-200' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${SEV_STYLE[bug.severity]}`}>
          {sevLabel(bug.severity)}
        </span>
        <span className="text-[11px] font-mono text-slate-500">{shortId(bug.id)}</span>
      </div>
      <div className="text-sm font-medium text-slate-800 leading-snug">{bug.title}</div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {bug.module && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-500">
            {bug.module}
          </span>
        )}
        {bug.assignee && (
          <span className="text-[11px] text-amber-600">
            → {bug.assignee.name || bug.assignee.email.split('@')[0]}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          {bug.source === 'PUBLIC' && <BetaTag />}
          {reporterLabel(bug, true)}
        </span>
        <span>{timeAgo(bug.createdAt)}</span>
      </div>
    </div>
  );
}

export default function QcBoardClient({ reports: initial, users, currentUser, focusId }) {
  const [reports,  setReports]  = useState(initial);
  const [activeId, setActiveId] = useState(focusId || null);
  const [open,     setOpen]     = useState(!!focusId);
  const [saving,   setSaving]   = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveError, setArchiveError] = useState('');

  const active = reports.find(r => r.id === activeId) || null;

  function openDrawer(id) { setActiveId(id); setOpen(true); }
  function closeDrawer()  { setOpen(false); setTimeout(() => setActiveId(null), 280); }

  async function patchReport(id, changes) {
    setSaving(true);
    try {
      const res = await fetch(`/api/qc/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setReports(prev => prev.map(r => r.id === id ? updated : r));
    } finally {
      setSaving(false);
    }
  }

  // Bug reports are archived, never deleted (Mike, 2026-09-12). The report,
  // its screenshot and its recording all stay; Restore puts it back.
  async function archiveReport(id, archived) {
    setSaving(true);
    setArchiveError('');
    try {
      const err = await setArchived(`/api/qc/reports/${id}`, archived);
      if (err) { setArchiveError(err); return false; }
      setReports(prev => prev.map(r => r.id === id ? {
        ...r,
        archivedAt: archived ? new Date().toISOString() : null,
        archivedBy: archived ? { id: currentUser?.id, name: currentUser?.name, email: currentUser?.email } : null,
      } : r));
      return true;
    } finally {
      setSaving(false);
    }
  }

  const live       = reports.filter(r => !r.archivedAt);
  const archivedList = reports.filter(r => r.archivedAt);
  const byStatus   = s => live.filter(r => r.status === s);
  const counts     = Object.fromEntries(STATUSES.map(s => [s, byStatus(s).length]));

  return (
    <div className="p-6 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-800">QC Bug Tracker</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Every report auto-captures screenshot, console errors, and failed network requests.
            </div>
          </div>
          <div className="flex items-center gap-5 text-center">
            <div>
              <div className="text-xl font-bold text-slate-600 font-mono tabular-nums">{counts.NEW}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">New</div>
            </div>
            <div>
              <div className="text-xl font-bold text-amber-600 font-mono tabular-nums">{counts.IN_PROGRESS}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">In Progress</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600 font-mono tabular-nums">{counts.FIXED}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fixed</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mr-1">Severity</span>
          {Object.entries(SEV_STYLE).map(([k, cls]) => (
            <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${cls}`}>
              {sevLabel(k)}
            </span>
          ))}
          {archivedList.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived(v => !v)}
              className="ml-auto text-[11px] text-slate-500 hover:text-slate-700 hover:underline"
            >
              {showArchived ? 'Hide archived' : `Show archived (${archivedList.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Archived reports, off the board, one click to open or restore */}
      {showArchived && archivedList.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="w-2 h-2 rounded-full bg-slate-300" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Archived</span>
            <span className="ml-auto text-[11px] text-slate-500">{archivedList.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 opacity-75">
            {archivedList.map(b => (
              <BugCard key={b.id} bug={b} active={activeId === b.id} onClick={openDrawer} />
            ))}
          </div>
        </div>
      )}

      {/* Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUSES.map(status => (
          <div key={status}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {STATUS_LABEL[status]}
              </span>
              <span className="ml-auto text-[11px] text-slate-500">{counts[status]}</span>
            </div>
            <div className="space-y-3 min-h-[80px]">
              {byStatus(status).length === 0
                ? <div className="text-xs text-slate-500 px-1 py-4">No reports</div>
                : byStatus(status).map(b => (
                  <BugCard key={b.id} bug={b} active={activeId === b.id} onClick={openDrawer} />
                ))
              }
            </div>
          </div>
        ))}
      </div>

      {/* Drawer backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={closeDrawer} />
      )}

      {/* Detail Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto transition-transform duration-[250ms] ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {active && (
          <div className="p-6">

            {/* Drawer header */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-mono text-slate-500">{shortId(active.id)}</span>
              <button onClick={closeDrawer} className="text-slate-500 hover:text-slate-700 text-xl leading-none">
                &times;
              </button>
            </div>

            {active.archivedAt && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs text-slate-600">
                  Archived {formatDate(active.archivedAt)}
                  {active.archivedBy && <> by {active.archivedBy.name || active.archivedBy.email}</>}
                </span>
                <button
                  onClick={() => archiveReport(active.id, false)}
                  disabled={saving}
                  className="text-xs font-semibold text-amber-700 hover:underline disabled:opacity-40"
                >
                  Restore
                </button>
              </div>
            )}

            {/* Severity + module badges */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${SEV_STYLE[active.severity]}`}>
                {sevLabel(active.severity)}
              </span>
              {active.module && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-500">
                  {active.module}
                </span>
              )}
            </div>

            {/* Title */}
            <div className="text-base font-semibold text-slate-800 leading-snug mb-4">
              {active.title}
            </div>

            {/* Status buttons */}
            <div className="flex gap-2 mb-4">
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => patchReport(active.id, { status: s })}
                  disabled={saving}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    active.status === s
                      ? STATUS_ACTIVE[s]
                      : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            {/* Assignee */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 block mb-1">
                Assigned to
              </label>
              <select
                value={active.assigneeId || ''}
                onChange={e => patchReport(active.id, { assigneeId: e.target.value || null })}
                disabled={saving}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
            </div>

            {/* Screenshot */}
            {active.screenshotUrl && (
              <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
                <img src={active.screenshotUrl} alt="Bug screenshot" className="w-full" />
              </div>
            )}

            {/* Description */}
            {active.description && (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  What happened
                </div>
                <p className="text-sm text-slate-700 mb-4 leading-relaxed">{active.description}</p>
              </>
            )}

            {/* Meta */}
            <div className="space-y-1.5 text-xs text-slate-600 mb-4 pt-1 border-t border-slate-100">
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Reporter</span>
                <span className="font-medium flex items-center gap-1.5">
                  {active.source === 'PUBLIC' && <BetaTag />}
                  {reporterLabel(active)}
                </span>
              </div>
              {/* A beta client who gave both a name and an email: the label shows
                  the name, so surface the email here for the follow-up. */}
              {active.source === 'PUBLIC' && active.reporterName && active.reporterEmail && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Email</span>
                  <a href={`mailto:${active.reporterEmail}`} className="text-blue-600 hover:underline truncate text-right">
                    {active.reporterEmail}
                  </a>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Reported</span>
                <span className="font-mono text-[11px]">{formatDate(active.createdAt)}</span>
              </div>
              {active.pageUrl && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Page</span>
                  {/* The page the report came from, one click away (Mike 10-17). */}
                  <a href={active.pageUrl} target="_blank" rel="noopener noreferrer"
                    title={active.pageUrl}
                    className="font-mono text-[11px] text-blue-600 hover:underline truncate text-right">
                    {String(active.pageUrl).replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
              {active.projectId && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Project</span>
                  <a href={`/project/${active.projectId}`} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate text-right">
                    {active.projectName || 'Open project'}
                  </a>
                </div>
              )}
              {active.pageState?.budgetLink && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Budget</span>
                  <a href={active.pageState.budgetLink} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate text-right">
                    {active.pageState.budgetName || 'Open the budget'}{active.pageState.step ? `, ${active.pageState.step}` : ''}
                  </a>
                </div>
              )}
              {!active.pageState?.budgetLink && active.pageState?.step && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Step</span>
                  <span className="truncate text-right">{active.pageState.step}</span>
                </div>
              )}
              {active.browserInfo && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Browser</span>
                  <span>{active.browserInfo}</span>
                </div>
              )}
              {active.viewport && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Viewport</span>
                  <span className="font-mono">{active.viewport}</span>
                </div>
              )}
            </div>

            {/* Console log */}
            {active.consoleLog?.length > 0 && (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Console ({active.consoleLog.length})
                </div>
                <div className="rounded-lg bg-slate-900 font-mono text-[11px] px-3 py-2.5 mb-3 max-h-36 overflow-y-auto leading-relaxed">
                  {active.consoleLog.map((e, i) => (
                    <div key={i} className={e.level === 'error' ? 'text-red-300' : 'text-amber-300'}>
                      {e.level === 'error' ? '✕' : '⚠'} {e.msg}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Network log */}
            {active.networkLog?.length > 0 && (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Failed requests ({active.networkLog.length})
                </div>
                <div className="rounded-lg bg-slate-900 text-amber-300 font-mono text-[11px] px-3 py-2.5 mb-3 max-h-36 overflow-y-auto leading-relaxed">
                  {active.networkLog.map((e, i) => (
                    <div key={i}>
                      {e.status} {e.method} {String(e.url).replace(/^https?:\/\/[^/]+/, '')}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Page state */}
            {active.pageState && (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Page state
                </div>
                <div className="rounded-lg bg-slate-900 text-green-300 font-mono text-[11px] px-3 py-2.5 max-h-40 overflow-y-auto whitespace-pre leading-relaxed">
                  {JSON.stringify(active.pageState, null, 2)}
                </div>
              </>
            )}

            {archiveError && (
              <div className="mt-4 text-xs text-red-600">{archiveError}</div>
            )}

            {/* Archive, never delete */}
            {!active.archivedAt && (
              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setConfirmArchive(true)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ArchiveBoxIcon className="w-3.5 h-3.5" />
                  Archive report
                </button>
              </div>
            )}

          </div>
        )}
      </div>

      <ConfirmArchiveModal
        open={confirmArchive && !!active}
        title="Archive this bug report?"
        what={active?.title}
        body="It leaves the board. The report, its screenshot and everything it captured are kept, and you can restore it any time from “Show archived”."
        busy={saving}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={async () => {
          const ok = await archiveReport(active.id, true);
          setConfirmArchive(false);
          if (ok) closeDrawer();
        }}
        confirmLabel="Archive"
      />

    </div>
  );
}
