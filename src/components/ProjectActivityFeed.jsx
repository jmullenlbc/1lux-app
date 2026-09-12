'use client';
import { useState, useEffect, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const now  = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff <  60)  return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fullDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour:  'numeric', minute: '2-digit', hour12: true,
  });
}

function initials(name, email) {
  const src = name || email || '?';
  return src.split(/[\s@]/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// Render **bold** markdown in descriptions
function RichText({ text }) {
  if (!text) return null;
  const parts = [];
  const re    = /\*\*(.+?)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={m.index} className="font-semibold text-slate-800">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ── Icon per activity type ────────────────────────────────────────────────────

const TYPE_CONFIG = {
  file_upload: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
    bg:    'bg-blue-100',
    color: 'text-blue-600',
    dot:   'bg-blue-400',
  },
  file_delete: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    ),
    bg:    'bg-red-100',
    color: 'text-red-500',
    dot:   'bg-red-400',
  },
  // Files are archived, never deleted, from migration 0076 on. file_delete
  // stays above for the history lines written before that.
  file_archive: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
    bg:    'bg-amber-100',
    color: 'text-amber-600',
    dot:   'bg-amber-400',
  },
  file_restore: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
      </svg>
    ),
    bg:    'bg-green-100',
    color: 'text-green-600',
    dot:   'bg-green-400',
  },
  questionnaire: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    bg:    'bg-amber-100',
    color: 'text-amber-600',
    dot:   'bg-amber-400',
  },
  project_data: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
    bg:    'bg-violet-100',
    color: 'text-violet-600',
    dot:   'bg-violet-400',
  },
  project_meta: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    bg:    'bg-slate-100',
    color: 'text-slate-500',
    dot:   'bg-slate-400',
  },
  phase_change: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    bg:    'bg-green-100',
    color: 'text-green-600',
    dot:   'bg-green-400',
  },
  note_added: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    bg:    'bg-teal-100',
    color: 'text-teal-600',
    dot:   'bg-teal-400',
  },
  // Mike, 2026-09-08: "All of this should write in the history of a project
  // right?" Won / lost / abandoned is the line people scan the history for, so
  // it gets its own colour instead of borrowing the grey settings look.
  deal_status: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-7.242c.982.143 1.954.317 2.916.52a6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
      </svg>
    ),
    bg:    'bg-emerald-100',
    color: 'text-emerald-600',
    dot:   'bg-emerald-400',
  },
  deal_stage: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
      </svg>
    ),
    bg:    'bg-indigo-100',
    color: 'text-indigo-600',
    dot:   'bg-indigo-400',
  },
};

