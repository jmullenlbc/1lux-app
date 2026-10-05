'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DraftCard from '@/components/sales/DraftCard';
import SnoozeBox from '@/components/sales/SnoozeBox';
import { DESK_CHANGED } from '@/lib/desk/desk';
import { useDraftReminder } from '@/components/layout/useDraftReminder';
import QuickNote from '@/components/desk/QuickNote';
import PersonPicker from '@/components/desk/PersonPicker';
import { ReviewRow } from '@/components/crm/LookAlikeReviews';

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

function CheckInRow({ c, draft, onSnoozed, onWritten }) {
  const [snoozing, setSnoozing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [err, setErr] = useState('');
  async function snooze({ days, date }) {
    const until = date || new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const res = await fetch(`/api/crm/contacts/${c.id}/cadence`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextCheckInAt: until }),
    }).catch(() => null);
    if (res?.ok) onSnoozed(c.id); else setErr('Could not snooze.');
  }
  async function write() {
    setWriting(true); setErr('');
    const res = await fetch(`/api/sales/desk/check-in/${c.id}`, { method: 'POST' }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setWriting(false);
    if (!res?.ok) { setErr(d?.error || 'Could not write the email.'); return; }
    if (d.onDeskOf) { setErr(`An email to ${c.preferredName || c.name} is already waiting on ${d.onDeskOf}'s desk.`); return; }
    onWritten(d.draft?.id);
  }
  const jump = () => document.getElementById(`draft-${draft.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        {draft
          ? <Btn tone="go" onClick={jump}>Email ready</Btn>
          : c.email && <Btn tone="go" disabled={writing} onClick={write}>{writing ? 'Writing…' : 'Write email'}</Btn>}
        {c.client?.id && <Link href={`/clients/${c.client.id}`} className="min-h-[40px] px-3 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 inline-flex items-center">Open</Link>}
        <Btn onClick={() => setSnoozing(s => !s)}>Snooze</Btn>
      </div>
      {snoozing && <SnoozeBox onPick={snooze} onClose={() => setSnoozing(false)} />}
      {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
    </li>
  );
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(d?.error || (res ? 'Could not save.' : 'No signal. Try again in a moment.'));
  return d;
}

// An in-person meeting this week with someone not in the CRM (Mike 9-26).
function MeetingRow({ m, onDone }) {
  const [picking, setPicking] = useState(null); // { key, start, addOnly }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run(body, after) {
    setBusy(true); setErr('');
    try { const d = await post(`/api/sales/desk/meeting/${m.id}`, body); setPicking(null); await onDone(after?.(d)); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const add = c => run({ do: 'add', contactId: c.id }, d => (d.drafted ? `${c.name} added. Their follow-up email is in Emails to review.` : `${c.name} added.`));
  const picker = key => picking?.key === key && (
    <div className="mt-2"><PersonPicker autoFocus addOnly={picking.addOnly} start={picking.start} onPick={add} /></div>
  );

  return (
    <li className="rounded-xl border border-amber-200 bg-white p-3">
      <div className="text-sm font-medium text-slate-800">{m.title || 'In-person meeting'}</div>
      <div className="text-xs text-slate-400 mb-2">{when(m.meetingDate)}{m.isPublished ? '' : ' · note not published yet'}</div>
      {m.unknown.map(g => (
        <div key={g.email} className="mb-2">
          <p className="text-sm text-slate-600"><b>{g.name}</b> <span className="text-slate-400">{g.email}</span> is not in the system. Add them so the follow-up email can be written.</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Btn tone="go" disabled={busy} onClick={() => setPicking({ key: g.email, start: g, addOnly: true })}>Add them</Btn>
            <Btn disabled={busy} onClick={() => setPicking({ key: `${g.email}:find`, start: { name: g.name } })}>They are in, under another email</Btn>
          </div>
          {picker(g.email)}{picker(`${g.email}:find`)}
        </div>
      ))}
      {m.nobody && (
        <div className="mb-2">
          <p className="text-sm text-slate-600">Nobody is on this meeting yet. Add who you met so the follow-up email can be written.</p>
          <div className="mt-2"><PersonPicker onPick={add} /></div>
        </div>
      )}
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="flex gap-2 mt-1">
        <Btn disabled={busy} onClick={() => run({ do: 'skip' })}>Nobody to add</Btn>
      </div>
    </li>
  );
}

// Check-ins nobody owns: no email gets written until someone takes them.
function NoOwnerRow({ c, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function take() {
    setBusy(true); setErr('');
    try { const d = await post(`/api/sales/desk/take/${c.id}`); await onDone(d.drafted ? `${c.name} is yours. Their check-in email is in Emails to review.` : `${c.name} is yours.`); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800">{c.name}</div>
        <div className="text-xs text-slate-400">{[c.company, `check-in ${when(c.due).toLowerCase()}`, c.email ? '' : 'no email on file'].filter(Boolean).join(' · ')}</div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
      <Btn tone="go" disabled={busy} onClick={take}>Take them</Btn>
      {c.clientId && <Link href={`/clients/${c.clientId}`} className="min-h-[40px] px-3 rounded-lg text-sm border border-slate-200 text-slate-600 inline-flex items-center">Open</Link>}
    </li>
  );
}

// A web budget project no salesperson has yet (0117): take it or give it to someone in Sales.
function PoolRow({ p, salesPeople, myId, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function give(userId) {
    setBusy(true); setErr('');
    try {
      await post(`/api/sales/desk/pool/${p.id}`, userId ? { userId } : {});
      const name = salesPeople.find(u => u.id === userId)?.name;
      await onDone(userId && userId !== myId ? `${p.name} went to ${name || 'them'}.` : `${p.name} is yours.`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <Link href={`/project/${p.id}`} className="text-sm font-medium text-slate-800 hover:underline">{p.name}</Link>
        <div className="text-xs text-slate-400">
          {[p.budgetNumber, [p.city, p.state].filter(Boolean).join(', '), p.client?.name, p.contactName, `made ${new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`].filter(Boolean).join(' · ')}
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
      <Btn tone="go" disabled={busy} onClick={() => give(null)}>Take it</Btn>
      {salesPeople.length > 0 && (
        <select disabled={busy} value="" onChange={e => e.target.value && give(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-600">
          <option value="">Give to...</option>
          {salesPeople.filter(u => u.id !== myId).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
    </li>
  );
}

function Section({ title, count, children, right, id }) {
  return (
    <section id={id} className="mb-6 scroll-mt-4">
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
  const [flash, setFlash] = useState('');
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

  const changed = async text => {
    if (text) setFlash(text);
    await load();
    window.dispatchEvent(new Event(DESK_CHANGED));
  };

  if (!desk) return <div className="p-4 text-sm text-slate-400">{err || 'Loading your desk…'}</div>;
  const steps = desk.groups.reduce((n, g) => n + (g.key === 'SNOOZED' || g.key === 'PAUSED' ? 0 : g.items.length), 0);
  const quiet = steps === 0 && desk.drafts.length === 0 && checkIns.length === 0 && !notesToFinish && !desk.meetings?.length && !desk.noOwner?.length
    && !desk.reviews?.length && !desk.pool?.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      <h1 className="text-lg font-semibold text-slate-800">My Desk</h1>
      <p className="text-xs text-slate-500 mb-4">Everything waiting on you: reminders, emails to review, check-ins and notes to finish.</p>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <QuickNote onPublished={() => changed()} />
      {flash && <p className="text-sm text-emerald-700 mb-3">{flash}</p>}
      {quiet && <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 p-6 text-center">Nothing waiting on you. Nice.</p>}

      {notesToFinish > 0 && (
        <Link href="/crm/notes?status=mine" className="block mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {notesToFinish} meeting {notesToFinish === 1 ? 'note' : 'notes'} to finish. Tap to write {notesToFinish === 1 ? 'it' : 'them'} up.
        </Link>
      )}

      {desk.meetings?.length > 0 && (
        <Section title="Met someone not in the system" count={desk.meetings.length}>
          <ul className="space-y-2">{desk.meetings.map(m => <MeetingRow key={m.id} m={m} onDone={changed} />)}</ul>
        </Section>
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
          <p className="text-xs text-slate-400 mb-2">Nothing sends on its own. Edit, copy, or dismiss. Check-in emails are written the day before each one comes due.</p>
          <div className="space-y-2">
            {desk.drafts.map(d => (
              <div key={d.id} id={`draft-${d.id}`} className="scroll-mt-4">
              <DraftCard draft={d} currentUserId={desk.userId}
                onCancel={id => setDesk(s => ({ ...s, drafts: s.drafts.filter(x => x.id !== id) }))}
                onUpdate={nd => setDesk(s => ({ ...s, drafts: s.drafts.map(x => (x.id === nd.id ? { ...x, ...nd } : x)) }))} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {checkIns.length > 0 && (
        <Section title="Check-ins due" count={checkIns.length}
          right={<Link href="/sales/check-ins" className="text-xs text-slate-400 hover:underline">All check-ins</Link>}>
          <ul className="space-y-2">
            {checkIns.slice(0, 10).map(c => <CheckInRow key={c.id} c={c} draft={desk.drafts.find(d => d.contactId === c.id)}
              onSnoozed={id => { setCheckIns(l => l.filter(x => x.id !== id)); load(); }}
              onWritten={async id => { await load(); window.dispatchEvent(new Event(DESK_CHANGED)); setTimeout(() => document.getElementById(`draft-${id}`)?.scrollIntoView({ behavior: 'smooth' }), 100); }} />)}
          </ul>
        </Section>
      )}

      {desk.reviews?.length > 0 && (
        <Section id="look-alikes" title="Same person? Same company? Same job?" count={desk.reviews.length}>
          <p className="text-xs text-slate-400 mb-2">A web budget looks like one we already have. Nothing is joined or made until somebody answers.</p>
          <ul className="space-y-2">{desk.reviews.map(r => <ReviewRow key={r.id} r={r} onDone={changed} />)}</ul>
        </Section>
      )}

      {desk.pool?.length > 0 && (
        <Section id="pool" title="Web budgets with no salesperson" count={desk.pool.length}>
          <p className="text-xs text-slate-400 mb-2">Made from the website. Take one, or give it to someone in Sales.</p>
          <ul className="space-y-2">{desk.pool.map(p => <PoolRow key={p.id} p={p} salesPeople={desk.salesPeople || []} myId={desk.userId} onDone={changed} />)}</ul>
        </Section>
      )}

      {desk.noOwner?.length > 0 && (
        <Section title="Nobody looks after these people" count={desk.noOwner.length}>
          <p className="text-xs text-slate-400 mb-2">Their check-in is due, but no company owner and no one who met them, so no email gets written. Take them and it lands on your desk.</p>
          <ul className="space-y-2">{desk.noOwner.slice(0, 10).map(c => <NoOwnerRow key={c.id} c={c} onDone={changed} />)}</ul>
        </Section>
      )}
    </div>
  );
}
