'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusPill({ status }) {
  const map = {
    PENDING_REVIEW:  ['bg-amber-50 text-amber-700 border-amber-200',  'Pending Review'],
    SENT:            ['bg-green-50 text-green-700 border-green-200',   'Sent'],
    MANUALLY_SENT:   ['bg-green-50 text-green-700 border-green-200',   'Sent (Manual)'],
    CANCELLED:       ['bg-slate-100 text-slate-500 border-slate-200',  'Cancelled'],
    CONFIRMED:       ['bg-blue-50 text-blue-700 border-blue-200',      'Confirmed'],
    AWAITING_CONFIRM:['bg-indigo-50 text-indigo-700 border-indigo-200','Awaiting Confirm'],
  };
  const [cls, label] = map[status] || ['bg-slate-100 text-slate-500 border-slate-200', status];
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function CountdownTimer({ expiresAt }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    function calc() {
      const diff = Math.floor((new Date(expiresAt) - Date.now()) / 1000);
      setRemaining(diff);
    }
    calc();
    const t = setInterval(calc, 10000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (remaining === null) return null;
  if (remaining <= 0) return <span className="text-[11px] font-semibold text-red-600">Sending now…</span>;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const cls = remaining < 300 ? 'text-red-600' : remaining < 600 ? 'text-amber-600' : 'text-slate-500';
  return (
    <span className={`text-[11px] font-semibold ${cls} flex items-center gap-1`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {mins}m {secs.toString().padStart(2,'0')}s
    </span>
  );
}

function DraftCard({ draft, onCancel, onUpdate }) {
  const [cancelling,  setCancelling]  = useState(false);
  const [expanded,    setExpanded]    = useState(false);
  const [editSubject, setEditSubject] = useState(draft.subject);
  const [editBody,    setEditBody]    = useState(draft.body);
  const [saving,      setSaving]      = useState(false);
  const [copied,      setCopied]      = useState(false);

  const isPending = draft.status === 'PENDING_REVIEW';

  async function handleCancel() {
    if (!confirm('Cancel this draft?')) return;
    setCancelling(true);
    await fetch(`/api/bot/drafts/${draft.id}/cancel`, { method: 'POST' }).catch(() => {});
    onCancel(draft.id);
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/bot/drafts/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: editSubject, body: editBody }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      const d = await res.json();
      onUpdate(d.draft || { ...draft, subject: editSubject, body: editBody });
      setExpanded(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(`Subject: ${editSubject}\n\n${editBody}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`border rounded-xl bg-white shadow-sm transition-colors ${isPending ? 'border-amber-200' : 'border-slate-200'}`}>
      {/* Card header — always visible */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-mono font-bold text-slate-700 truncate">
                {draft.deal?.title || 'No deal linked'}
              </span>
              {draft.deal?.pipeline && (
                <span className="text-[10px] text-slate-400 shrink-0">{draft.deal.pipeline}</span>
              )}
              {draft.classificationReason && (
                <span className="text-[10px] text-slate-400 shrink-0 italic">{draft.classificationReason}</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              To: {draft.toName ? `${draft.toName} <${draft.toEmail}>` : draft.toEmail}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusPill status={draft.status} />
            {isPending && draft.reviewExpiresAt && <CountdownTimer expiresAt={draft.reviewExpiresAt} />}
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg px-3 py-2 mb-3">
          <p className="text-[11px] font-semibold text-slate-700 mb-0.5">{draft.subject}</p>
          <p className={`text-[11px] text-slate-500 ${expanded ? '' : 'line-clamp-2'}`}>{draft.body}</p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400">{fmtDate(draft.createdAt)}</span>
          {isPending && (
            <div className="flex gap-2">
              <button
                onClick={() => { setEditSubject(draft.subject); setEditBody(draft.body); setExpanded(v => !v); }}
                className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {expanded ? 'Close' : 'Edit & Review'}
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-3 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                {cancelling ? 'Cancelling…' : 'Dismiss'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit panel — expanded */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/50 rounded-b-xl">
          <div className="mb-3">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Subject</label>
            <input
              value={editSubject}
              onChange={e => setEditSubject(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="mb-3">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Body</label>
            <textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              rows={8}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y font-mono leading-relaxed"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-[11px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save edits'}
            </button>
            <button
              onClick={handleCopy}
              className="px-4 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-white transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy to clipboard'}
            </button>
            <span className="text-[10px] text-slate-400 ml-1 italic">
              Email sending via M365 coming in Phase E
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ type }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          {type === 'SCHEDULING_REPLY'
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          }
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">No drafts yet</h3>
      <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
        {type === 'SCHEDULING_REPLY'
          ? 'The bot will populate this once scheduling rules are active and inbound emails are connected (Phase B).'
          : 'Follow-up drafts will appear here once Bot Rules are active and deals become stale. Configure rules in Sales Automation.'}
      </p>
    </div>
  );
}

// ── Helpers for Check-ins ─────────────────────────────────────────────────────

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

const CHECKIN_ACTIVITY_TYPES = ['COFFEE','LUNCH','HAPPY_HOUR','GOLF','SITE_VISIT','CALL','EMAIL','EVENT','OTHER'];
const CHECKIN_ACTIVITY_META = {
  COFFEE:     { emoji: '☕', label: 'Coffee' },
  LUNCH:      { emoji: '🍽', label: 'Lunch' },
  HAPPY_HOUR: { emoji: '🍺', label: 'Happy Hour' },
  GOLF:       { emoji: '⛳', label: 'Golf' },
  SITE_VISIT: { emoji: '🏗', label: 'Site Visit' },
  CALL:       { emoji: '📞', label: 'Call' },
  EMAIL:      { emoji: '📧', label: 'Email' },
  EVENT:      { emoji: '🎉', label: 'Event' },
  OTHER:      { emoji: '📋', label: 'Other' },
};

// ── Main component ────────────────────────────────────────────────────────────

export default function BotQueuePage() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const pathname    = usePathname();

  const rawTab = searchParams.get('tab');
  const tab = rawTab === 'follow-ups' ? 'follow-ups' : rawTab === 'check-ins' ? 'check-ins' : 'scheduling';

  const [drafts,  setDrafts]  = useState([]);
  const [loading, setLoading] = useState(true);

  // Check-ins state
  const [checkIns,        setCheckIns]        = useState([]);
  const [checkInsLoading, setCheckInsLoading] = useState(false);
  const [checkInFilter,   setCheckInFilter]   = useState('all'); // 'all' | 'overdue' | 'week'
  const [showQuickLogFor, setShowQuickLogFor] = useState(null); // contactId or null
  const [quickLogForm,    setQuickLogForm]    = useState({ activityType: 'COFFEE', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [savingLog,       setSavingLog]       = useState(false);

  function setTab(t) {
    const p = new URLSearchParams(searchParams.toString());
    p.set('tab', t);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  const load = useCallback(async () => {
    setLoading(true);
    const type = tab === 'scheduling' ? 'SCHEDULING_REPLY' : 'FOLLOW_UP';
    try {
      const res = await fetch(`/api/bot/queue?type=${type}`);
      if (res.ok) {
        const d = await res.json();
        setDrafts(d.drafts || []);
      }
    } catch {}
    setLoading(false);
  }, [tab]);

  const loadCheckIns = useCallback(async () => {
    setCheckInsLoading(true);
    try {
      const res = await fetch('/api/crm/contacts/check-ins-due');
      if (res.ok) {
        const d = await res.json();
        setCheckIns(d.contacts || d || []);
      }
    } catch {}
    setCheckInsLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'check-ins') {
      loadCheckIns();
    } else {
      load();
    }
  }, [tab, load, loadCheckIns]);

  function handleCancel(id) {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'CANCELLED' } : d));
  }

  function handleUpdate(updatedDraft) {
    setDrafts(prev => prev.map(d => d.id === updatedDraft.id ? { ...d, ...updatedDraft } : d));
  }

  async function handleSnooze(contact) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 14);
    try {
      await fetch(`/api/crm/contacts/${contact.id}/cadence`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextCheckInAt: nextDate.toISOString() }),
      });
      setCheckIns(prev => prev.filter(c => c.id !== contact.id));
    } catch {}
  }

  async function handleSaveLog(contact) {
    setSavingLog(true);
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityType: quickLogForm.activityType,
          date: quickLogForm.date,
          notes: quickLogForm.notes,
        }),
      });
      if (res.ok) {
        setShowQuickLogFor(null);
        setQuickLogForm({ activityType: 'COFFEE', date: new Date().toISOString().slice(0, 10), notes: '' });
        setCheckIns(prev => prev.filter(c => c.id !== contact.id));
      }
    } catch {}
    setSavingLog(false);
  }

  // Filter check-ins
  const now = new Date();
  const oneWeekOut = new Date(); oneWeekOut.setDate(now.getDate() + 7);
  const filteredCheckIns = checkIns.filter(c => {
    if (checkInFilter === 'overdue') {
      return c.nextCheckInAt ? new Date(c.nextCheckInAt) < now : true;
    }
    if (checkInFilter === 'week') {
      const d = c.nextCheckInAt ? new Date(c.nextCheckInAt) : null;
      return d && d >= now && d <= oneWeekOut;
    }
    return true;
  });

  const pending = drafts.filter(d => d.status === 'PENDING_REVIEW');
  const sent    = drafts.filter(d => ['SENT','MANUALLY_SENT','CONFIRMED','AWAITING_CONFIRM'].includes(d.status));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Bot Queue</h1>
          <p className="text-xs text-slate-500 mt-0.5">AI-drafted emails pending review or auto-send</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          Email sending via M365 coming in Phase E — copy to clipboard to send manually
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5 w-fit">
        {[['scheduling', 'Scheduling'], ['follow-ups', 'Follow-Ups'], ['check-ins', 'Check-ins']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            {id === 'scheduling' && pending.length > 0 && tab === 'scheduling' && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pending.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Check-ins tab ─────────────────────────────────────────────────── */}
      {tab === 'check-ins' && (
        <div>
          {/* Sub-filter tabs */}
          <div className="flex gap-1 mb-4">
            {[['all', 'All'], ['overdue', 'Overdue'], ['week', 'Due This Week']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setCheckInFilter(id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  checkInFilter === id ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {checkInsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : filteredCheckIns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">No check-ins due</h3>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                {checkInFilter === 'overdue' ? 'No overdue check-ins.' : checkInFilter === 'week' ? 'No check-ins due this week.' : 'All contacts are up to date.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCheckIns.map(contact => {
                const isOverdue = contact.nextCheckInAt ? new Date(contact.nextCheckInAt) < now : true;
                const isLogging = showQuickLogFor === contact.id;
                return (
                  <div key={contact.id} className="border border-slate-200 rounded-xl bg-white shadow-sm">
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-bold ${avatarColor(contact.name)}`}>
                          {initials(contact.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900">{contact.name}</span>
                            {contact.title && <span className="text-xs text-slate-500">{contact.title}</span>}
                            {isOverdue && (
                              <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Overdue</span>
                            )}
                          </div>
                          {contact.lastInPersonAt && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Last in-person: {fmtDate(contact.lastInPersonAt)}
                            </p>
                          )}
                          {contact.deal && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Deal: {contact.deal.title || `#${contact.deal.dealNumber}`}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              setShowQuickLogFor(isLogging ? null : contact.id);
                              setQuickLogForm({ activityType: 'COFFEE', date: new Date().toISOString().slice(0, 10), notes: '' });
                            }}
                            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                          >
                            {isLogging ? 'Cancel' : 'Log Activity'}
                          </button>
                          <button
                            onClick={() => handleSnooze(contact)}
                            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Snooze 2 wks
                          </button>
                        </div>
                      </div>

                      {/* Quick log inline form */}
                      {isLogging && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          {/* Activity type pills */}
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {CHECKIN_ACTIVITY_TYPES.map(type => {
                              const meta = CHECKIN_ACTIVITY_META[type];
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setQuickLogForm(p => ({ ...p, activityType: type }))}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                                    quickLogForm.activityType === type
                                      ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                  }`}
                                >
                                  {meta.emoji} {meta.label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex items-end gap-2">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1">Date</label>
                              <input
                                type="date"
                                value={quickLogForm.date}
                                onChange={e => setQuickLogForm(p => ({ ...p, date: e.target.value }))}
                                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-400"
                              />
                            </div>
                            <button
                              disabled={savingLog}
                              onClick={() => handleSaveLog(contact)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
                            >
                              {savingLog ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Scheduling / Follow-ups tabs ──────────────────────────────────── */}
      {tab !== 'check-ins' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : drafts.length === 0 ? (
            <EmptyState type={tab === 'scheduling' ? 'SCHEDULING_REPLY' : 'FOLLOW_UP'} />
          ) : (
            <div className="space-y-4">
              {pending.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-2">
                    Pending Review ({pending.length})
                  </p>
                  <div className="space-y-3">
                    {pending.map(d => <DraftCard key={d.id} draft={d} onCancel={handleCancel} onUpdate={handleUpdate} />)}
                  </div>
                </div>
              )}
              {sent.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2 mt-4">
                    Sent / History ({sent.length})
                  </p>
                  <div className="space-y-3">
                    {sent.map(d => <DraftCard key={d.id} draft={d} onCancel={handleCancel} onUpdate={handleUpdate} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
