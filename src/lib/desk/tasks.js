/**
 * Sales tasks on My Desk (Mike 11-1), the rules. Safe in the browser; the
 * database half is `./tasksServer.js`.
 *
 * A task is either one a person made, or one row per sales note step. For a
 * step, the step stays the truth for wording, due date and done, so the desk,
 * reminders and the note can never disagree. Waiting is a fourth column because
 * steps already wait on other people.
 */
import { DESK_GROUPS, deskDue, deskGroup } from './desk.js';

export const TASK_STATUSES = [
  { key: 'TODO',    label: 'To do' },
  { key: 'DOING',   label: 'In progress' },
  { key: 'WAITING', label: 'Waiting' },
  { key: 'DONE',    label: 'Done' },
];
export const TASK_STATUS_KEYS = TASK_STATUSES.map(s => s.key);
export const DONE_SHOWN_DAYS = 30;
export const TITLE_MAX = 300;
export const DETAIL_MAX = 5000;
export const TAG_MAX = 40;

export const taskStatusLabel = key => TASK_STATUSES.find(s => s.key === key)?.label || key;

/** 'YYYY-MM-DD' to a Date at noon UTC, so the day reads the same in every US time zone. */
export function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

/** A stored date back to the 'YYYY-MM-DD' a date box wants. */
export function dayOf(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** The day this person's computer is on, as 'YYYY-MM-DD'. */
export function localDay(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function taskOverdue(task, today = localDay()) {
  const due = dayOf(task?.dueDate);
  return Boolean(due) && task.status !== 'DONE' && due < today;
}

export const dueLabel = value => {
  const day = dayOf(value);
  return day ? new Date(`${day}T12:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
};

const ids = list => (Array.isArray(list) ? [...new Set(list.filter(x => typeof x === 'string' && x))] : []);

/**
 * What a create or edit is allowed to change. Only fields that were sent come
 * back, so an edit of the title leaves everything else alone. Returns { data }
 * or { error } in plain words.
 */
export function cleanTaskInput(body = {}, { creating = false } = {}) {
  const data = {};
  if (creating || body.title !== undefined) {
    const title = String(body.title ?? '').trim();
    if (!title) return { error: 'Give the task a title.' };
    if (title.length > TITLE_MAX) return { error: `Keep the title under ${TITLE_MAX} characters.` };
    data.title = title;
  }
  if (body.detail !== undefined) {
    const detail = String(body.detail ?? '').trim();
    if (detail.length > DETAIL_MAX) return { error: `Keep the details under ${DETAIL_MAX} characters.` };
    data.detail = detail || null;
  }
  if (body.status !== undefined) {
    if (!TASK_STATUS_KEYS.includes(body.status)) return { error: 'That is not one of the task columns.' };
    data.status = body.status;
  }
  if (body.dueDate !== undefined) {
    const due = body.dueDate ? parseDay(body.dueDate) : null;
    if (body.dueDate && !due) return { error: 'That due date is not a real date.' };
    data.dueDate = due;
  }
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;
  for (const key of ['clientIds', 'contactIds', 'projectIds', 'tagIds']) {
    if (body[key] !== undefined) data[key] = ids(body[key]);
  }
  return { data };
}

export function cleanTagName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return { error: 'Type a name for the tag.' };
  if (name.length > TAG_MAX) return { error: `Keep tag names under ${TAG_MAX} characters.` };
  return { name };
}

/** A note step's words: its short line, or the line as written. */
export const stepTitle = step => step?.detail || step?.rawText || 'Sales note step';

export const stepIsDone = step => step?.status === 'DONE' || Boolean(step?.fulfilledAt);

/** The column. A finished step is Done whatever the row says; a reopened one is not. */
export function taskStatusOf(row, step) {
  if (!step) return row.status;
  if (stepIsDone(step)) return 'DONE';
  return row.status === 'DONE' ? 'TODO' : row.status;
}

export const taskDue = (row, step, now = new Date()) => (step ? deskDue(step, now) : row.dueDate ? new Date(row.dueDate) : null);

/** A step is changed by its note's owners; a person's own task by whoever it sits with. */
export function canChangeTask({ noteOwnerIds, assigneeId, createdById, isStep }, userId, isAdmin = false) {
  if (isAdmin) return true;
  if (isStep) return (noteOwnerIds || []).includes(userId);
  return assigneeId === userId || createdById === userId;
}

const dueTime = t => (t.dueDate ? new Date(t.dueDate).getTime() : Infinity);

/** Soonest first, no date last. Done lists the newest finished first. */
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if ((a.status === 'DONE') !== (b.status === 'DONE')) return a.status === 'DONE' ? 1 : -1;
    if (a.status === 'DONE') return new Date(b.doneAt || 0) - new Date(a.doneAt || 0);
    return dueTime(a) - dueTime(b) || a.title.localeCompare(b.title);
  });
}

const words = t => [
  t.title, t.detail, t.who, t.fromNote?.title,
  ...(t.clients || []).map(x => x.name), ...(t.contacts || []).map(x => x.name),
  ...(t.projects || []).map(x => x.name), ...(t.tags || []).map(x => x.name),
].filter(Boolean).join(' ').toLowerCase();

export function filterTasks(tasks, { q, status, tag, source } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  return tasks.filter(t => {
    if (status && t.status !== status) return false;
    if (tag && !(t.tags || []).some(x => x.id === tag)) return false;
    if (source === 'note' && !t.fromNote) return false;
    if (source === 'mine' && t.fromNote) return false;
    return !needle || words(t).includes(needle);
  });
}

export function groupByStatus(tasks) {
  const sorted = sortTasks(tasks);
  return TASK_STATUSES.map(s => ({ ...s, tasks: sorted.filter(t => t.status === s.key) }));
}

export const NOTE_TASK_TAG = 'In-person follow-up';
const NO_ONE = 'No one yet';

/** The list view's headings: the same ones the desk always had, then Done. */
export function listGroups(tasks, { now = new Date() } = {}) {
  const open = sortTasks(tasks.filter(t => t.status !== 'DONE'));
  const inGroup = t => deskGroup(
    { pausedAt: t.paused ? now : null, snoozedUntil: t.snoozedUntil, dueDate: t.dueDate },
    { waiting: t.status === 'WAITING', now },
  );
  return [
    ...DESK_GROUPS.map(g => ({ ...g, tasks: open.filter(t => inGroup(t) === g.key) })),
    { key: 'DONE', label: 'Done', tasks: sortTasks(tasks.filter(t => t.status === 'DONE')) },
  ].filter(g => g.tasks.length);
}

/** Sunday of the week `now` falls in, as a day string. Monday starts the week. */
export function weekEnd(now = new Date()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

/** The weekly meeting card: open tasks due by Sunday (late ones too), one row per person on the task, by salesperson then date. Paused tasks are left out. */
export function tasksDueByPerson(tasks, { now = new Date() } = {}) {
  const end = weekEnd(now);
  const today = localDay(now);
  const rows = tasks
    .filter(t => t.status !== 'DONE' && !t.paused && t.dueDate && dayOf(t.dueDate) <= end)
    .flatMap(t => (t.people.length ? t.people : [{ id: 'none', name: NO_ONE }]).map(p => ({
      id: `${t.id}-${p.id}`,
      taskId: t.id,
      salesperson: p.name || NO_ONE,
      title: t.title,
      dueDate: t.dueDate,
      overdue: taskOverdue(t, today),
      company: t.clients[0]?.name || '',
      project: t.projects[0]?.name || '',
      fromNote: Boolean(t.fromNote),
    })));
  return rows.sort((a, b) => (a.salesperson === NO_ONE) - (b.salesperson === NO_ONE)
    || a.salesperson.localeCompare(b.salesperson)
    || dayOf(a.dueDate).localeCompare(dayOf(b.dueDate)));
}
