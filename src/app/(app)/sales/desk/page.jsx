'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import DraftCard from '@/components/sales/DraftCard';
import SnoozeBox from '@/components/sales/SnoozeBox';
import { DESK_CHANGED } from '@/lib/desk/desk';
import { groupStepsByPerson } from '@/lib/desk/groupByPerson';
import { useDraftReminder } from '@/components/layout/useDraftReminder';
import QuickNote from '@/components/desk/QuickNote';
import MorningBriefing from '@/components/desk/MorningBriefing';
import PersonPicker from '@/components/desk/PersonPicker';
import { ReviewRow } from '@/components/crm/LookAlikeReviews';
import CrmDuplicates from '@/components/crm/CrmDuplicates';
import AlertMark from '@/components/ui/AlertMark';
import IntelClient from '../../crm/intel/IntelClient';
import IntroductionsCard from '@/components/crm/IntroductionsCard';
import FieldSuggestionsCard from '@/components/crm/FieldSuggestionsCard';
import { FilterToolbar, FilterPanel, countFilters } from '@/components/ui/FilterPanel';
import { SortSelect, sortRows } from '@/components/ui/SortHeader';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import CompareBudgetsTable from '@/components/intake/CompareBudgetsTable';
import { MAX_COMPARE } from '@/lib/intake/compareBudgets';
import { useUrlView } from '@/lib/useUrlView';
import { BTN_PRIMARY, CARD, INPUT, TAB_ACTIVE, TAB_INACTIVE, H1 } from '@/components/ui/tokens';

// My Desk (Mike 9-26): the one place a salesperson looks. Reminders from their
// sales notes, email drafts to review, check-ins due, notes still to finish.
// Built for a phone first: one column, big buttons.
// 10-5: three tabs (To-dos, Intel, Look-alikes and pool), a "whose desk"
// picker, and steps for one person inside a week bundled under one header.

const TABS = [
  { key: 'todos', label: 'To-dos' },
  { key: 'intel', label: 'Intel' },
  { key: 'pool',  label: 'Look-alikes and pool' },
];
const HASH_TABS = { '#look-alikes': 'pool', '#pool': 'pool' };
const BUNDLED = new Set(['OVERDUE', 'TODAY', 'WEEK', 'LATER']);
const LOCKED_TITLE = 'Only the owner can change this';

// Whose desk and the step sort live in the address (useUrlView); the tab keeps
// its own search param. Whose drives the server fetch.
const FILTER_FIELDS = [{ key: 'whose', label: 'Whose desk', kind: 'pick' }];
const SORT_FIELDS = [
  { key: 'due',   label: 'Due date' },
  { key: 'who',   label: 'Person' },
  { key: 'label', label: 'Kind' },
];
const VIEW_FIELDS = [...FILTER_FIELDS, ...SORT_FIELDS.map(f => ({ key: f.key, kind: 'sort' }))];
const SORT_DEFAULT = { key: '', dir: 'asc' };
const STEP_GETTERS = {
  due:   a => { const d = a.snoozedUntil || a.remindAt || a.dueDate; return d ? new Date(d).getTime() : null; },
  who:   a => a.who || '',
  label: a => a.label || '',
};
const ROW = `${CARD} p-3`;



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

function Btn({ children, onClick, tone = 'plain', disabled, title }) {
  const cls = {
    plain: 'border border-slate-200 text-slate-600 bg-white hover:bg-slate-50',
    go:    'bg-green-600 text-white hover:bg-green-700',
    warn:  'border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100',
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`min-h-[40px] px-3 rounded-lg text-sm font-semibold disabled:opacity-40 ${cls}`}>{children}</button>
  );
}

function OwnerChip({ name }) {
  if (!name) return null;
  return <span className="inline-block rounded-lg bg-slate-100 text-slate-600 text-xs px-2 py-0.5 ml-1">{name}</span>;
}

