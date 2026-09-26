'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DraftCard from '@/components/sales/DraftCard';
import SnoozeBox from '@/components/sales/SnoozeBox';
import { DESK_CHANGED } from '@/lib/desk/desk';
import { useDraftReminder } from '@/components/layout/useDraftReminder';

// My Desk (Mike 9-26): the one place a salesperson looks. Reminders from their
// sales notes, email drafts to review, check-ins due, notes still to finish.
// Built for a phone first: one column, big buttons.



function when(d) {
  if (!d) return 'No date';
  const x = new Date(d);
  const days = Math.round((new Date(x).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${-days} days late`;
  return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Btn({ children, onClick, tone = 'plain', disabled }) {
  const cls = {
    plain: 'border border-slate-200 text-slate-600 bg-white hover:bg-slate-50',
    go:    'bg-emerald-600 text-white hover:bg-emerald-700',
    warn:  'border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100',
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`min-h-[40px] px-3 rounded-lg text-sm font-medium disabled:opacity-40 ${cls}`}>{children}</button>
  );
}

function StepRow({ a, group, onAct }) {
  const [snoozing, setSnoozing] = useState(false);
  const [busy, setBusy] = useState(false);
  async function act(body) {
    setBusy(true);
    await onAct(a.id, body);
    setBusy(false);
    setSnoozing(false);
  }
  const due = group === 'SNOOZED' ? a.snoozedUntil : (a.remindAt || a.dueDate);
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800">{a.detail || a.rawText}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {a.who && (a.clientId ? <Link href={`/clients/${a.clientId}`} className="hover:underline">{a.who}</Link> : a.who)}
            {a.who && ' · '}{a.label}
            {a.note && <> · <Link href={`/crm/notes?note=${a.note.id}`} className="hover:underline">{a.note.title || 'note'}</Link></>}
          </p>
        </div>
        <span className={`shrink-0 text-xs ${group === 'OVERDUE' ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
          {group === 'SNOOZED' ? `Until ${when(due)}` : group === 'PAUSED' ? 'Paused' : when(due)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Btn tone="go" disabled={busy} onClick={() => act({ do: 'done' })}>Done</Btn>
        {group === 'SNOOZED'
          ? <Btn disabled={busy} onClick={() => act({ do: 'unsnooze' })}>Wake up now</Btn>
          : group !== 'PAUSED' && <Btn disabled={busy} onClick={() => setSnoozing(s => !s)}>Snooze</Btn>}
        {group === 'PAUSED'
          ? <Btn tone="warn" disabled={busy} onClick={() => act({ do: 'resume' })}>Turn back on</Btn>
          : <Btn disabled={busy} onClick={() => act({ do: 'pause' })}>Pause</Btn>}
      </div>
      {snoozing && <SnoozeBox busy={busy} onPick={pick => act({ do: 'snooze', ...pick })} onClose={() => setSnoozing(false)} />}
    </li>
  );
}

function CheckInRow({ c, onSnoozed }) {
  const [snoozing, setSnoozing] = useState(false);
  const [err, setErr] = useState('');
  async function snooze({ days, date }) {
    const until = date || new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const res = await fetch(`/api/crm/contacts/${c.id}/cadence`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextCheckInAt: until }),
    }).catch(() => null);
    if (res?.ok) onSnoozed(c.id); else setErr('Could not snooze.');
  }
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800">{c.preferredName || c.name}</p>
          <p className="text-xs text-slate-500">{c.client?.name || c.company || ''}</p>
        </div>
        <span className="shrink-0 text-xs text-rose-600 font-semibold">{c.daysOverdue} days over</span>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {c.client?.id && <Link href={`/clients/${c.client.id}`} className="min-h-[40px] px-3 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center">Open</Link>}
        <Btn onClick={() => setSnoozing(s => !s)}>Snooze</Btn>
      </div>
      {snoozing && <SnoozeBox onPick={snooze} onClose={() => setSnoozing(false)} />}
      {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
    </li>
  );
}

