'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import PersonPicker from '@/components/desk/PersonPicker';
import SnoozeBox from '@/components/sales/SnoozeBox';
import AlertMark from '@/components/ui/AlertMark';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { DESK_CHANGED, snoozeUntil } from '@/lib/desk/desk';
import { groupStepsByPerson } from '@/lib/desk/groupByPerson';
import {
  NOTE_TASK_TAG, TASK_STATUSES, dayOf, dueLabel, filterTasks, groupByStatus, listGroups, localDay, taskOverdue,
} from '@/lib/desk/tasks';
import { useUrlView } from '@/lib/useUrlView';
import { BTN_COMPACT, BTN_COMPACT_PRIMARY, CARD, INPUT, LABEL } from '@/components/ui/tokens';

// Tasks on My Desk (Mike 11-1): one list of tasks, from sales notes or made by
// hand, as a list or a board. Each task connects to companies, people and
// projects separately and carries custom tags. Whose tasks comes from the desk
// filter. RecordTasks reuses the card and the form on company and project pages.

const FILTER_FIELDS = [
  { key: 'status', label: 'Status', kind: 'pick' },
  { key: 'tag', label: 'Tag', kind: 'pick' },
  { key: 'source', label: 'Came from', kind: 'pick' },
];
const VIEW_FIELDS = [...FILTER_FIELDS, { key: 'q', kind: 'text' }, { key: 'view', kind: 'pick' }];
const SOURCES = [['note', 'Sales notes'], ['mine', 'Made by hand']];
const BUNDLED = new Set(['OVERDUE', 'TODAY', 'WEEK', 'LATER']);
const FOLDED = new Set(['SNOOZED', 'PAUSED', 'DONE']);
const CHIP = 'inline-flex items-center gap-1 max-w-full rounded-full px-2 py-0.5 text-[11px] font-medium';
const TAG_CHIP = `${CHIP} bg-orange-50 text-orange-700 border border-orange-200`;
const LINK_CHIP = `${CHIP} bg-slate-100 text-slate-700 hover:bg-slate-200`;
const FIELD = `${INPUT} max-sm:text-base`;

const failed = (what, status) => `${what} Nothing was saved. Check your connection and try again. (code ${status || 'no answer'})`;

async function send(url, method, body) {
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await r.json().catch(() => ({}));
    return r.ok ? { out } : { error: out.error || failed('The server could not save that.', r.status) };
  } catch {
    return { error: failed('The app could not reach the server.') };
  }
}

/** Done, snooze, pause and move, shared by the desk and the company and project pages. `after` reloads. */
export function useTaskActions(setData, setErr, after) {
  const move = async (task, status) => {
    if (status === task.status) return;
    setData(d => ({ ...d, tasks: d.tasks.map(t => (t.id === task.id ? { ...t, status, doneAt: status === 'DONE' ? new Date().toISOString() : null } : t)) }));
    const { error } = await send(`/api/sales/tasks/${task.id}`, 'PATCH', { status });
    setErr(error || '');
    after();
  };
  const step = async (task, body) => {
    const { error } = await send(`/api/sales/desk/${task.stepId}`, 'PATCH', body);
    setErr(error || '');
    after();
  };
  // A note task keeps its own snooze. A task made by hand just moves its due date.
  const snooze = async (task, pick) => {
    if (task.stepId) return step(task, { do: 'snooze', ...pick });
    const until = snoozeUntil(pick);
    if (!until) { setErr('That date did not work. Nothing was saved. Pick a day after today.'); return; }
    const { error } = await send(`/api/sales/tasks/${task.id}`, 'PATCH', { dueDate: dayOf(until) });
    setErr(error || '');
    after();
  };
  return { onMove: move, onStep: step, onSnooze: snooze };
}

function Chips({ task }) {
  const chips = [
    ...task.clients.map(c => <Link key={`c${c.id}`} href={`/clients/${c.id}`} className={LINK_CHIP}><span className="truncate">{c.name}</span></Link>),
    ...task.contacts.map(c => (c.clientId
      ? <Link key={`p${c.id}`} href={`/clients/${c.clientId}`} className={LINK_CHIP}><span className="truncate">{c.name}</span></Link>
      : <span key={`p${c.id}`} className={LINK_CHIP}><span className="truncate">{c.name}</span></span>)),
    ...task.projects.map(p => <Link key={`j${p.id}`} href={`/project/${p.id}`} className={LINK_CHIP}><span className="truncate">{p.name}</span></Link>),
    ...task.tags.map(t => <span key={`t${t.id}`} className={TAG_CHIP}><span className="truncate">{t.name}</span></span>),
  ];
  return chips.length ? <div className="flex flex-wrap gap-1 mt-1.5 min-w-0">{chips}</div> : null;
}