const FALLBACK_CONFIG = TYPE_CONFIG.project_meta;

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectActivityFeed({ projectId }) {
  const [activities, setActivities] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [hasMore,    setHasMore]    = useState(false);
  const [cursor,     setCursor]     = useState(null);
  const [loadingMore,setLoadingMore]= useState(false);

  // Filter state
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedUser, setSelectedUser]     = useState(null);
  const [dateRange, setDateRange]           = useState({ from: null, to: null });

  const fetchActivities = useCallback(async (opts = {}) => {
    const { append = false, afterCursor = null } = opts;
    if (!append) setLoading(true);
    else setLoadingMore(true);

    try {
      const url = afterCursor
        ? `/api/projects/${projectId}/activity?limit=20&cursor=${afterCursor}`
        : `/api/projects/${projectId}/activity?limit=20`;
      const res  = await fetch(url);
      const data = await res.json();
      if (append) {
        setActivities(prev => [...prev, ...(data.activities || [])]);
      } else {
        setActivities(data.activities || []);
      }
      setHasMore(data.hasMore || false);
      setCursor(data.nextCursor || null);
    } catch {}

    if (!append) setLoading(false);
    else setLoadingMore(false);
  }, [projectId]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Project History</h3>
        </div>
        <div className="space-y-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-7 h-7 rounded-full bg-slate-100 shrink-0" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="h-3 bg-slate-100 rounded w-2/3" />
                <div className="h-2.5 bg-slate-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Extract unique users from activities
  const uniqueUsers = Array.from(
    new Map(activities.map(a => [a.userName || a.userEmail, { name: a.userName, email: a.userEmail }])).values()
  ).filter(u => u.name || u.email);

  // Module options: TAB_LABELS + questionnaire + project_data
  const MODULE_OPTIONS = {
    ...{ questionnaire: 'Budgets (Questionnaire)', project_data: 'Project Data' },
    drawings: 'Drawings',
    correspondence: 'Correspondence',
    submittals: 'Submittals',
    ca: 'CA',
    contracts: 'Contracts',
    meetings: 'Meetings',
    designInfo: 'Design Info',
    takeoffs: 'Takeoffs',
    budgets: 'Budgets',
    file_upload: 'File Upload',
    file_delete: 'File Delete',
    file_archive: 'File Archived',
    file_restore: 'File Restored',
    deal_status: 'Project Status (Won / Lost)',
    deal_stage: 'Project Stage',
  };

  if (activities.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Project History</h3>
          <button onClick={() => fetchActivities()} className="text-xs text-slate-400 hover:text-amber-600 transition-colors">Refresh</button>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-slate-400">No activity yet</p>
          <p className="text-xs text-slate-300 mt-1">Changes to budgets, files, and settings will appear here</p>
        </div>
      </div>
    );
  }

  // Apply filters to activities
  let filtered = activities;

  if (selectedModule) {
    filtered = filtered.filter(a => a.type === selectedModule);
  }

  if (selectedUser) {
    filtered = filtered.filter(a => (a.userName || a.userEmail) === selectedUser);
  }

  if (dateRange.from) {
    const fromDate = new Date(dateRange.from);
    filtered = filtered.filter(a => new Date(a.createdAt) >= fromDate);
  }

  if (dateRange.to) {
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999); // Include entire day
    filtered = filtered.filter(a => new Date(a.createdAt) <= toDate);
  }

  // Group by date
  const grouped = [];
  let lastDate  = null;
  for (const act of filtered) {
    const d = new Date(act.createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (d !== lastDate) {
      grouped.push({ type: 'date', label: d });
      lastDate = d;
    }
    grouped.push({ type: 'activity', data: act });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Project History</h3>
          <p className="text-xs text-slate-400 mt-0.5">Every change, upload, and update — tracked automatically</p>
        </div>
        <button
          onClick={() => fetchActivities()}
          className="text-xs text-slate-400 hover:text-amber-600 transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex flex-wrap items-end gap-4">
        {/* Module filter */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Module</label>
          <select
            value={selectedModule || ''}
            onChange={e => setSelectedModule(e.target.value || null)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white hover:border-slate-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-100"
          >
            <option value="">All modules</option>
            {Object.entries(MODULE_OPTIONS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* User filter */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">User</label>
          <select
            value={selectedUser || ''}
            onChange={e => setSelectedUser(e.target.value || null)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white hover:border-slate-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-100"
          >
            <option value="">All users</option>
            {uniqueUsers.map((user, idx) => (
              <option key={idx} value={user.name || user.email}>
                {user.name || user.email}
              </option>
            ))}
          </select>
        </div>

        {/* Date range filters */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">From</label>
          <input
            type="date"
            value={dateRange.from || ''}
            onChange={e => setDateRange({ ...dateRange, from: e.target.value || null })}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white hover:border-slate-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-100"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">To</label>
          <input
            type="date"
            value={dateRange.to || ''}
            onChange={e => setDateRange({ ...dateRange, to: e.target.value || null })}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white hover:border-slate-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-100"
          />
        </div>

        {/* Clear button */}
        {(selectedModule || selectedUser || dateRange.from || dateRange.to) && (
          <button
            onClick={() => {
              setSelectedModule(null);
              setSelectedUser(null);
              setDateRange({ from: null, to: null });
            }}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-50">
        {grouped.length === 0 && (selectedModule || selectedUser || dateRange.from || dateRange.to) ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-6">
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-slate-400">No activity matches your filters</p>
            <p className="text-xs text-slate-300 mt-1">Try adjusting your selections or clearing filters</p>
          </div>
        ) : (
          grouped.map((item, idx) => {
          if (item.type === 'date') {
            return (
              <div key={`date-${idx}`} className="px-6 py-2 bg-slate-50">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{item.label}</span>
              </div>
            );
          }

          const act    = item.data;
          const config = TYPE_CONFIG[act.type] || FALLBACK_CONFIG;
          const actor  = act.userName || act.userEmail || 'Unknown user';

          return (
            <div key={act.id} className="flex gap-3.5 px-6 py-3.5 hover:bg-slate-50/60 transition-colors group">
              {/* Actor avatar */}
              <div className="shrink-0 mt-0.5">
                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center">
                  {initials(act.userName, act.userEmail)}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  {/* Type icon badge */}
                  <div className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center mt-0.5 ${config.bg} ${config.color}`}>
                    {config.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-600 leading-snug">
                      <span className="font-medium text-slate-800">{actor}</span>
                      {' '}
                      <RichText text={act.description} />
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5" title={fullDate(act.createdAt)}>
                      {timeAgo(act.createdAt)} · {new Date(act.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
          })
        )}
      </div>

      {hasMore && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
          <button
            onClick={() => fetchActivities({ append: true, afterCursor: cursor })}
            disabled={loadingMore}
            className="text-xs text-amber-600 hover:text-amber-700 font-medium disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Load older activity →'}
          </button>
        </div>
      )}
    </div>
  );
}