function Section({ title, count, children, right }) {
  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {count != null && <span className="text-xs text-slate-400">{count}</span>}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </section>
  );
}

export default function MyDeskPage() {
  const [desk, setDesk] = useState(null);
  const [checkIns, setCheckIns] = useState([]);
  const [err, setErr] = useState('');
  const [openGroups, setOpenGroups] = useState({ SNOOZED: false, PAUSED: false });
  const { count: notesToFinish } = useDraftReminder() || {};

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sales/desk');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      setDesk(d);
    } catch (e) { setErr(e.message); }
    fetch('/api/crm/contacts/check-ins-due?status=overdue').then(r => r.json())
      .then(d => setCheckIns(d.contacts || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id, body) {
    const res = await fetch(`/api/sales/desk/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) { setErr(d?.error || 'Could not save.'); return; }
    setErr('');
    await load();
    window.dispatchEvent(new Event(DESK_CHANGED));
  }

  if (!desk) return <div className="p-4 text-sm text-slate-400">{err || 'Loading your desk…'}</div>;
  const steps = desk.groups.reduce((n, g) => n + (g.key === 'SNOOZED' || g.key === 'PAUSED' ? 0 : g.items.length), 0);
  const quiet = steps === 0 && desk.drafts.length === 0 && checkIns.length === 0 && !notesToFinish;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      <h1 className="text-lg font-semibold text-slate-800">My Desk</h1>
      <p className="text-xs text-slate-500 mb-4">Everything waiting on you: reminders, emails to review, check-ins and notes to finish.</p>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {quiet && <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 p-6 text-center">Nothing waiting on you. Nice.</p>}

      {notesToFinish > 0 && (
        <Link href="/crm/notes?status=mine" className="block mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {notesToFinish} meeting {notesToFinish === 1 ? 'note' : 'notes'} to finish. Tap to write {notesToFinish === 1 ? 'it' : 'them'} up.
        </Link>
      )}

      {desk.groups.map(g => {
        const folded = (g.key === 'SNOOZED' || g.key === 'PAUSED') && !openGroups[g.key];
        return (
          <Section key={g.key} title={g.label} count={g.items.length}
            right={(g.key === 'SNOOZED' || g.key === 'PAUSED') && (
              <button type="button" onClick={() => setOpenGroups(o => ({ ...o, [g.key]: !o[g.key] }))} className="text-xs text-slate-400 hover:underline">
                {folded ? 'Show' : 'Hide'}
              </button>
            )}>
            {!folded && <ul className="space-y-2">{g.items.map(a => <StepRow key={a.id} a={a} group={g.key} onAct={act} />)}</ul>}
          </Section>
        );
      })}

      {desk.drafts.length > 0 && (
        <Section title="Emails to review" count={desk.drafts.length}>
          <p className="text-xs text-slate-400 mb-2">Nothing sends on its own. Edit, copy, or dismiss.</p>
          <div className="space-y-2">
            {desk.drafts.map(d => (
              <DraftCard key={d.id} draft={d}
                onCancel={id => setDesk(s => ({ ...s, drafts: s.drafts.filter(x => x.id !== id) }))}
                onUpdate={nd => setDesk(s => ({ ...s, drafts: s.drafts.map(x => (x.id === nd.id ? { ...x, ...nd } : x)) }))} />
            ))}
          </div>
        </Section>
      )}

      {checkIns.length > 0 && (
        <Section title="Check-ins due" count={checkIns.length}
          right={<Link href="/sales/check-ins" className="text-xs text-slate-400 hover:underline">All check-ins</Link>}>
          <ul className="space-y-2">
            {checkIns.slice(0, 10).map(c => <CheckInRow key={c.id} c={c} onSnoozed={id => setCheckIns(l => l.filter(x => x.id !== id))} />)}
          </ul>
        </Section>
      )}
    </div>
  );
}
