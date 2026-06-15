'use client';
import { useState } from 'react';

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
  NEW:         'bg-slate-200 text-slate-700',
  IN_PROGRESS: 'bg-amber-500 text-white',
  FIXED:       'bg-green-600 text-white',
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

function BugCard({ bug, active, onClick }) {
  return (
    <div
      onClick={() => onClick(bug.id)}
      className={`bg-white border rounded-xl shadow-sm p-3.5 cursor-pointer transition-all hover:shadow-md ${
        active ? 'border-amber-400 ring-1 ring-amber-200' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${SEV_STYLE[bug.severity]}`}>
          {sevLabel(bug.severity)}
        </span>
        <span className="text-[10px] font-mono text-slate-400">{shortId(bug.id)}</span>
      </div>
      <div className="text-sm font-medium text-slate-800 leading-snug">{bug.title}</div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {bug.module && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-500">
            {bug.module}
          </span>
        )}
        {bug.assignee && (
          <span className="text-[10px] text-amber-600">
            → {bug.assignee.name || bug.assignee.email.split('@')[0]}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span>{bug.reporter?.name || bug.reporter?.email?.split('@')[0]}</span>
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

  async function deleteReport(id, title) {
    if (!window.confirm(`Delete "${title}"?\n\nThis removes the report and its screenshot permanently.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/qc/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body?.error || 'Delete failed');
        return;
      }
      setReports(prev => prev.filter(r => r.id !== id));
      closeDrawer();
    } finally {
      setSaving(false);
    }
  }

  const byStatus = s => reports.filter(r => r.status === s);
  const counts   = Object.fromEntries(STATUSES.map(s => [s, byStatus(s).length]));

  return (
    <div className="p-6 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-800">QC Bug Tracker</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Every report auto-captures screenshot, console errors, and failed network requests.
            </div>
          </div>
          <div className="flex items-center gap-5 text-center">
            <div>
              <div className="text-xl font-bold text-slate-600 font-mono">{counts.NEW}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">New</div>
            </div>
            <div>
              <div className="text-xl font-bold text-amber-600 font-mono">{counts.IN_PROGRESS}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">In Progress</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600 font-mono">{counts.FIXED}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Fixed</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Severity</span>
          {Object.entries(SEV_STYLE).map(([k, cls]) => (
            <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${cls}`}>
              {sevLabel(k)}
            </span>
          ))}
        </div>
      </div>

      {/* Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUSES.map(status => (
          <div key={status}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                {STATUS_LABEL[status]}
              </span>
              <span className="ml-auto text-[10px] text-slate-400">{counts[status]}</span>
            </div>
            <div className="space-y-3 min-h-[80px]">
              {byStatus(status).length === 0
                ? <div className="text-[11px] text-slate-300 italic px-1 py-4">No reports</div>
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
              <span className="text-[11px] font-mono text-slate-400">{shortId(active.id)}</span>
              <button onClick={closeDrawer} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
                &times;
              </button>
            </div>

            {/* Severity + module badges */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${SEV_STYLE[active.severity]}`}>
                {sevLabel(active.severity)}
              </span>
              {active.module && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-500">
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
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Assigned to
              </label>
              <select
                value={active.assigneeId || ''}
                onChange={e => patchReport(active.id, { assigneeId: e.target.value || null })}
                disabled={saving}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">— Unassigned —</option>
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
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  What happened
                </div>
                <p className="text-sm text-slate-700 mb-4 leading-relaxed">{active.description}</p>
              </>
            )}

            {/* Meta */}
            <div className="space-y-1.5 text-xs text-slate-600 mb-4 pt-1 border-t border-slate-100">
              <div className="flex justify-between pt-2">
                <span className="text-slate-400">Reporter</span>
                <span className="font-medium">{active.reporter?.name || active.reporter?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Reported</span>
                <span className="font-mono text-[11px]">{formatDate(active.createdAt)}</span>
              </div>
              {active.pageUrl && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400 shrink-0">Page</span>
                  <span className="font-mono text-[10px] text-blue-600 truncate text-right">
                    {String(active.pageUrl).replace(/^https?:\/\//, '')}
                  </span>
                </div>
              )}
              {active.browserInfo && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Browser</span>
                  <span>{active.browserInfo}</span>
                </div>
              )}
              {active.viewport && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Viewport</span>
                  <span className="font-mono">{active.viewport}</span>
                </div>
              )}
            </div>

            {/* Console log */}
            {active.consoleLog?.length > 0 && (
              <>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Console ({active.consoleLog.length})
                </div>
                <div className="rounded-lg bg-slate-900 font-mono text-[10px] px-3 py-2.5 mb-3 max-h-36 overflow-y-auto leading-relaxed">
                  {active.consoleLog.map((e, i) => (
                    <div key={i} className={e.level === 'error' ? 'text-red-300' : 'text-yellow-300'}>
                      {e.level === 'error' ? '✕' : '⚠'} {e.msg}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Network log */}
            {active.networkLog?.length > 0 && (
              <>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Failed requests ({active.networkLog.length})
                </div>
                <div className="rounded-lg bg-slate-900 text-amber-300 font-mono text-[10px] px-3 py-2.5 mb-3 max-h-36 overflow-y-auto leading-relaxed">
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
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Page state
                </div>
                <div className="rounded-lg bg-slate-900 text-green-300 font-mono text-[10px] px-3 py-2.5 max-h-40 overflow-y-auto whitespace-pre leading-relaxed">
                  {JSON.stringify(active.pageState, null, 2)}
                </div>
              </>
            )}

            {/* Delete */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => deleteReport(active.id, active.title)}
                disabled={saving}
                className="text-xs text-slate-400 hover:text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete report
              </button>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
