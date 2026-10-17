'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { bucketByPeriod, bucketCountsByPeriod } from '@/lib/activity/byPeriod';
import SectionTabs, { ACTIVITY_TABS } from '@/components/ui/SectionTabs';
import { formatMoney } from '@/lib/sales/expenses';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { Th, sortRows } from '@/components/ui/SortHeader';
import StatTile from '@/components/ui/StatTile';
import WidgetFrame, { WidgetEmpty, WidgetLoading } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { CARD_PADDED, CARD_TITLE, INPUT, H1, TD, TONE } from '@/components/ui/tokens';

// A table that is not the page's main list keeps its own sort (one address
// sort per page); the header chevrons draw the same either way.
function useLocalSort(initial) {
  const [sort, setSort] = useState(initial);
  const toggleSort = useCallback((key) => setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }), []);
  return { sort, toggleSort };
}

// ── Activity meta ─────────────────────────────────────────────────────────────

const ACTIVITY_META = {
  COFFEE:     { emoji: '☕', label: 'Coffee',      color: 'bg-amber-50 text-amber-700 border-amber-200',    inPerson: true },
  MEAL:       { emoji: '🍽', label: 'Meal',        color: 'bg-orange-50 text-orange-700 border-orange-200',  inPerson: true },
  LUNCH:      { emoji: '🍽', label: 'Meal',        color: 'bg-orange-50 text-orange-700 border-orange-200',  inPerson: true, legacy: true },  // notes written before the rename
  TRAVEL:     { emoji: '✈️', label: 'Travel',      color: 'bg-sky-50 text-sky-700 border-sky-200',           inPerson: false },
  HAPPY_HOUR: { emoji: '🍺', label: 'Happy Hour',  color: 'bg-amber-50 text-amber-700 border-amber-200',  inPerson: true },
  GOLF:       { emoji: '⛳', label: 'Golf',         color: 'bg-green-50 text-green-700 border-green-200',     inPerson: true },
  SITE_VISIT: { emoji: '🏗', label: 'Site Visit',  color: 'bg-blue-50 text-blue-700 border-blue-200',        inPerson: true },
  CALL:       { emoji: '📞', label: 'Call',         color: 'bg-slate-100 text-slate-600 border-slate-200',    inPerson: false },
  EMAIL:      { emoji: '📧', label: 'Email',        color: 'bg-slate-100 text-slate-600 border-slate-200',    inPerson: false },
  TEXT:       { emoji: '💬', label: 'Text',         color: 'bg-slate-100 text-slate-600 border-slate-200',    inPerson: false },
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
    'bg-green-500', 'bg-teal-500', 'bg-violet-500', 'bg-red-500',
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
    // Jan 1 of previous year, end filter handled separately
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

function computeStats(notes, dateRange, selectedUserId = 'all', expenses = []) {
  const cutoff  = rangeStart(dateRange);
  const ceiling = rangeEnd(dateRange);  // null for most ranges, Dec 31 last year for 'lastyear'

  // Money spent (0129): every expense row in the window, by the salesperson it belongs to.
  const spentByUser = {};
  let totalSpentCents = 0;
  for (const e of expenses) {
    const d = new Date(e.spentOn);
    if (!(d >= cutoff && (!ceiling || d <= ceiling))) continue;
    if (selectedUserId !== 'all' && e.userId !== selectedUserId) continue;
    spentByUser[e.userId] = (spentByUser[e.userId] || 0) + (Number(e.amountCents) || 0);
    totalSpentCents += Number(e.amountCents) || 0;
  }

  const filtered = notes.filter(n => {
    // Only finished notes count, a draft (incl. every calendar draft) is not activity yet.
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

  // A rep with spend but no notes in the window still gets a row.
  for (const [userId, cents] of Object.entries(spentByUser)) {
    if (!userMap[userId]) {
      const name = expenses.find(e => e.userId === userId)?.user?.name || 'Unknown';
      userMap[userId] = { userId, userName: name, inPersonCount: 0, callCount: 0, otherCount: 0, totalCount: 0, uniqueContacts: new Set(), byActivityType: {} };
    }
    userMap[userId].spentCents = cents;
  }

  return {
    filtered,
    totalInPerson,
    totalSpentCents,
    uniqueContactsTotal: allContactIds.size,
    byType,
    perUser: Object.values(userMap).sort((a, b) => b.totalCount - a.totalCount),
  };
}

// ── ActivityTypeBadge ─────────────────────────────────────────────────────────

function ActivityTypeBadge({ type }) {
  const meta = ACTIVITY_META[type] || ACTIVITY_META.OTHER;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-xs font-semibold border ${meta.color}`}>
      {meta.emoji} {meta.label}
    </span>
  );
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

function SummaryCard({ value, label, sub, href }) {
  const inner = <StatTile label={label} value={value} sub={sub} className={href ? 'hover:border-orange-300 transition-colors h-full' : 'h-full'} />;
  if (href) return <Link href={href} className="block">{inner}</Link>;
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
            <span className="w-6 text-xs font-semibold text-slate-600 shrink-0 tabular-nums">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── By month / by quarter table ───────────────────────────────────────────────
// Rows are periods, columns are each salesperson plus Team. Which notes count
// depends on the selector; "New people" is contacts added, split by who added
// them (Contact.createdById, 0119). People added before that count in Team only.

const PERIOD_METRICS = [
  { id: 'inPerson',  label: 'In person',    pick: (n) => !!(ACTIVITY_META[n.activityType] || ACTIVITY_META.OTHER).inPerson },
  { id: 'calls',     label: 'Calls',        pick: (n) => n.activityType === 'CALL' },
  { id: 'all',       label: 'All meetings', pick: () => true },
  { id: 'newPeople', label: 'New people',   pick: null },
  { id: 'spent',     label: 'Spent',        pick: null, money: true },  // 0129: expense rows, dollars
];

function ByPeriodTable({ notes, userList, newPeople, expenses }) {
  const [period, setPeriod] = useState('month');
  const [metric, setMetric] = useState('inPerson');
  const def = PERIOD_METRICS.find(m => m.id === metric) || PERIOD_METRICS[0];
  const isMoney  = !!def.money;
  const isPeople = !def.pick && !isMoney;

  const rows = useMemo(() => {
    if (isMoney) {
      return bucketByPeriod(expenses || [], { period, months: 12, weight: e => e.amountCents });
    }
    if (!isPeople) {
      return bucketByPeriod(notes.filter(n => n.isPublished && def.pick(n)), { period, months: 12 });
    }
    // Contacts added, by who added them. Rows with no adder land in Team only.
    return bucketCountsByPeriod(newPeople || [], { period, months: 12 });
  }, [notes, newPeople, expenses, period, def, isPeople, isMoney]);
  const cell = (v) => isMoney ? (v ? formatMoney(v) : '$0') : (v || 0);

  const unassigned = useMemo(
    () => isPeople ? (newPeople || []).filter(r => !r.userId).reduce((s, r) => s + (Number(r.count) || 0), 0) : 0,
    [newPeople, isPeople]
  );

  const cols = userList;
  const { sort, toggleSort } = useLocalSort({ key: '', dir: 'asc' });
  const sortedRows = useMemo(() => sortRows(rows, sort, {
    period: r => r.key,
    team:   r => Number(r.team) || 0,
    ...Object.fromEntries(cols.map(u => [`u:${u.id}`, r => Number(r.perUser[u.id]) || 0])),
  }), [rows, sort, cols]);

  return (
    <WidgetFrame
      title={`By ${period === 'month' ? 'Month' : 'Quarter'}`}
      actions={(
        <div className="flex items-center gap-2 flex-wrap">
          <select value={metric} onChange={e => setMetric(e.target.value)} className={`${INPUT} w-auto text-xs px-2 py-1`}>
            {PERIOD_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {[['month', 'By month'], ['quarter', 'By quarter']].map(([id, label]) => (
              <button key={id} onClick={() => setPeriod(id)} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${period === id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
            ))}
          </div>
        </div>
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <SortHeader field="period" label={period === 'month' ? 'Month' : 'Quarter'} sort={sort} onSort={toggleSort} />
              {cols.map(u => <SortHeader key={u.id} field={`u:${u.id}`} label={u.name} sort={sort} onSort={toggleSort} align="right" />)}
              <SortHeader field="team" label="Team" sort={sort} onSort={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map(r => (
              <tr key={r.key} className="hover:bg-slate-50">
                <td className={`${TD} tabular-nums`}>{r.label}</td>
                {cols.map(u => <td key={u.id} className={`${TD} text-right text-slate-500 tabular-nums`}>{cell(r.perUser[u.id])}</td>)}
                <td className={`${TD} text-right font-semibold tabular-nums`}>{cell(r.team)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isPeople && unassigned > 0 && (
        <p className="text-xs text-slate-500 mt-2">{unassigned} of these people were added before the app recorded who added them, or came in from the website. They count in Team only.</p>
      )}
    </WidgetFrame>
  );
}

// ── Cost to first project (0129) ──────────────────────────────────────────────
// "How many meetings or how much money does it take to get the first project
// with a client." Team averages over clients already won, one line per
// salesperson, and what has gone into clients still open.

function num(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: digits });
}

function FirstProjectCost({ report, selectedUserId }) {
  const [showOpen, setShowOpen] = useState(false);
  if (!report) return null;
  const { summary, perUser = [], rows = [] } = report;
  const s = selectedUserId === 'all' ? summary : (perUser.find(u => u.userId === selectedUserId) || null);
  const openRows = rows
    .filter(r => !r.won && (selectedUserId === 'all' || r.salesUserId === selectedUserId) && (r.meetings > 0 || r.spentCents > 0))
    .sort((a, b) => b.spentCents - a.spentCents || b.meetings - a.meetings);
  const reps = useLocalSort({ key: '', dir: 'asc' });
  const opens = useLocalSort({ key: '', dir: 'asc' });
  const perUserSorted = sortRows(perUser, reps.sort, {
    name:      u => u.userName || '',
    won:       u => Number(u.wonClients) || 0,
    meetings:  u => u.wonClients ? Number(u.avgMeetings) : null,
    spent:     u => u.wonClients ? Number(u.avgSpentCents) || 0 : null,
    days:      u => u.wonClients ? Number(u.avgDaysToWin) : null,
    open:      u => Number(u.openClients) || 0,
    openSpend: u => Number(u.openSpentCents) || 0,
  });
  const openSorted = sortRows(openRows, opens.sort, {
    company:  r => r.clientName || '',
    rep:      r => r.salesUserName || '',
    meetings: r => Number(r.meetings) || 0,
    inPerson: r => Number(r.inPerson) || 0,
    spent:    r => Number(r.spentCents) || 0,
    first:    r => r.firstTouchAt ? new Date(r.firstTouchAt).getTime() : null,
  });

  return (
    <WidgetFrame title="Cost to First Project" sub="Meetings and money before a company's first won project">
      {!s || s.wonClients === 0 ? (
        <WidgetEmpty>No company has a dated first win yet, so there is nothing to average. The open companies below show what has gone in so far.</WidgetEmpty>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile inset label="Meetings to first project" value={num(s.avgMeetings)} sub={`median ${num(s.medianMeetings)}`} />
          <StatTile inset label="Of them in person" value={num(s.avgInPerson)} />
          <StatTile inset label="Spent to first project" value={formatMoney(s.avgSpentCents || 0)} sub={`median ${formatMoney(s.medianSpentCents || 0)}`} />
          <StatTile inset label="Days from first meeting" value={num(s.avgDaysToWin, 0)} sub={`${s.wonClients} won ${s.wonClients === 1 ? 'company' : 'companies'}`} />
        </div>
      )}
      {s && s.approximatedClients > 0 && (
        <p className="text-xs text-slate-500 mt-2">{s.approximatedClients} {s.approximatedClients === 1 ? 'company has' : 'companies have'} only a guessed win date and {s.approximatedClients === 1 ? 'is' : 'are'} left out of the averages.</p>
      )}

      {selectedUserId === 'all' && perUser.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <SortHeader field="name" label="Salesperson" sort={reps.sort} onSort={reps.toggleSort} />
                <SortHeader field="won" label="Won" sort={reps.sort} onSort={reps.toggleSort} align="right" />
                <SortHeader field="meetings" label="Avg meetings" sort={reps.sort} onSort={reps.toggleSort} align="right" />
                <SortHeader field="spent" label="Avg spent" sort={reps.sort} onSort={reps.toggleSort} align="right" />
                <SortHeader field="days" label="Avg days" sort={reps.sort} onSort={reps.toggleSort} align="right" />
                <SortHeader field="open" label="Open" sort={reps.sort} onSort={reps.toggleSort} align="right" />
                <SortHeader field="openSpend" label="Open spend" sort={reps.sort} onSort={reps.toggleSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perUserSorted.map(u => (
                <tr key={u.userId} className="hover:bg-slate-50">
                  <td className={`${TD} font-semibold text-slate-800`}>{u.userName}</td>
                  <td className={`${TD} text-right tabular-nums`}>{u.wonClients}</td>
                  <td className={`${TD} text-right text-slate-500 tabular-nums`}>{u.wonClients ? num(u.avgMeetings) : '—'}</td>
                  <td className={`${TD} text-right text-slate-500 tabular-nums`}>{u.wonClients ? formatMoney(u.avgSpentCents || 0) : '—'}</td>
                  <td className={`${TD} text-right text-slate-500 tabular-nums`}>{u.wonClients ? num(u.avgDaysToWin, 0) : '—'}</td>
                  <td className={`${TD} text-right text-slate-500 tabular-nums`}>{u.openClients}</td>
                  <td className={`${TD} text-right text-slate-500 tabular-nums`}>{formatMoney(u.openSpentCents || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openRows.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowOpen(v => !v)} className="text-xs font-semibold text-orange-600 hover:text-orange-700">
            {showOpen ? 'Hide' : 'Show'} {openRows.length} {openRows.length === 1 ? 'company' : 'companies'} still waiting on a first project
          </button>
          {showOpen && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <SortHeader field="company" label="Company" sort={opens.sort} onSort={opens.toggleSort} />
                    <SortHeader field="rep" label="Salesperson" sort={opens.sort} onSort={opens.toggleSort} />
                    <SortHeader field="meetings" label="Meetings" sort={opens.sort} onSort={opens.toggleSort} align="right" />
                    <SortHeader field="inPerson" label="In person" sort={opens.sort} onSort={opens.toggleSort} align="right" />
                    <SortHeader field="spent" label="Spent so far" sort={opens.sort} onSort={opens.toggleSort} align="right" />
                    <SortHeader field="first" label="First meeting" sort={opens.sort} onSort={opens.toggleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {openSorted.map(r => (
                    <tr key={r.clientId} className="hover:bg-slate-50">
                      <td className={TD}><Link href={`/clients/${r.clientId}`} className="font-semibold text-slate-800 hover:text-orange-600">{r.clientName}</Link></td>
                      <td className={`${TD} text-slate-500`}>{r.salesUserName || '—'}</td>
                      <td className={`${TD} text-right tabular-nums`}>{r.meetings}</td>
                      <td className={`${TD} text-right text-slate-500 tabular-nums`}>{r.inPerson}</td>
                      <td className={`${TD} text-right tabular-nums`}>{formatMoney(r.spentCents || 0)}</td>
                      <td className={`${TD} text-slate-500 tabular-nums`}>{fmtDate(r.firstTouchAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </WidgetFrame>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const RANGES = [
  { id: 'week',     label: 'This Week' },
  { id: 'month',    label: 'This Month' },
  { id: 'quarter',  label: 'This Quarter' },
  { id: 'ytd',      label: 'YTD' },
  { id: 'lastyear', label: 'Last Year' },
];

const FILTER_FIELDS = [
  { key: 'rep',   label: 'Rep',        kind: 'pick' },
  { key: 'range', label: 'Date range', kind: 'pick' },
];
const SORT_KEYS = ['name', 'inPerson', 'calls', 'other', 'spent'];
const VIEW_FIELDS = [...FILTER_FIELDS, ...SORT_KEYS.map(k => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: '', dir: 'asc' };

export default function SalesActivityPage() {
  const [notes,          setNotes]          = useState([]);
  const [upcoming,       setUpcoming]       = useState([]);
  const [newPeople,      setNewPeople]      = useState([]);
  const [expenses,       setExpenses]       = useState([]);
  const [firstProject,   setFirstProject]   = useState(null);
  const [loading,        setLoading]        = useState(true);
  // Rep and date range live in the address (useUrlView). Blank range = this month.
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [filtersOpen,    setFiltersOpen]    = useState(false);
  const dateRange      = filters.range || 'month';
  const selectedUserId = filters.rep   || 'all';
  const [err,            setErr]            = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [histRes, upcomingRes, peopleRes, expRes, fpRes] = await Promise.all([
        fetch('/api/crm/notes?includeStats=true'),
        fetch('/api/crm/notes/upcoming'),
        fetch('/api/crm/contacts/created-by-month'),
        fetch('/api/sales/expenses'),
        fetch('/api/sales/first-project-cost'),
      ]);
      if (expRes.ok) setExpenses((await expRes.json()).expenses || []);
      if (fpRes.ok)  setFirstProject(await fpRes.json());
      if (!histRes.ok) throw new Error(`Error ${histRes.status}`);
      const data = await histRes.json();
      setNotes(data.notes || data || []);
      if (upcomingRes.ok) {
        const upData = await upcomingRes.json();
        setUpcoming(upData.notes || []);
      }
      if (peopleRes.ok) {
        const rows = await peopleRes.json();
        setNewPeople(Array.isArray(rows) ? rows : []);
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
    for (const e of expenses) {
      if (e.userId && !seen.has(e.userId)) seen.set(e.userId, { id: e.userId, name: e.user?.name || e.userId });
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [notes, expenses]);

  const stats = useMemo(() => computeStats(notes, dateRange, selectedUserId, expenses), [notes, dateRange, selectedUserId, expenses]);

  const perUserSorted = useMemo(() => sortRows(stats.perUser, sort, {
    name:     u => u.userName || '',
    inPerson: u => u.inPersonCount,
    calls:    u => u.callCount,
    other:    u => u.otherCount,
    spent:    u => u.spentCents || 0,
  }), [stats.perUser, sort]);

  const choices = {
    rep:   userList.map(u => [u.id, u.name]),
    range: RANGES.map(r => [r.id, r.label]),
  };
  const filterCount = countFilters(filters, FILTER_FIELDS);

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
    <div className="px-4 py-6">
    <SectionTabs tabs={ACTIVITY_TABS} className="mb-5" />
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className={H1}>Sales Activity</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manually logged activities and what they cost, across your team</p>
        </div>
      </div>

      {/* Rep + date range filters */}
      <div className="mb-5">
        <FilterToolbar
          count={filterCount}
          open={filtersOpen}
          onToggle={() => setFiltersOpen(o => !o)}
          onClear={clearFilters}
          noun="notes"
        >
          <span className="text-xs text-slate-500">
            {RANGES.find(r => r.id === dateRange)?.label}{selectedUserId !== 'all' ? `, ${userList.find(u => u.id === selectedUserId)?.name || ''}` : ', All Reps'}
          </span>
        </FilterToolbar>
        <FilterPanel open={filtersOpen} fields={FILTER_FIELDS} filters={{ ...filters, range: dateRange }} choices={choices} onChange={setFilter} />
      </div>

      {err && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</p>
      )}

      {/* M365 notice */}
      <div className={`flex items-start gap-2.5 ${TONE.info} border rounded-lg px-4 py-3 mb-5 text-xs`}>
        <svg className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <span>Email and calendar activity coming when M365 is connected. Showing manually logged activities.</span>
      </div>

      {loading ? (
        <WidgetLoading />
      ) : (
        <div className="space-y-5">

          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
              value={formatMoney(stats.totalSpentCents || 0)}
              label="Spent"
              sub="Meals, travel, golf, gifts in this period"
              href="/sales/activity/expenses"
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
            <WidgetFrame title="Per-Rep Breakdown">
              {stats.perUser.length === 0 ? (
                <WidgetEmpty>No activity logged in this period.</WidgetEmpty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <SortHeader field="name" label="Name" sort={sort} onSort={toggleSort} />
                        <SortHeader field="inPerson" label="In-Person" sort={sort} onSort={toggleSort} align="right" />
                        <SortHeader field="calls" label="Calls" sort={sort} onSort={toggleSort} align="right" />
                        <SortHeader field="other" label="Other" sort={sort} onSort={toggleSort} align="right" />
                        <SortHeader field="spent" label="Spent" sort={sort} onSort={toggleSort} align="right" />
                        <Th>Types</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {perUserSorted.map(u => (
                        <tr key={u.userId} className="hover:bg-slate-50 transition-colors">
                          <td className={TD}>
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(u.userName)}`}>
                                {initials(u.userName)}
                              </div>
                              <span className="font-semibold text-slate-800 truncate max-w-[100px]">{u.userName}</span>
                            </div>
                          </td>
                          <td className={`${TD} text-right font-semibold tabular-nums`}>{u.inPersonCount}</td>
                          <td className={`${TD} text-right text-slate-500 tabular-nums`}>{u.callCount}</td>
                          <td className={`${TD} text-right text-slate-500 tabular-nums`}>{u.otherCount}</td>
                          <td className={`${TD} text-right text-slate-500 tabular-nums`}>{u.spentCents ? formatMoney(u.spentCents) : '—'}</td>
                          <td className={TD}>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(u.byActivityType)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 5)
                                .map(([type, count]) => {
                                  const meta = ACTIVITY_META[type] || ACTIVITY_META.OTHER;
                                  return (
                                    <span key={type} className="text-xs text-slate-500 tabular-nums">
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
            </WidgetFrame>

            {/* Activity Breakdown */}
            <WidgetFrame title="Activity Breakdown">
              {Object.keys(stats.byType).length === 0 ? (
                <WidgetEmpty>No activity in this period.</WidgetEmpty>
              ) : (
                <ActivityBarChart byType={stats.byType} />
              )}
            </WidgetFrame>

          </div>

          {/* ── By month / by quarter, per person and team (Oct 5 ask) ──────── */}
          <ByPeriodTable notes={notes} userList={userList} newPeople={newPeople} expenses={expenses} />

          {/* ── Cost to first project (0129) ─────────────────────────────────── */}
          <FirstProjectCost report={firstProject} selectedUserId={selectedUserId} />

          {/* ── Two-column row: recent feed + upcoming ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Recent activity feed */}
            <WidgetFrame title="Recent Activity">
              {recent10.length === 0 ? (
                <WidgetEmpty>No activity in this period.</WidgetEmpty>
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
                            <span className="text-xs font-semibold text-slate-800 line-clamp-1">
                              {note.title || `${meta.label}${contactName ? ' with ' + contactName : ''}`}
                            </span>
                            <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                              {fmtDate(note.meetingDate || note.createdAt)}
                            </span>
                          </div>
                          {(note.createdBy?.name || dealTitle) && (
                            <div className="flex items-center gap-2 mt-0.5">
                              {note.createdBy?.name && <span className="text-xs text-slate-500">{note.createdBy.name}</span>}
                              {dealTitle && <span className="text-xs text-slate-500">· {dealTitle}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </WidgetFrame>

            {/* Upcoming next 2 weeks */}
            <WidgetFrame
              title="Upcoming: Next 2 Weeks"
              actions={<span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">From calendar</span>}
            >
              {upcoming.length === 0 ? (
                <WidgetEmpty>No upcoming events in the next 2 weeks. Meetings with a date in the next two weeks show here.</WidgetEmpty>
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
                            <span className="text-xs font-semibold text-slate-800 line-clamp-1">
                              {note.title || `${meta.label}${contactName ? ' with ' + contactName : ''}`}
                            </span>
                            <span className={`text-xs font-semibold shrink-0 tabular-nums ${daysUntil <= 2 ? 'text-orange-600' : 'text-slate-500'}`}>
                              {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil}d`}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            {new Date(note.meetingDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {contactName && ` · ${contactName}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </WidgetFrame>

          </div>
        </div>
      )}
    </div>
    </div>
  );
}
