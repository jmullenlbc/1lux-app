'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import SectionTabs, { PIPELINE_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import { SortSelect, sortRows } from '@/components/ui/SortHeader';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';
import { CARD, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, BTN_COMPACT_PRIMARY, INPUT, LABEL, H1 } from '@/components/ui/tokens';

// Filter and sort live in the address (useUrlView).
const FILTER_FIELDS = [{ key: 'due', label: 'Due', kind: 'pick' }];
const DUE_CHOICES = [['overdue', 'Overdue'], ['due_soon', 'Due This Week']];
const SORT_FIELDS = [
  { key: 'name',    label: 'Name' },
  { key: 'company', label: 'Company' },
  { key: 'due',     label: 'Days overdue' },
  { key: 'last',    label: 'Last activity' },
  { key: 'cadence', label: 'Cadence' },
];
const VIEW_FIELDS = [...FILTER_FIELDS, ...SORT_FIELDS.map(f => ({ key: f.key, kind: 'sort' }))];
const SORT_DEFAULT = { key: '', dir: 'asc' };
const SORT_GETTERS = {
  name:    c => c.name || '',
  company: c => c.company?.name || '',
  due:     c => c.daysOverdue ?? null,
  last:    c => { const a = c.lastInPersonActivity; const d = a && (a.meetingDate || a.createdAt); return d ? new Date(d).getTime() : null; },
  cadence: c => c.cadenceDays ?? null,
};

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

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

const EMPTY_QUICK_LOG = {
  activityType: 'COFFEE',
  meetingDate: today(),
  notes: '',
};

// ── QuickLogForm ──────────────────────────────────────────────────────────────

