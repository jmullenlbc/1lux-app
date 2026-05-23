'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    PO_PLACED:          'bg-slate-100 text-slate-600',
    LEAD_TIME_CONFIRMED:'bg-blue-50 text-blue-700',
    ESD_CONFIRMED:      'bg-indigo-50 text-indigo-700',
    SHIPPED:            'bg-amber-50 text-amber-700',
    DELIVERED:          'bg-green-50 text-green-700',
  };
  const labels = {
    PO_PLACED: 'PO Placed', LEAD_TIME_CONFIRMED: 'Lead Time Set',
    ESD_CONFIRMED: 'ESD Confirmed', SHIPPED: 'Shipped', DELIVERED: 'Delivered',
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${styles[status] || styles.PO_PLACED}`}>
      {labels[status] || status}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Ship Schedule view ────────────────────────────────────────────────────────

function ShipScheduleView({ projectId }) {
  const [shipments, setShipments] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState({});

  useEffect(() => {
    fetch(`/api/portal/projects/${projectId}/shipments`)
      .then(r => r.json()).then(d => { setShipments(d.shipments || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="text-center py-10 text-sm text-slate-400">Loading…</div>;

  if (shipments.length === 0) {
    return <div className="text-center py-12 text-sm text-slate-400">No shipments yet.</div>;
  }

  return (
    <div className="space-y-3">
      {shipments.map(s => (
        <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setExpanded(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-800 text-sm">{s.manufacturer}</span>
              <StatusBadge status={s.status} />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              {s.esdDate && <span>ESD {fmtDate(s.esdDate)}</span>}
              {s.deliveredDate && <span className="text-green-600 font-medium">Delivered {fmtDate(s.deliveredDate)}</span>}
              <svg className={`w-4 h-4 transition-transform ${expanded[s.id] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {expanded[s.id] && s.lineItems.length > 0 && (
            <div className="border-t border-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-slate-500 font-medium">Fixture</th>
                    <th className="px-4 py-2 text-left text-slate-500 font-medium">Description</th>
                    <th className="px-4 py-2 text-right text-slate-500 font-medium">Qty</th>
                    <th className="px-4 py-2 text-left text-slate-500 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lineItems.map(li => (
                    <tr key={li.id} className="border-t border-slate-50">
                      <td className="px-4 py-2 text-slate-700 font-mono">{li.fixtureType}</td>
                      <td className="px-4 py-2 text-slate-600">{li.description}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{li.qty}</td>
                      <td className="px-4 py-2 text-slate-500">{li.fixtureStatus || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Meeting Notes view ────────────────────────────────────────────────────────

function MeetingNotesView({ projectId }) {
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [active,  setActive]  = useState(null);

  useEffect(() => {
    fetch(`/api/portal/projects/${projectId}/meeting-notes`)
      .then(r => r.json()).then(d => { setNotes(d.notes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="text-center py-10 text-sm text-slate-400">Loading…</div>;

  if (active) {
    return (
      <div>
        <button onClick={() => setActive(null)} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          All Notes
        </button>
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">{active.title || 'Untitled'}</h2>
          {active.meetingDate && (
            <p className="text-sm text-slate-400 mb-4">{fmtDate(active.meetingDate)}</p>
          )}
          <div
            className="prose prose-sm max-w-none text-slate-700"
            dangerouslySetInnerHTML={{ __html: active.content || '<p class="text-slate-400">No content.</p>' }}
          />
        </div>
      </div>
    );
  }

  if (notes.length === 0) {
    return <div className="text-center py-12 text-sm text-slate-400">No meeting notes have been shared yet.</div>;
  }

  return (
    <div className="space-y-2">
      {notes.map(n => (
        <button
          key={n.id}
          onClick={() => setActive(n)}
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-left hover:border-amber-200 hover:bg-amber-50/30 transition-all group flex items-center justify-between"
        >
          <div>
            <p className="font-medium text-slate-700 group-hover:text-slate-900 text-sm">{n.title || 'Untitled'}</p>
            {n.meetingDate && <p className="text-xs text-slate-400 mt-0.5">{fmtDate(n.meetingDate)}</p>}
          </div>
          <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// ── Files view (submittals / contracts / change orders) ───────────────────────

function FilesView({ projectId, tab, label }) {
  const [files,   setFiles]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/projects/${projectId}/files?tab=${tab}`)
      .then(r => r.json()).then(d => { setFiles(d.files || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId, tab]);

  if (loading) return <div className="text-center py-10 text-sm text-slate-400">Loading…</div>;

  if (files.length === 0) {
    return <div className="text-center py-12 text-sm text-slate-400">No {label.toLowerCase()} on file yet.</div>;
  }

  function fmtSize(b) {
    if (!b) return '';
    if (b > 1048576) return `${(b / 1048576).toFixed(1)} MB`;
    return `${Math.round(b / 1024)} KB`;
  }

  return (
    <div className="space-y-2">
      {files.map(f => (
        <div key={f.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-700 font-medium truncate">{f.originalName}</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtDate(f.createdAt)}{f.size ? ` · ${fmtSize(f.size)}` : ''}</p>
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-400 text-center pt-2">Contact your ILC project manager to download files.</p>
    </div>
  );
}

// ── Section cards ─────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'canViewShipSchedule',      id: 'ship',     label: 'Ship Schedule',    icon: '📦' },
  { key: 'canViewSubmittals',        id: 'subs',     label: 'Submittals',       icon: '📋' },
  { key: 'canViewMeetings',          id: 'meetings', label: 'Meeting Notes',    icon: '📝' },
  { key: 'canViewContracts',         id: 'contracts',label: 'Contracts',        icon: '📄' },
  { key: 'canViewChangeOrders',      id: 'ca',       label: 'Change Orders',    icon: '🔄' },
];

// ── Main portal project page ──────────────────────────────────────────────────

export default function PortalProjectPage({ params }) {
  const router  = useRouter();
  const [data,  setData]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(null);

  useEffect(() => {
    fetch(`/api/portal/projects/${params.id}`)
      .then(r => {
        if (r.status === 401) { router.replace('/portal/login'); return null; }
        if (r.status === 403 || r.status === 404) { router.replace('/portal/projects'); return null; }
        return r.json();
      })
      .then(d => { if (d) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [params.id, router]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading…</div>;
  if (!data)   return null;

  const { project, permissions } = data;
  const available = SECTIONS.filter(s => permissions[s.key]);

  async function logout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' });
    router.replace('/portal/login');
  }

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push('/portal/projects')}
            className="text-xs text-slate-400 hover:text-slate-600 mb-1 flex items-center gap-1"
          >
            ← All Projects
          </button>
          <h1 className="text-2xl font-bold text-slate-800">{project.name}</h1>
          {(project.city || project.state) && (
            <p className="text-sm text-slate-400 mt-0.5">{[project.city, project.state].filter(Boolean).join(', ')}</p>
          )}
        </div>
        <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">Sign out</button>
      </div>

      {/* Section navigation */}
      {!activeSection && (
        <>
          {available.length === 0 ? (
            <div className="text-center py-16 text-sm text-slate-400">
              No sections have been shared with you yet. Contact your ILC project manager.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {available.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s)}
                  className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-amber-300 hover:shadow-sm transition-all group"
                >
                  <div className="text-2xl mb-3">{s.icon}</div>
                  <h3 className="font-semibold text-slate-800 group-hover:text-amber-700 transition-colors">{s.label}</h3>
                  <p className="text-xs text-slate-400 mt-1">View →</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Section content */}
      {activeSection && (
        <div>
          <button
            onClick={() => setActiveSection(null)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {project.name}
          </button>
          <h2 className="text-lg font-bold text-slate-800 mb-4">{activeSection.label}</h2>

          {activeSection.id === 'ship'     && <ShipScheduleView projectId={params.id} />}
          {activeSection.id === 'meetings' && <MeetingNotesView projectId={params.id} />}
          {activeSection.id === 'subs'     && <FilesView projectId={params.id} tab="submittals" label="Submittals" />}
          {activeSection.id === 'contracts'&& <FilesView projectId={params.id} tab="contracts"  label="Contracts" />}
          {activeSection.id === 'ca'       && <FilesView projectId={params.id} tab="ca"          label="Change Orders" />}
        </div>
      )}
    </div>
  );
}
