'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

// ── Activity meta ─────────────────────────────────────────────────────────────

const ACTIVITY_META = {
  COFFEE:     { emoji: '☕', label: 'Coffee',      color: 'bg-amber-50 text-amber-700 border-amber-200',    inPerson: true },
  MEAL:       { emoji: '🍽', label: 'Meal',        color: 'bg-orange-50 text-orange-700 border-orange-200',  inPerson: true },
  LUNCH:      { emoji: '🍽', label: 'Meal',        color: 'bg-orange-50 text-orange-700 border-orange-200',  inPerson: true, legacy: true },  // notes written before the rename
  TRAVEL:     { emoji: '✈️', label: 'Travel',      color: 'bg-sky-50 text-sky-700 border-sky-200',           inPerson: false },
  HAPPY_HOUR: { emoji: '🍺', label: 'Happy Hour',  color: 'bg-yellow-50 text-yellow-700 border-yellow-200',  inPerson: true },
  GOLF:       { emoji: '⛳', label: 'Golf',         color: 'bg-green-50 text-green-700 border-green-200',     inPerson: true },
  SITE_VISIT: { emoji: '🏗', label: 'Site Visit',  color: 'bg-blue-50 text-blue-700 border-blue-200',        inPerson: true },
  CALL:       { emoji: '📞', label: 'Call',         color: 'bg-slate-100 text-slate-600 border-slate-200',    inPerson: false },
  EMAIL:      { emoji: '📧', label: 'Email',        color: 'bg-slate-100 text-slate-600 border-slate-200',    inPerson: false },
  EVENT:      { emoji: '🎉', label: 'Event',        color: 'bg-purple-50 text-purple-700 border-purple-200',  inPerson: false },
  OTHER:      { emoji: '📋', label: 'Other',        color: 'bg-slate-100 text-slate-500 border-slate-200',    inPerson: false },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function avatarColor(name) {
  if (!name) return 'bg-slate-400';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const colors = [
    'bg-orange-500', 'bg-amber-500', 'bg-blue-500', 'bg-indigo-500',
    'bg-emerald-500', 'bg-teal-500', 'bg-violet-500', 'bg-rose-500',
  ];
  return colors[Math.abs(h) % colors.length];
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function rangeStart(dateRange) {
  const d = new Date();
  if (dateRange === 'week') {
    d.setDate(d.getDate() - 7);
  } else if (dateRange === 'month') {
    d.setMonth(d.getMonth() - 1);
  } else if (dateRange === 'quarter') {
    d.setMonth(d.getMonth() - 3);
  } else if (dateRange === 'ytd') {
    // Jan 1 of current year
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
  } else if (dateRange === 'lastyear') {
    // Jan 1 of previous year — end filter handled separately
    d.setFullYear(d.getFullYear() - 1, 0, 1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

function rangeEnd(dateRange) {
  if (dateRange === 'lastyear') {
    // Dec 31 of previous year
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1, 11, 31);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  return null; // no upper bound for other ranges
}

// ── Stats computation ─────────────────────────────────────────────────────────

function computeStats(notes, dateRange, selectedUserId = 'all') {
  const cutoff  = rangeStart(dateRange);
  const ceiling = rangeEnd(dateRange);  // null for most ranges, Dec 31 last year for 'lastyear'

  const filtered = notes.filter(n => {
    // Only finished notes count — a draft (incl. every calendar draft) is not activity yet.
    if (!n.isPublished) return false;
    const d = new Date(n.meetingDate || n.createdAt);
    const inRange = d >= cutoff && (!ceiling || d <= ceiling);
    if (!inRange) return false;
    if (selectedUserId !== 'all') {
      const userId = n.createdBy?.id || 'unknown';
      return userId === selectedUserId;
    }
    return true;
  });

  // Per-user map
  const userMap = {};

  for (const note of filtered) {
    const userId   = note.createdBy?.id   || 'unknown';
    const userName = note.createdBy?.name || 'Unknown';
    if (!userMap[userId]) {
      userMap[userId] = {
        userId,
        userName,
        inPersonCount: 0,
        callCount: 0,
        otherCount: 0,
        totalCount: 0,
        uniqueContacts: new Set(),
        byActivityType: {},
      };
    }
    const u = userMap[userId];
    u.totalCount += 1;

    const type = note.activityType || 'OTHER';
    u.byActivityType[type] = (u.byActivityType[type] || 0) + 1;

    const meta = ACTIVITY_META[type] || ACTIVITY_META.OTHER;
    if (meta.inPerson) u.inPersonCount += 1;
    else if (type === 'CALL') u.callCount += 1;
    else u.otherCount += 1;

    // Collect unique contacts from noteContacts / clients
    const contacts = note.contacts || note.noteContacts || [];
    for (const nc of contacts) {
      u.uniqueContacts.add(nc.contactId || nc.id);
    }
    // Also check clients array
    const clients = note.clients || [];
    for (const nc of clients) {
      u.uniqueContacts.add(nc.clientId || nc.id);
    }
  }

  // Totals
  const totalInPerson = filtered.filter(n => {
    const meta = ACTIVITY_META[n.activityType] || ACTIVITY_META.OTHER;
    return meta.inPerson;
  }).length;

  const allContactIds = new Set();
  for (const u of Object.values(userMap)) {
    u.uniqueContacts.forEach(id => allContactIds.add(id));
  }

  // Activity type totals
  const byType = {};
  for (const note of filtered) {
    const t = note.activityType || 'OTHER';
    byType[t] = (byType[t] || 0) + 1;
  }

  return {
    filtered,
    totalInPerson,
    uniqueContactsTotal: allContactIds.size,
    byType,
    perUser: Object.values(userMap).sort((a, b) => b.totalCount - a.totalCount),
  };
}

// ── ActivityTypeBadge ─────────────────────────────────────────────────────────

function ActivityTypeBadge({ type }) {
  const meta = ACTIVITY_META[type] || ACTIVITY_META.OTHER;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium border ${meta.color}`}>
      {meta.emoji} {meta.label}
    </span>
  );
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

function SummaryCard({ value, label, sub, href }) {
  const inner = (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-sm font-medium text-slate-700 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

// ── CSS bar chart ─────────────────────────────────────────────────────────────

function ActivityBarChart({ byType }) {
  const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(e => e[1]), 1);

  return (
    <div className="space-y-2">
      {entries.map(([type, count]) => {
        const meta = ACTIVITY_META[type] || ACTIVITY_META.OTHER;
        const pct  = Math.round((count / max) * 100);
        return (
          <div key={type} className="flex items-center gap-3">
            <span className="w-24 text-xs text-slate-500 shrink-0 text-right">{meta.emoji} {meta.label}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full bg-orange-400 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 text-xs font-semibold text-slate-600 shrink-0">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SalesActivityPage() {
  const [notes,          setNotes]          = useState([]);
  const [upcoming,       setUpcoming]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [dateRange,      setDateRange]      = useState('month');
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [err,            setErr]            = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [histRes, upcomingRes] = await Promise.all([
        fetch('/api/crm/notes?includeStats=true'),
        fetch('/api/crm/notes/upcoming'),
      ]);
      if (!histRes.ok) throw new Error(`Error ${histRes.status}`);
      const data = await histRes.json();
      setNotes(data.notes || data || []);
      if (upcomingRes.ok) {
        const upData = await upcomingRes.json();
        setUpcoming(upData.notes || []);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derive unique user list from notes
  const userList = useMemo(() => {
    const seen = new Map();
    for (const n of notes) {
      const id   = n.createdBy?.id;
      const name = n.createdBy?.name;
      if (id && !seen.has(id)) seen.set(id, { id, name: name || id });
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [notes]);

  const stats = useMemo(() => computeStats(notes, dateRange, selectedUserId), [notes, dateRange, selectedUserId]);

  const RANGES = [
    { id: 'week',     label: 'This Week' },
    { id: 'month',    label: 'This Month' },
    { id: 'quarter',  label: 'This Quarter' },
    { id: 'ytd',      label: 'YTD' },
    { id: 'lastyear', label: 'Last Year' },
  ];

  // Deduplicate: same title on same calendar day → keep first occurrence only
  const _seenRecent = new Set();
  const recent10 = stats.filtered
    .slice()
    .sort((a, b) => new Date(b.meetingDate || b.createdAt) - new Date(a.meetingDate || a.createdAt))
    .filter(n => {
      const dateKey = (n.meetingDate || n.createdAt || '').toString().slice(0, 10);
      const key     = n.title?.trim().toLowerCase() + '|' + dateKey;
      if (_seenRecent.has(key)) return false;
      _seenRecent.add(key);
      return true;
    })
    .slice(0, 10);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Sales Activity</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manually logged activities — relationship touchpoints across your team</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* User selector */}
          {userList.length > 1 && (
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="all">All Reps</option>
              {userList.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {/* Date range filter */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {RANGES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setDateRange(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  dateRange === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {err && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</p>
      )}

      {/* M365 notice */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5 text-xs text-blue-700">
        <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <span>Email and calendar activity coming when M365 is connected. Showing manually logged activities.</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              value={stats.totalInPerson}
              label="In-Person Meetings"
              sub="Coffee, lunch, golf, site visits…"
            />
            <SummaryCard
              value={stats.uniqueContactsTotal}
              label="Client Companies Met"
              sub="Unique CRM clients linked to meetings"
            />
            <SummaryCard
              value="→"
              label="Overdue Check-ins"
              sub="View contacts due now"
              href="/sales/check-ins"
            />
          </div>

          {/* ── Per-rep + Activity Breakdown side by side ─────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Per-rep breakdown */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-3">Per-Rep Breakdown</h2>
              {stats.perUser.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No activity logged in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Name</th>
                        <th className="text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">In-Person</th>
                        <th className="text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Calls</th>
                        <th className="text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Other</th>
                        <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2">Types</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {stats.perUser.map(u => (
                        <tr key={u.userId} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold ${avatarColor(u.userName)}`}>
                                {initials(u.userName)}
                              </div>
                              <span className="font-medium text-slate-800 truncate max-w-[100px]">{u.userName}</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-semibold text-slate-700">{u.inPersonCount}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-500">{u.callCount}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-500">{u.otherCount}</td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(u.byActivityType)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 5)
                                .map(([type, count]) => {
                                  const meta = ACTIVITY_META[type] || ACTIVITY_META.OTHER;
                                  return (
                                    <span key={type} className="text-[11px] text-slate-500">
                                      {meta.emoji}×{count}
                                    </span>
                                  );
                                })}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Activity Breakdown */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-4">Activity Breakdown</h2>
              {Object.keys(stats.byType).length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No activity in this period.</p>
              ) : (
                <ActivityBarChart byType={stats.byType} />
              )}
            </div>

          </div>

          {/* ── Two-column row: recent feed + upcoming ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Recent activity feed */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-3">Recent Activity</h2>
              {recent10.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No activity in this period.</p>
              ) : (
                <div className="space-y-2.5">
                  {recent10.map(note => {
                    const meta = ACTIVITY_META[note.activityType] || ACTIVITY_META.OTHER;
                    const contactName = note.contacts?.[0]?.contact?.name || note.clients?.[0]?.client?.name || null;
                    const dealTitle = note.projects?.[0]?.project?.name || null;
                    return (
                      <div key={note.id} className="flex items-start gap-2.5">
                        <span className="text-base shrink-0 mt-0.5">{meta.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-800 line-clamp-1">
                              {note.title || `${meta.label}${contactName ? ' with ' + contactName : ''}`}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {fmtDate(note.meetingDate || note.createdAt)}
                            </span>
                          </div>
                          {(note.createdBy?.name || dealTitle) && (
                            <div className="flex items-center gap-2 mt-0.5">
                              {note.createdBy?.name && <span className="text-[10px] text-slate-400">{note.createdBy.name}</span>}
                              {dealTitle && <span className="text-[10px] text-slate-400">· {dealTitle}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Upcoming next 2 weeks */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900">Upcoming — Next 2 Weeks</h2>
                <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                  From calendar
                </span>
              </div>
              {upcoming.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-xs text-slate-400">No upcoming events in the next 2 weeks</p>
                  <p className="text-[10px] text-slate-300 mt-1">Meetings with a date in the next two weeks show here</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {upcoming.map(note => {
                    const meta = ACTIVITY_META[note.activityType] || ACTIVITY_META.OTHER;
                    const contactName = note.contacts?.[0]?.contact?.name || note.clients?.[0]?.client?.name || null;
                    const daysUntil = Math.ceil((new Date(note.meetingDate) - new Date()) / 86400000);
                    return (
                      <div key={note.id} className="flex items-start gap-2.5">
                        <span className="text-base shrink-0 mt-0.5">{meta.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-800 line-clamp-1">
                              {note.title || `${meta.label}${contactName ? ' with ' + contactName : ''}`}
                            </span>
                            <span className={`text-[10px] font-semibold shrink-0 ${daysUntil <= 2 ? 'text-orange-600' : 'text-slate-400'}`}>
                              {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil}d`}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(note.meetingDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {contactName && ` · ${contactName}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