function QuickLogForm({ contact, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_QUICK_LOG, meetingDate: today() });

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  function handleSave() {
    onSave(contact, form);
  }

  return (
    <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
      {/* Activity type pills */}
      <div>
        <p className={`${LABEL} mb-2`}>Activity Type</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ACTIVITY_META).filter(([, meta]) => !meta.legacy).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => set('activityType', key)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                form.activityType === key
                  ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                  : meta.inPerson
                    ? 'border-orange-200 bg-white text-orange-700 hover:border-orange-400'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              {meta.emoji} {meta.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date */}
      <div>
        <label className={`block ${LABEL} mb-1`}>Date</label>
        <input
          type="date"
          value={form.meetingDate}
          onChange={e => set('meetingDate', e.target.value)}
          className={`${INPUT} w-auto`}
        />
      </div>

      {/* Notes */}
      <div>
        <label className={`block ${LABEL} mb-1`}>Notes <span className="text-slate-500 font-normal normal-case">(optional)</span></label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={2}
          placeholder="What did you talk about?"
          className={`${INPUT} resize-none`}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className={BTN_PRIMARY}
        >
          {saving && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          Save &amp; Log
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className={BTN_SECONDARY}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── ContactRow ────────────────────────────────────────────────────────────────

function ContactRow({ contact, showQuickLog, onLogActivity, onCancelLog, onSaveLog, onSnooze, onEditCadence, savingLog, updatingCadence }) {
  const [editingCadence, setEditingCadence] = useState(false);
  const [cadenceVal, setCadenceVal] = useState(contact.cadenceDays ?? 30);

  const lastActivity = contact.lastInPersonActivity;
  const lastMeta = lastActivity ? ACTIVITY_META[lastActivity.activityType] || ACTIVITY_META.OTHER : null;
  const ago = lastActivity ? daysAgo(lastActivity.meetingDate || lastActivity.createdAt) : null;

  const isOverdue = contact.daysOverdue > 0;
  const isDueSoon = contact.daysOverdue >= -7 && contact.daysOverdue <= 0;

  async function handleCadenceSave() {
    setEditingCadence(false);
    onEditCadence(contact.id, cadenceVal);
  }

  return (
    <div className={`${CARD} px-5 py-4 hover:border-slate-300 transition-colors`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-bold ${avatarColor(contact.name)}`}>
          {initials(contact.name)}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {/* Name + last activity */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-900">{contact.name}</span>
                {lastMeta && (
                  <span className="text-xs text-slate-500">
                    {lastMeta.emoji} {lastMeta.label}: <span className="tabular-nums">{fmtDate(lastActivity.meetingDate || lastActivity.createdAt)}</span>
                    {ago !== null && <span className="text-slate-500 tabular-nums"> ({ago}d ago)</span>}
                  </span>
                )}
                {!lastActivity && (
                  <span className="text-xs text-slate-500 italic">No in-person activity logged</span>
                )}
              </div>
              {/* Title + company + deal */}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {contact.title && <span className="text-xs text-slate-500">{contact.title}</span>}
                {contact.company?.name && (
                  <span className="text-xs text-slate-500">· {contact.company.name}</span>
                )}
                {contact.latestDeal && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-lg text-xs font-semibold border ${
                    contact.latestDeal.pipeline === 'PROCUREMENT'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-purple-50 text-purple-700 border-purple-200'
                  }`}>
                    {contact.latestDeal.title || contact.latestDeal.stage}
                  </span>
                )}
              </div>
            </div>

            {/* Status badge */}
            <div className="shrink-0">
              {isOverdue ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap tabular-nums">
                  ⚠ {contact.daysOverdue}d overdue
                </span>
              ) : isDueSoon ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap tabular-nums">
                  Due in {Math.abs(contact.daysOverdue)}d
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200 whitespace-nowrap tabular-nums">
                  In {Math.abs(contact.daysOverdue)}d
                </span>
              )}
            </div>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <button
              onClick={() => onLogActivity(contact.id)}
              className={BTN_COMPACT_PRIMARY}
            >
              Log Activity
            </button>
            <button
              onClick={() => onSnooze(contact.id)}
              disabled={updatingCadence === contact.id}
              className={BTN_COMPACT}
            >
              Snooze 2 wks
            </button>
            <button
              onClick={() => { setEditingCadence(v => !v); setCadenceVal(contact.cadenceDays ?? 30); }}
              className={BTN_COMPACT}
            >
              Edit Cadence
            </button>

            {/* Inline cadence editor */}
            {editingCadence && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={cadenceVal}
                  onChange={e => setCadenceVal(parseInt(e.target.value) || 30)}
                  onBlur={handleCadenceSave}
                  onKeyDown={e => e.key === 'Enter' && handleCadenceSave()}
                  autoFocus
                  className={`${INPUT} w-16 px-2 py-0.5 text-xs tabular-nums`}
                />
                <span className="text-xs text-slate-500">days</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick-log form */}
      {showQuickLog && (
        <QuickLogForm
          contact={contact}
          onSave={onSaveLog}
          onCancel={onCancelLog}
          saving={savingLog}
        />
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, count, contacts, headerClass, ...rowProps }) {
  if (contacts.length === 0) return null;
  return (
    <div>
      <h2 className={`text-xs font-semibold uppercase mb-3 px-1 ${headerClass}`}>
        {title} ({count})
      </h2>
      <div className="space-y-2">
        {contacts.map(c => (
          <ContactRow key={c.id} contact={c} {...rowProps} />
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CheckInsPage() {
  const [contacts,       setContacts]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const { filters, setFilter, clearFilters, sort, setSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [filterOpen,     setFilterOpen]     = useState(false);
  const filter = filters.due || 'all'; // 'all' | 'overdue' | 'due_soon'
  const [showQuickLog,   setShowQuickLog]   = useState(null);  // contactId or null
  const [quickLogForm,   setQuickLogForm]   = useState(null);  // unused, managed inside QuickLogForm
  const [savingLog,      setSavingLog]      = useState(false);
  const [updatingCadence, setUpdatingCadence] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/crm/contacts/check-ins-due');
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setContacts(data.contacts || data || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter
  const visible = contacts.filter(c => {
    if (filter === 'overdue')  return c.daysOverdue > 0;
    if (filter === 'due_soon') return c.daysOverdue >= -7 && c.daysOverdue <= 0;
    return true;
  });

  const sortedVisible = useMemo(() => sortRows(visible, sort, SORT_GETTERS), [visible, sort]);
  const overdue  = sortedVisible.filter(c => c.daysOverdue > 0);
  const dueSoon  = sortedVisible.filter(c => c.daysOverdue >= -7 && c.daysOverdue <= 0);
  const upcoming = sortedVisible.filter(c => c.daysOverdue < -7);
  const filterCount = countFilters(filters, FILTER_FIELDS);

  // Handlers
  function handleLogActivity(contactId) {
    setShowQuickLog(prev => prev === contactId ? null : contactId);
  }

  async function handleSaveLog(contact, form) {
    setSavingLog(true);
    setErr('');
    const meta = ACTIVITY_META[form.activityType] || ACTIVITY_META.OTHER;
    try {
      const res = await fetch('/api/crm/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityType: form.activityType,
          meetingDate:  form.meetingDate,
          contactIds:   [contact.id],
          title:        `${meta.label} with ${contact.name}`,
          noteBody:     form.notes || '',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Update local state: mark lastInPersonAt if this was an in-person activity
      if (meta.inPerson) {
        setContacts(prev => prev.map(c =>
          c.id === contact.id
            ? { ...c, lastInPersonActivity: { activityType: form.activityType, meetingDate: form.meetingDate } }
            : c
        ));
      }
      setShowQuickLog(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSavingLog(false);
    }
  }

  async function handleSnooze(contactId) {
    const nextCheckInAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setUpdatingCadence(contactId);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/cadence`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextCheckInAt }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Remove from list (snoozed; will reappear when due)
      setContacts(prev => prev.filter(c => c.id !== contactId));
    } catch (e) {
      setErr(e.message);
    } finally {
      setUpdatingCadence(null);
    }
  }

  async function handleEditCadence(contactId, cadenceDays) {
    setUpdatingCadence(contactId);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/cadence`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadenceDays }),
      });
      if (!res.ok) throw new Error(await res.text());
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, cadenceDays } : c));
    } catch (e) {
      setErr(e.message);
    } finally {
      setUpdatingCadence(null);
    }
  }

  const rowProps = {
    showQuickLog: null,
    onLogActivity: handleLogActivity,
    onCancelLog: () => setShowQuickLog(null),
    onSaveLog: handleSaveLog,
    onSnooze: handleSnooze,
    onEditCadence: handleEditCadence,
    savingLog,
    updatingCadence,
  };

  return (
    <div className="px-4 py-6">
      {/* Pipeline / Contacts / Check-ins tabs (Mike 10-6). */}
      <SectionTabs tabs={PIPELINE_TABS} className="mb-5" />
      <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className={H1}>Check-ins</h1>
        <p className="text-xs text-slate-500 mt-0.5">Contacts due for an in-person touchpoint</p>
      </div>

      {err && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</p>
      )}

      {/* Filters */}
      <div className="mb-6">
        <FilterToolbar
          count={filterCount}
          open={filterOpen}
          onToggle={() => setFilterOpen(o => !o)}
          onClear={clearFilters}
          shown={visible.length}
          total={contacts.length}
          noun="contacts"
          right={<SortSelect fields={SORT_FIELDS} sort={sort} onChange={setSort} />}
        />
        <FilterPanel open={filterOpen} fields={FILTER_FIELDS} filters={filters} choices={{ due: DUE_CHOICES }} onChange={setFilter} />
      </div>

      {loading ? (
        <WidgetLoading />
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-700 flex items-center justify-center mb-3 text-2xl">✓</div>
          <p className="text-sm font-semibold text-slate-700">All caught up</p>
          <p className="text-xs text-slate-500 mt-1">No check-ins due right now.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Section
            title="OVERDUE"
            count={overdue.length}
            contacts={overdue}
            headerClass="text-red-600"
            {...rowProps}
            showQuickLog={showQuickLog}
          />
          <Section
            title="DUE THIS WEEK"
            count={dueSoon.length}
            contacts={dueSoon}
            headerClass="text-amber-600"
            {...rowProps}
            showQuickLog={showQuickLog}
          />
          <Section
            title="UPCOMING"
            count={upcoming.length}
            contacts={upcoming}
            headerClass="text-slate-500"
            {...rowProps}
            showQuickLog={showQuickLog}
          />
        </div>
      )}
      </div>
    </div>
  );
}