// `locked` = somebody else's step: look, do not touch (the server refuses too).
function StepRow({ a, group, onAct, locked = false, showOwner = false, indent = false }) {
  const [snoozing, setSnoozing] = useState(false);
  const [busy, setBusy] = useState(false);
  async function act(body) {
    setBusy(true);
    await onAct(a.id, body);
    setBusy(false);
    setSnoozing(false);
  }
  const due = group === 'SNOOZED' ? a.snoozedUntil : (a.remindAt || a.dueDate);
  const off = busy || locked;
  const title = locked ? LOCKED_TITLE : undefined;
  return (
    <li className={`${ROW} ${indent ? 'ml-4' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800">{a.detail || a.rawText}{showOwner && <OwnerChip name={a.ownerName} />}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {a.who && (a.clientId ? <Link href={`/clients/${a.clientId}`} className="hover:underline">{a.who}</Link> : a.who)}
            {a.who && ' · '}{a.label}
            {a.note && <> · <Link href={`/crm/notes?note=${a.note.id}`} className="hover:underline">{a.note.title || 'note'}</Link></>}
          </p>
        </div>
        <span className={`shrink-0 text-xs tabular-nums ${group === 'OVERDUE' ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
          {group === 'SNOOZED' ? `Until ${when(due)}` : group === 'PAUSED' ? 'Paused' : when(due)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Btn tone="go" disabled={off} title={title} onClick={() => act({ do: 'done' })}>Done</Btn>
        {group === 'SNOOZED'
          ? <Btn disabled={off} title={title} onClick={() => act({ do: 'unsnooze' })}>Wake up now</Btn>
          : group !== 'PAUSED' && <Btn disabled={off} title={title} onClick={() => setSnoozing(s => !s)}>Snooze</Btn>}
        {group === 'PAUSED'
          ? <Btn tone="warn" disabled={off} title={title} onClick={() => act({ do: 'resume' })}>Turn back on</Btn>
          : <Btn disabled={off} title={title} onClick={() => act({ do: 'pause' })}>Pause</Btn>}
      </div>
      {snoozing && !locked && <SnoozeBox busy={busy} onPick={pick => act({ do: 'snooze', ...pick })} onClose={() => setSnoozing(false)} />}
    </li>
  );
}

// One desk group's rows, bundled by person (10-5): 2+ steps for one person
// inside a rolling week sit under one header with the alert mark.
function GroupRows({ items, group, onAct, isLocked, showOwner, sort }) {
  const sorted = useMemo(() => sortRows(items, sort, STEP_GETTERS), [items, sort]);
  const bundles = BUNDLED.has(group) ? groupStepsByPerson(sorted, { now: new Date() }) : sorted.map(a => ({ key: a.id, items: [a], alert: false }));
  return (
    <ul className="space-y-2">
      {bundles.map(b => b.items.length > 1 ? (
        <li key={b.key} className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <AlertMark label={`${b.items.length} steps for ${b.who || 'this person'} this week`} />
            <span>{b.who || 'Someone'} ({b.items.length} steps this week)</span>
          </div>
          <ul className="space-y-2">
            {b.items.map(a => <StepRow key={a.id} a={a} group={group} onAct={onAct} locked={isLocked(a)} showOwner={showOwner} indent />)}
          </ul>
        </li>
      ) : (
        <StepRow key={b.items[0].id} a={b.items[0]} group={group} onAct={onAct} locked={isLocked(b.items[0])} showOwner={showOwner} />
      ))}
    </ul>
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
    <li className={ROW}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800">{c.preferredName || c.name}</p>
          <p className="text-xs text-slate-500">{c.client?.name || c.company || ''}</p>
        </div>
        <span className="shrink-0 text-xs text-red-600 font-semibold tabular-nums">{c.daysOverdue} days over</span>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {draft
          ? <Btn tone="go" onClick={jump}>Email ready</Btn>
          : c.email && <Btn tone="go" disabled={writing} onClick={write}>{writing ? 'Writing…' : 'Write email'}</Btn>}
        {c.client?.id && <Link href={`/clients/${c.client.id}`} className="min-h-[40px] px-3 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 inline-flex items-center">Open</Link>}
        <Btn onClick={() => setSnoozing(s => !s)}>Snooze</Btn>
      </div>
      {snoozing && <SnoozeBox onPick={snooze} onClose={() => setSnoozing(false)} />}
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
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
    <li className="rounded-lg border border-amber-200 bg-white shadow-sm p-3">
      <div className="text-sm font-semibold text-slate-800">{m.title || 'In-person meeting'}</div>
      <div className="text-xs text-slate-500 mb-2">{when(m.meetingDate)}{m.isPublished ? '' : ' · note not published yet'}</div>
      {m.unknown.map(g => (
        <div key={g.email} className="mb-2">
          <p className="text-sm text-slate-600"><b>{g.name}</b> <span className="text-slate-500">{g.email}</span> is not in the system. Add them so the follow-up email can be written.</p>
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
      {err && <p className="text-sm text-red-600">{err}</p>}
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
    <li className={`${ROW} flex flex-wrap items-center gap-2`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-800">{c.name}</div>
        <div className="text-xs text-slate-500">{[c.company, `check-in ${when(c.due).toLowerCase()}`, c.email ? '' : 'no email on file'].filter(Boolean).join(' · ')}</div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
      <Btn tone="go" disabled={busy} onClick={take}>Take them</Btn>
      {c.clientId && <Link href={`/clients/${c.clientId}`} className="min-h-[40px] px-3 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 inline-flex items-center">Open</Link>}
    </li>
  );
}

// A web budget project no salesperson has yet (0117): take it or give it to someone in Sales.
function PoolRow({ p, salesPeople, myId, onDone, picked, full, onPick }) {
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
    <li className={`${ROW} flex flex-wrap items-center gap-2`}>
      <div className="min-w-0 flex-1">
        <Link href={`/project/${p.id}`} className="text-sm font-semibold text-slate-800 hover:underline">
          {p.name}{p.conceptualDraft?.budgetName ? <span className="font-normal text-slate-500">, {p.conceptualDraft.budgetName}</span> : null}
        </Link>
        {p.conceptualDraft?.copiedFromId && (
          <span className="ml-2 inline-block rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600" title="Made in the company portal as a copy of an earlier budget">copy of an earlier budget</span>
        )}
        <div className="text-xs text-slate-500">
          {[p.budgetNumber, [p.city, p.state].filter(Boolean).join(', '), p.client?.name, p.contactName, `made ${new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`].filter(Boolean).join(' · ')}
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
      <Btn tone="go" disabled={busy} onClick={() => give(null)}>Take it</Btn>
      {salesPeople.length > 0 && (
        <select disabled={busy} value="" onChange={e => e.target.value && give(e.target.value)}
          className={`${INPUT} w-auto min-h-[40px] px-2`}>
          <option value="">Give to...</option>
          {salesPeople.filter(u => u.id !== myId).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
      {p.conceptualDraft?.id && (
        <label className={`inline-flex items-center gap-2 text-sm ${!picked && full ? 'text-slate-400' : 'text-slate-700 cursor-pointer'}`}>
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            checked={picked} disabled={!picked && full} onChange={() => onPick(p.conceptualDraft.id)} />
          Compare
        </label>
      )}
    </li>
  );
}

// The pool list with Compare (Mike 10-18): tick two or three, then Compare.
function PoolList({ pool, salesPeople, myId, onDone }) {
  const [picked, setPicked] = useState([]);
  const [compare, setCompare] = useState(null); // { loading, body }
  const [err, setErr] = useState('');
  const onPick = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id]));
  async function run() {
    setCompare({ loading: true, body: null }); setErr('');
    try { setCompare({ loading: false, body: await post('/api/sales/desk/pool/compare', { draftIds: picked }) }); }
    catch (e) { setCompare(null); setErr(e.message); }
  }
  return (
    <>
      {compare && (
        <div className={`${CARD} p-4 mb-3`}>
          {compare.loading && <WidgetLoading />}
          {compare.body && <CompareBudgetsTable body={compare.body} onClose={() => setCompare(null)} />}
        </div>
      )}
      {picked.length > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm shadow-sm">
          <span className="text-slate-800">{picked.length} of {MAX_COMPARE} picked{picked.length < 2 ? ', pick one more to compare' : ''}.</span>
          <button type="button" className={BTN_PRIMARY} disabled={picked.length < 2 || compare?.loading} onClick={run}>
            {compare?.loading ? 'Comparing...' : `Compare ${picked.length} budgets`}
          </button>
          <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline" onClick={() => setPicked([])}>Clear</button>
        </div>
      )}
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      <ul className="space-y-2">
        {pool.map(p => (
          <PoolRow key={p.id} p={p} salesPeople={salesPeople} myId={myId} onDone={onDone}
            picked={picked.includes(p.conceptualDraft?.id)} full={picked.length >= MAX_COMPARE} onPick={onPick} />
        ))}
      </ul>
    </>
  );
}

function Section({ title, count, children, right, id }) {
  return (
    <section id={id} className="mb-6 scroll-mt-4">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {count != null && <span className="text-xs text-slate-500 tabular-nums">{count}</span>}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </section>
  );
}

function TabBar({ tab, onPick, counts }) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 mb-4">
      {/* Same look as the Sales Automation tabs (Mike 10-6). */}
      {TABS.map(t => (
        <button key={t.key} type="button" onClick={() => onPick(t.key)}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.key ? TAB_ACTIVE : TAB_INACTIVE}`}>
          {t.label}{counts?.[t.key] > 0 && <span className="ml-1 text-xs text-slate-500 tabular-nums">{counts[t.key]}</span>}
        </button>
      ))}
    </div>
  );
}

// Whose desk (10-5): mine, everyone's, or one salesperson's. Others' desks are look-only.
function WhosePicker({ whose, salesPeople, filters, filterCount, open, onToggle, onClear, onChange, sort, onSort, steps }) {
  const choices = { whose: [['mine', 'Mine'], ['everyone', 'Everyone'], ...salesPeople.map(u => [u.id, u.name])] };
  return (
    <div className="mb-3">
      <FilterToolbar count={filterCount} open={open} onToggle={onToggle} onClear={onClear}
        shown={steps} total={steps} noun="steps"
        right={<SortSelect fields={SORT_FIELDS} sort={sort} onChange={onSort} />}>
        {filterCount === 0 && <span className="text-xs text-slate-500">My desk</span>}
      </FilterToolbar>
      <FilterPanel open={open} fields={FILTER_FIELDS} filters={{ ...filters, whose }} choices={choices} onChange={onChange} />
    </div>
  );
}

export default function MyDeskPageShell() {
  return (
    <Suspense fallback={<WidgetLoading />}>
      <MyDeskPage />
    </Suspense>
  );
}

function MyDeskPage() {
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : 'todos';
  const [tab, setTabState] = useState(urlTab);
  const { filters, setFilter, clearFilters, sort, setSort, ready } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [filterOpen, setFilterOpen] = useState(false);
  const [dupeCount, setDupeCount] = useState(0);
  const whose = filters.whose || 'mine';
  const [desk, setDesk] = useState(null);
  const [checkIns, setCheckIns] = useState([]);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const [openGroups, setOpenGroups] = useState({ SNOOZED: false, PAUSED: false });
  const { count: notesToFinish } = useDraftReminder() || {};

  useEffect(() => { setTabState(urlTab); }, [urlTab]);
  // Old links to /sales/desk#look-alikes and #pool still land on that section.
  useEffect(() => {
    const fromHash = () => { const t = HASH_TABS[window.location.hash]; if (t) setTabState(t); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);
  useEffect(() => {
    if (!desk || tab !== 'pool') return;
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [desk, tab]);

  const setTab = key => {
    setTabState(key);
    router.replace(key === 'todos' ? '/sales/desk' : `/sales/desk?tab=${key}`, { scroll: false });
  };

  // A briefing line points at a section on this tab ("#drafts") or another tab ("tab:pool").
  const goTo = go => {
    if (!go) return;
    if (go.startsWith('tab:')) { setTab(go.slice(4)); return; }
    document.getElementById(go.replace(/^#/, ''))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const load = useCallback(async () => {
    try {
      const q = whose === 'everyone' ? '?scope=everyone' : whose !== 'mine' ? `?user=${encodeURIComponent(whose)}` : '';
      const res = await fetch(`/api/sales/desk${q}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      setDesk(d);
      setErr('');
    } catch (e) { setErr(e.message); }
    fetch('/api/crm/contacts/check-ins-due?status=overdue').then(r => r.json())
      .then(d => setCheckIns(d.contacts || [])).catch(() => {});
  }, [whose]);
  useEffect(() => { if (ready) load(); }, [ready, load]);

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
  // The two cards call onChange(count) after every load of their own. It must
  // keep one identity: a new function each render made them reload, which
  // reloaded the desk, which rendered again, forever (10-23).
  const cardChanged = useCallback(() => {
    load();
    window.dispatchEvent(new Event(DESK_CHANGED));
  }, [load]);

  if (!desk) return err ? <p className="p-4 text-sm text-red-600">{err}</p> : <WidgetLoading />;
  const myId = desk.viewerId || desk.userId;
  const everyone = desk.scope === 'everyone';
  const lookOnly = !everyone && desk.userId !== myId;
  // Mine: my own desk, or in "Everyone" the rows tagged with my id. Anything else is look-only.
  const isLocked = a => (everyone ? a.ownerId !== myId : lookOnly);
  const steps = desk.groups.reduce((n, g) => n + (g.key === 'SNOOZED' || g.key === 'PAUSED' ? 0 : g.items.length), 0);
  const quiet = steps === 0 && desk.drafts.length === 0 && checkIns.length === 0 && !notesToFinish && !desk.meetings?.length && !desk.noOwner?.length
    && !desk.budgetsNotSent?.length;
  const poolCount = (desk.reviews?.length || 0) + (desk.pool?.length || 0) + dupeCount;

  return (
    <div className="px-4 py-5">
      {/* Tab line starts at the left edge like every other page (Mike 10-6); the content stays centered. */}
      <TabBar tab={tab} onPick={setTab} counts={{ pool: poolCount }} />
      <div className="max-w-2xl mx-auto">
      <h1 className={H1}>My Desk</h1>
      <p className="text-xs text-slate-500 mb-4">Everything waiting on you: reminders, emails to review, check-ins and notes to finish.</p>

      {tab === 'intel' && <IntelClient />}

      {tab === 'pool' && (
        <>
          {desk.reviews?.length > 0 && (
            <Section id="look-alikes" title="Same person? Same company? Same job?" count={desk.reviews.length}>
              <p className="text-xs text-slate-500 mb-2">A web budget looks like one we already have. Nothing is joined or made until somebody answers.</p>
              <ul className="space-y-2">{desk.reviews.map(r => <ReviewRow key={r.id} r={r} onDone={changed} />)}</ul>
            </Section>
          )}
          {desk.pool?.length > 0 && (
            <Section id="pool" title="Web budgets with no salesperson" count={desk.pool.length}>
              <p className="text-xs text-slate-500 mb-2">Made from the website. Take one, or give it to someone in Sales. Tick Compare on two or three to see them side by side.</p>
              <PoolList pool={desk.pool} salesPeople={desk.salesPeople || []} myId={myId} onDone={changed} />
            </Section>
          )}
          <CrmDuplicates onCount={setDupeCount} />
          {poolCount === 0 && <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 p-6 text-center">No look-alikes to answer and no web budgets waiting for a salesperson.</p>}
        </>
      )}

      {tab === 'todos' && (<>
      <WhosePicker whose={whose} salesPeople={desk.salesPeople || []} filters={filters} filterCount={countFilters(filters, FILTER_FIELDS)}
        open={filterOpen} onToggle={() => setFilterOpen(o => !o)} onClear={clearFilters} onChange={setFilter} sort={sort} onSort={setSort} steps={steps} />
      {lookOnly && <p className="text-xs text-slate-500 mb-3">You are looking at {desk.ownerName || 'someone else'}&apos;s desk. Only the owner can change these.</p>}
      {!lookOnly && !everyone && <MorningBriefing onGo={goTo} />}
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {!lookOnly && <QuickNote onPublished={() => changed()} />}
      {flash && <p className="text-sm text-green-700 mb-3">{flash}</p>}
      {quiet && <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 p-6 text-center">{lookOnly || everyone ? 'Nothing waiting here. Nice.' : 'Nothing waiting on you. Nice.'}</p>}

      {desk.budgetsNotSent?.length > 0 && (
        <Section id="budgets-not-sent" title="Budgets made, not sent" count={desk.budgetsNotSent.length}>
          <p className="text-xs text-slate-500 mb-2">A budget figure is on file but no sent date. Send it, or set the date on the project.</p>
          <ul className="space-y-2">
            {desk.budgetsNotSent.map(p => (
              <li key={p.id} className={`${ROW} flex items-center gap-2`}>
                <AlertMark label="Budget made, not sent" />
                <div className="min-w-0 flex-1">
                  <Link href={`/project/${p.id}`} className="text-sm font-semibold text-slate-800 hover:underline">
          {p.name}{p.conceptualDraft?.budgetName ? <span className="font-normal text-slate-500">, {p.conceptualDraft.budgetName}</span> : null}
        </Link>
                  <div className="text-xs text-slate-500">{[p.budgetNumber, p.client?.name].filter(Boolean).join(' · ')}</div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!lookOnly && !everyone && (
        <>
          <IntroductionsCard title="New people introduced to us" limit={10} onChange={cardChanged} />
          <FieldSuggestionsCard title="Email signatures say" limit={10} onChange={cardChanged} />
        </>
      )}

      {notesToFinish > 0 && !lookOnly && (
        <Link href="/crm/notes?status=mine" className="block mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {notesToFinish} meeting {notesToFinish === 1 ? 'note' : 'notes'} to finish. Tap to write {notesToFinish === 1 ? 'it' : 'them'} up.
        </Link>
      )}

      {desk.meetings?.length > 0 && (
        <Section id="new-people" title="Met someone not in the system" count={desk.meetings.length}>
          <ul className="space-y-2">{desk.meetings.map(m => <MeetingRow key={m.id} m={m} onDone={changed} />)}</ul>
        </Section>
      )}

      {desk.groups.map(g => {
        const folded = (g.key === 'SNOOZED' || g.key === 'PAUSED') && !openGroups[g.key];
        return (
          <Section key={g.key} id={`group-${g.key}`} title={g.label} count={g.items.length}
            right={(g.key === 'SNOOZED' || g.key === 'PAUSED') && (
              <button type="button" onClick={() => setOpenGroups(o => ({ ...o, [g.key]: !o[g.key] }))} className="text-xs font-semibold text-slate-600 hover:underline">
                {folded ? 'Show' : 'Hide'}
              </button>
            )}>
            {!folded && <GroupRows items={g.items} group={g.key} onAct={act} isLocked={isLocked} showOwner={everyone} sort={sort} />}
          </Section>
        );
      })}

      {desk.drafts.length > 0 && (
        <Section id="drafts" title="Emails to review" count={desk.drafts.length}>
          <p className="text-xs text-slate-500 mb-2">Nothing sends on its own. Edit, copy, or dismiss. Check-in emails are written the day before each one comes due.</p>
          <div className="space-y-2">
            {desk.drafts.map(d => (
              <div key={d.id} id={`draft-${d.id}`} className="scroll-mt-4">
              {everyone && d.ownerName && <p className="text-xs text-slate-500 mb-1">On {d.ownerName}&apos;s desk</p>}
              <DraftCard draft={d} currentUserId={myId}
                onCancel={id => setDesk(s => ({ ...s, drafts: s.drafts.filter(x => x.id !== id) }))}
                onUpdate={nd => setDesk(s => ({ ...s, drafts: s.drafts.map(x => (x.id === nd.id ? { ...x, ...nd } : x)) }))} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {checkIns.length > 0 && !lookOnly && (
        <Section id="check-ins" title="Check-ins due" count={checkIns.length}
          right={<Link href="/sales/check-ins" className="text-xs font-semibold text-slate-600 hover:underline">All check-ins</Link>}>
          <ul className="space-y-2">
            {checkIns.slice(0, 10).map(c => <CheckInRow key={c.id} c={c} draft={desk.drafts.find(d => d.contactId === c.id)}
              onSnoozed={id => { setCheckIns(l => l.filter(x => x.id !== id)); load(); }}
              onWritten={async id => { await load(); window.dispatchEvent(new Event(DESK_CHANGED)); setTimeout(() => document.getElementById(`draft-${id}`)?.scrollIntoView({ behavior: 'smooth' }), 100); }} />)}
          </ul>
        </Section>
      )}

      {desk.noOwner?.length > 0 && (
        <Section title="Nobody looks after these people" count={desk.noOwner.length}>
          <p className="text-xs text-slate-500 mb-2">Their check-in is due, but no company owner and no one who met them, so no email gets written. Take them and it lands on your desk.</p>
          <ul className="space-y-2">{desk.noOwner.slice(0, 10).map(c => <NoOwnerRow key={c.id} c={c} onDone={changed} />)}</ul>
        </Section>
      )}
      </>)}
      </div>
    </div>
  );
}