function StatusPick({ task, onMove }) {
  return (
    <select aria-label="Status" value={task.status} disabled={!task.canChange} title={task.canChange ? undefined : 'Only the person this task sits with can change it'}
      onChange={e => onMove(task, e.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs max-sm:text-base text-slate-700 disabled:bg-slate-50 disabled:text-slate-400">
      {TASK_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  );
}

// Pause stops the reminders and the still waiting email, which only note tasks have.
function TaskActions({ task, actions }) {
  const [snoozing, setSnoozing] = useState(false);
  const { onMove, onStep, onSnooze } = actions;
  const live = task.canChange && task.status !== 'DONE';
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusPick task={task} onMove={onMove} />
        {live && <button type="button" className={BTN_COMPACT} onClick={() => onMove(task, 'DONE')}>Done</button>}
        {live && (task.snoozedUntil
          ? <button type="button" className={BTN_COMPACT} onClick={() => onStep(task, { do: 'unsnooze' })}>Wake up now</button>
          : !task.paused && <button type="button" className={BTN_COMPACT} onClick={() => setSnoozing(s => !s)}>Snooze</button>)}
        {live && task.stepId && (task.paused
          ? <button type="button" className={BTN_COMPACT} onClick={() => onStep(task, { do: 'resume' })}>Turn back on</button>
          : <button type="button" className={BTN_COMPACT} onClick={() => onStep(task, { do: 'pause' })}>Pause</button>)}
      </div>
      {snoozing && <SnoozeBox onPick={pick => { setSnoozing(false); onSnooze(task, pick); }} onClose={() => setSnoozing(false)} />}
    </>
  );
}

export function TaskCard({ task, onOpen, actions, draggable, onDragStart, onDragEnd, today }) {
  const late = taskOverdue(task, today);
  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
      className={`${CARD} p-3 min-w-0 ${draggable ? 'sm:cursor-grab' : ''}`}>
      <button type="button" onClick={() => onOpen(task)}
        className={`block w-full text-left text-sm font-semibold break-words hover:underline ${task.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
        {task.title}
      </button>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 min-w-0">
        {task.dueDate && (
          <span className={late ? 'inline-flex items-center gap-1 font-semibold text-red-700' : ''}>
            {late && <AlertMark />}{dueLabel(task.dueDate)}
          </span>
        )}
        {task.who && <span className="truncate">{task.who}</span>}
        {task.fromNote && <Link href={`/crm/notes?note=${task.fromNote.id}`} className="truncate hover:underline">{task.fromNote.title}</Link>}
        {task.snoozedUntil && <span>Snoozed to {dueLabel(task.snoozedUntil)}</span>}
        {task.paused && <span>Paused</span>}
      </div>
      <Chips task={task} />
      <TaskActions task={task} actions={actions} />
    </div>
  );
}

// 2+ tasks for one person inside a rolling week sit under one header with the alert mark.
function GroupCards({ group, ...card }) {
  if (!BUNDLED.has(group.key)) return group.tasks.map(t => <TaskCard key={t.id} task={t} {...card} />);
  const bundles = groupStepsByPerson(group.tasks.map(t => ({ ...t, contactId: t.contacts[0]?.id || null })));
  return bundles.map(b => {
    if (b.items.length < 2) return <TaskCard key={b.items[0].id} task={b.items[0]} {...card} />;
    const name = b.items[0].contacts[0]?.name || 'this person';
    return (
      <div key={b.key} className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <AlertMark label={`${b.items.length} tasks for ${name} this week`} />
          <span>{name} ({b.items.length} tasks this week)</span>
        </div>
        <div className="ml-4 space-y-2">{b.items.map(t => <TaskCard key={t.id} task={t} {...card} />)}</div>
      </div>
    );
  });
}

function ListView({ tasks, onOpen, actions, today }) {
  const [opened, setOpened] = useState({});
  const groups = useMemo(() => listGroups(tasks), [tasks]);
  return groups.map(g => {
    const foldable = FOLDED.has(g.key);
    const folded = foldable && !opened[g.key];
    return (
      <section key={g.key} id={`group-${g.key}`} className="mb-6 scroll-mt-4">
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-700">{g.label}</h2>
          <span className="text-xs text-slate-500 tabular-nums">{g.tasks.length}</span>
          {foldable && (
            <button type="button" className="ml-auto text-xs text-slate-500 hover:underline" aria-expanded={!folded}
              onClick={() => setOpened(o => ({ ...o, [g.key]: folded }))}>{folded ? 'Show' : 'Hide'}</button>
          )}
        </div>
        {!folded && <div className="space-y-2"><GroupCards group={g} onOpen={onOpen} actions={actions} today={today} /></div>}
      </section>
    );
  });
}

// Drag on a computer; on a phone the status box on each card does the same job.
function BoardView({ tasks, onOpen, actions, today }) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const columns = useMemo(() => groupByStatus(tasks), [tasks]);
  const drop = key => {
    const task = tasks.find(t => t.id === dragId);
    setDragId(null); setOver(null);
    if (task) actions.onMove(task, key);
  };
  return (
    <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible sm:snap-none">
      {columns.map(c => (
        <section key={c.key} aria-label={c.label}
          onDragOver={e => { if (dragId) { e.preventDefault(); setOver(c.key); } }}
          onDragLeave={() => setOver(o => (o === c.key ? null : o))}
          onDrop={e => { e.preventDefault(); drop(c.key); }}
          className={`shrink-0 w-[82vw] sm:w-auto min-w-0 snap-start rounded-xl border p-2 min-h-[12rem] ${over === c.key ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
          <h2 className="px-1 mb-2 text-xs font-semibold text-slate-600">
            {c.label} <span className="text-slate-400 tabular-nums">{c.tasks.length}</span>
          </h2>
          <div className="space-y-2">
            {c.tasks.map(t => (
              <TaskCard key={t.id} task={t} onOpen={onOpen} actions={actions} today={today} draggable={t.canChange}
                onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOver(null); }} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Picked({ rows, onRemove, locked }) {
  if (!rows.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-1.5">
      {rows.map(r => (
        <span key={r.id} className={LINK_CHIP}>
          <span className="truncate">{r.name}</span>
          {!locked && <button type="button" aria-label={`Remove ${r.name}`} onClick={() => onRemove(r.id)} className="px-1 font-bold text-slate-500 hover:text-slate-800">×</button>}
        </span>
      ))}
    </div>
  );
}

function RecordPicker({ kind, label, rows, onChange, locked }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setFound([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/sales/tasks/lookup?kind=${kind}&q=${encodeURIComponent(q.trim())}`);
        if (r.ok) setFound((await r.json()).rows || []);
      } catch { /* no signal: typing still works, search waits */ }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q, kind]);
  const pick = row => { onChange([...rows, { id: row.id, name: row.name }]); setQ(''); };
  const open = found.filter(f => !rows.some(r => r.id === f.id));
  return (
    <div>
      <p className={`${LABEL} mb-1`}>{label}</p>
      <Picked rows={rows} locked={locked} onRemove={id => onChange(rows.filter(r => r.id !== id))} />
      {!locked && <input type="search" className={FIELD} placeholder="Type to search" value={q} onChange={e => setQ(e.target.value)} />}
      {open.length > 0 && (
        <ul className="mt-1 rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-40 overflow-y-auto">
          {open.map(f => (
            <li key={f.id}>
              <button type="button" onClick={() => pick(f)} className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50">
                {f.name}{f.hint && <span className="ml-2 text-xs text-slate-500">{f.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Only a Sales Admin makes new tags. The sales note tag stays on a task from a note.
function TagPicker({ tags, picked, onChange, onAdded, locked, onError, canMake, stuckName }) {
  const [name, setName] = useState('');
  const has = id => picked.some(t => t.id === id);
  const toggle = t => onChange(has(t.id) ? picked.filter(x => x.id !== t.id) : [...picked, t]);
  const add = async () => {
    if (!name.trim()) return;
    const { out, error } = await send('/api/sales/task-tags', 'POST', { name });
    if (error) { onError(error); return; }
    onAdded(out.tag);
    if (!has(out.tag.id)) onChange([...picked, out.tag]);
    setName('');
  };
  const shown = locked ? picked : tags;
  return (
    <div>
      <p className={`${LABEL} mb-1`}>Tags</p>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {shown.map(t => (
          <button key={t.id} type="button" disabled={locked || t.name === stuckName} aria-pressed={has(t.id)} onClick={() => toggle(t)}
            className={has(t.id) ? TAG_CHIP : `${CHIP} border border-slate-200 text-slate-600 hover:bg-slate-50`}>
            {t.name}
          </button>
        ))}
      </div>
      {!locked && canMake && (
        <div className="flex gap-2">
          <input className={FIELD} placeholder="New tag" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <button type="button" className={BTN_COMPACT} onClick={add}>Add tag</button>
        </div>
      )}
    </div>
  );
}

export function TaskForm({ task, preset, tags, people, viewerId, startAssignee, canMakeTags, onClose, onSaved, onTagAdded }) {
  const isNew = !task;
  const fromNote = task?.fromNote;
  const locked = Boolean(task) && !task.canChange;
  const [form, setForm] = useState({
    title: task?.title || '',
    detail: task?.detail || '',
    dueDate: dayOf(task?.dueDate),
    assigneeId: isNew ? startAssignee || viewerId : task.assigneeId || '',
    clients: task?.clients || preset?.clients || [],
    contacts: task?.contacts || preset?.contacts || [],
    projects: task?.projects || preset?.projects || [],
    tags: task?.tags || [],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const choices = people.some(p => p.id === form.assigneeId) || !form.assigneeId
    ? people : [...people, { id: form.assigneeId, name: task?.who || 'Someone else' }];

  const save = async () => {
    setBusy(true); setErr('');
    const body = {
      title: form.title,
      detail: form.detail,
      dueDate: form.dueDate || null,
      clientIds: form.clients.map(x => x.id),
      contactIds: form.contacts.map(x => x.id),
      projectIds: form.projects.map(x => x.id),
      tagIds: form.tags.map(x => x.id),
      ...(fromNote ? {} : { assigneeId: form.assigneeId || null }),
    };
    const { error } = isNew ? await send('/api/sales/tasks', 'POST', body) : await send(`/api/sales/tasks/${task.id}`, 'PATCH', body);
    setBusy(false);
    if (error) { setErr(error); return; }
    onSaved();
  };
  const archive = async () => {
    if (!window.confirm('Archive this task? It leaves the list and the board.')) return;
    setBusy(true); setErr('');
    const { error } = await send(`/api/sales/tasks/${task.id}`, 'PATCH', { archive: true });
    setBusy(false);
    if (error) { setErr(error); return; }
    onSaved();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={isNew ? 'New task' : 'Task'}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 print:hidden"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-xl sm:rounded-xl bg-white p-4 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{isNew ? 'New task' : locked ? 'Task' : 'Edit task'}</h2>
        {fromNote && (
          <p className="text-xs text-slate-500">
            From <Link href={`/crm/notes?note=${fromNote.id}`} className="underline">{fromNote.title}</Link> ({fromNote.kind}).
            {!locked && ' A new title or due date here changes it on the note too.'}
          </p>
        )}
        {locked && <p className="text-xs text-slate-500">Only the person this task sits with can change it.</p>}
        <label className="block">
          <span className={`${LABEL} block mb-1`}>Title</span>
          <input className={FIELD} autoFocus={isNew} disabled={locked} value={form.title} onChange={e => set('title', e.target.value)} />
        </label>
        <label className="block">
          <span className={`${LABEL} block mb-1`}>Details</span>
          <textarea className={FIELD} rows={3} disabled={locked} value={form.detail} onChange={e => set('detail', e.target.value)} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className={`${LABEL} block mb-1`}>Due</span>
            <input type="date" className={FIELD} disabled={locked} value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
          </label>
          {fromNote ? (
            <div className="min-w-0">
              <p className={`${LABEL} mb-1`}>Assigned to</p>
              <p className="py-2 text-sm text-slate-700 break-words">{task.who || 'No one yet'}</p>
            </div>
          ) : (
            <label className="block min-w-0">
              <span className={`${LABEL} block mb-1`}>Assigned to</span>
              <select className={FIELD} disabled={locked} value={form.assigneeId} onChange={e => set('assigneeId', e.target.value)}>
                <option value="">No one yet</option>
                {choices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <RecordPicker kind="client" label="Companies" rows={form.clients} locked={locked} onChange={v => set('clients', v)} />
        <div>
          <p className={`${LABEL} mb-1`}>People</p>
          <Picked rows={form.contacts} locked={locked} onRemove={id => set('contacts', form.contacts.filter(c => c.id !== id))} />
          {!locked && <PersonPicker placeholder="Type a name" skipIds={form.contacts.map(c => c.id)} onPick={c => set('contacts', [...form.contacts, { id: c.id, name: c.name }])} />}
        </div>
        <RecordPicker kind="project" label="Projects" rows={form.projects} locked={locked} onChange={v => set('projects', v)} />
        <TagPicker tags={tags} picked={form.tags} locked={locked} canMake={canMakeTags} stuckName={fromNote ? NOTE_TASK_TAG : null}
          onChange={v => set('tags', v)} onAdded={onTagAdded} onError={setErr} />
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!locked && <button type="button" className={BTN_COMPACT_PRIMARY} disabled={busy} onClick={save}>{isNew ? 'Add task' : 'Save'}</button>}
          <button type="button" className={BTN_COMPACT} onClick={onClose}>{locked ? 'Close' : 'Cancel'}</button>
          {!isNew && !fromNote && !locked && <button type="button" className={`${BTN_COMPACT} ml-auto`} disabled={busy} onClick={archive}>Archive</button>}
        </div>
      </div>
    </div>
  );
}

export default function TasksTab({ whose = 'mine', onChanged }) {
  const { filters, setFilter, clearFilters, ready } = useUrlView({ fields: VIEW_FIELDS });
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // 'new' or a task
  const view = filters.view === 'board' ? 'board' : 'list';

  const load = useCallback(async () => {
    const q = whose === 'everyone' ? '?scope=everyone' : whose !== 'mine' ? `?user=${encodeURIComponent(whose)}` : '';
    try {
      const r = await fetch(`/api/sales/tasks${q}`);
      const out = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(out.error || `The server could not load the tasks. Nothing changed. Refresh the page to try again. (code ${r.status})`); return; }
      setData(out); setErr('');
    } catch {
      setErr('The app could not reach the server to load the tasks. Nothing changed. Check your connection and refresh the page.');
    }
  }, [whose]);
  useEffect(() => { if (ready) load(); }, [ready, load]);
  // The desk says when anything changed, a published note included.
  useEffect(() => {
    window.addEventListener(DESK_CHANGED, load);
    return () => window.removeEventListener(DESK_CHANGED, load);
  }, [load]);

  const after = () => onChanged?.();
  const actions = useTaskActions(setData, setErr, after);

  const today = localDay();
  const all = useMemo(() => data?.tasks || [], [data]);
  const shown = useMemo(() => filterTasks(all, { q: filters.q, status: filters.status, tag: filters.tag, source: filters.source }), [all, filters]);
  const tags = data?.tags || [];
  const people = data?.salesPeople || [];
  const choices = {
    status: TASK_STATUSES.map(s => [s.key, s.label]),
    tag: tags.map(t => [t.id, t.name]),
    source: SOURCES,
  };

  if (!data) return err ? <p role="alert" className="text-sm text-red-700">{err}</p> : <WidgetLoading />;

  return (
    <div className={view === 'board' ? '' : 'max-w-2xl mx-auto'}>
      {view === 'board' && ['OVERDUE', 'TODAY', 'WEEK'].map(k => <span key={k} id={`group-${k}`} />)}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="flex items-center gap-1" role="group" aria-label="Task view">
          {[['list', 'List'], ['board', 'Board']].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => setFilter('view', key === 'list' ? '' : key)}
              className={view === key ? BTN_COMPACT_PRIMARY : BTN_COMPACT}>{label}</button>
          ))}
        </div>
        <button type="button" className={`${BTN_COMPACT_PRIMARY} ml-auto`} onClick={() => setEditing('new')}>New task</button>
      </div>
      <FilterToolbar count={countFilters(filters, FILTER_FIELDS)} open={open} onToggle={() => setOpen(o => !o)} onClear={clearFilters}
        shown={shown.length} total={all.length} noun="tasks"
        right={<SearchBox value={filters.q} onChange={v => setFilter('q', v)} placeholder="Search tasks" />} />
      <FilterPanel open={open} fields={FILTER_FIELDS} filters={filters} choices={choices} onChange={setFilter} />
      {err && <p role="alert" className="mb-2 text-sm text-red-700">{err}</p>}
      {!all.length && <p className="py-8 text-center text-sm text-slate-500">No tasks yet. Tasks from your sales notes land here, or press New task.</p>}
      {all.length > 0 && !shown.length && <p className="py-8 text-center text-sm text-slate-500">No tasks match these filters.</p>}
      {shown.length > 0 && (
        <div className="mt-3">
          {view === 'board'
            ? <BoardView tasks={shown} onOpen={setEditing} actions={actions} today={today} />
            : <ListView tasks={shown} onOpen={setEditing} actions={actions} today={today} />}
        </div>
      )}
      {editing && (
        <TaskForm task={editing === 'new' ? null : editing} tags={tags} people={people} viewerId={data.viewerId} canMakeTags={data.canMakeTags}
          startAssignee={whose === 'mine' || whose === 'everyone' ? null : whose}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); after(); }}
          onTagAdded={t => setData(d => (d.tags.some(x => x.id === t.id) ? d : { ...d, tags: [...d.tags, t].sort((a, b) => a.name.localeCompare(b.name)) }))} />
      )}
    </div>
  );
}
