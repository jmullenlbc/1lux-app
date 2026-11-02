/**
 * Sales tasks, the database half. Server only. Rules live in `./tasks.js`.
 *
 * Step rows are made when tasks are read: many code paths create note steps,
 * so catching up here is the one place that cannot miss any of them.
 */
import { prisma } from '@/lib/db';
import { isWaitExecutor } from '@/lib/followUp/watch';
import { ownedBy, ownerIdsOf, logNoteChanges } from '@/lib/notes/owners';
import { actOnStep } from '@/lib/desk/deskServer';
import { inDepartment, SALES_MARKETING } from '@/lib/departments';
import {
  DONE_SHOWN_DAYS, NOTE_TASK_TAG, canChangeTask, cleanTagName, cleanTaskInput, sortTasks, stepTitle, taskDue, taskStatusOf,
  tasksDueByPerson,
} from '@/lib/desk/tasks';

const DAY = 86400000;
const SYNC_LIMIT = 200;

// Every step on a desk, or every published step when userId is null.
function stepScope(userId) {
  return {
    kind: 'ACTION',
    note: { ...(userId ? ownedBy(userId) : {}), isPublished: true, archivedAt: null },
    ...(userId ? { OR: [{ leadUserId: null }, { leadUserId: userId }] } : {}),
  };
}

const person = { select: { id: true, name: true } };
const TASK_SELECT = {
  id: true, title: true, detail: true, status: true, dueDate: true, assigneeId: true, createdById: true,
  noteActionId: true, doneAt: true, createdAt: true,
  assignee: person,
  clients:  { select: { client: { select: { id: true, name: true, archivedAt: true } } } },
  contacts: { select: { contact: { select: { id: true, name: true, clientId: true, archivedAt: true } } } },
  projects: { select: { project: { select: { id: true, name: true, archivedAt: true } } } },
  tags:     { select: { tag: { select: { id: true, name: true, archivedAt: true } } } },
  noteAction: {
    select: {
      id: true, type: true, detail: true, rawText: true, status: true, fulfilledAt: true, dueDate: true, remindAt: true,
      snoozedUntil: true, pausedAt: true, lead: person,
      note: { select: { id: true, title: true, createdById: true, owners: { select: { userId: true, user: person } } } },
    },
  },
};

/** The tag every task from a sales note wears. Made the first time it is needed. */
async function noteTaskTagId() {
  const tags = await prisma.salesTaskTag.findMany({ select: { id: true, name: true, archivedAt: true } });
  const found = tags.find(t => t.name.toLowerCase() === NOTE_TASK_TAG.toLowerCase());
  if (found) {
    if (found.archivedAt) await prisma.salesTaskTag.update({ where: { id: found.id }, data: { archivedAt: null } });
    return found.id;
  }
  try {
    return (await prisma.salesTaskTag.create({ data: { name: NOTE_TASK_TAG }, select: { id: true } })).id;
  } catch (e) {
    if (e?.code !== 'P2002') throw e;
    return (await prisma.salesTaskTag.findUnique({ where: { name: NOTE_TASK_TAG }, select: { id: true } })).id;
  }
}

/** Make the rows for open steps that do not have one yet, carrying the note's links over. */
async function syncStepTasks(userId) {
  const steps = await prisma.noteAction.findMany({
    where: { ...stepScope(userId), status: 'CONFIRMED', fulfilledAt: null, salesTask: null },
    select: {
      id: true, type: true, detail: true, rawText: true, contactId: true,
      note: {
        select: {
          projectId: true,
          contacts: { select: { contactId: true } },
          clients:  { select: { clientId: true } },
          projects: { select: { projectId: true } },
        },
      },
    },
    take: SYNC_LIMIT,
  });
  if (!steps.length) return;
  const tagId = await noteTaskTagId();
  const types = await prisma.noteActionType.findMany({ select: { key: true, executor: true } });
  const typeBy = new Map(types.map(t => [t.key, t]));
  // contactId on a step is a soft link, so it may point at nobody.
  const soft = [...new Set(steps.map(s => s.contactId).filter(Boolean))];
  const live = new Set((soft.length ? await prisma.contact.findMany({ where: { id: { in: soft } }, select: { id: true } }) : []).map(c => c.id));

  for (const s of steps) {
    const noteContacts = s.note.contacts.map(c => c.contactId);
    const contactId = live.has(s.contactId) ? s.contactId : noteContacts.length === 1 ? noteContacts[0] : null;
    const projectIds = [...new Set([s.note.projectId, ...s.note.projects.map(p => p.projectId)].filter(Boolean))];
    await prisma.salesTask.create({
      data: {
        title: stepTitle(s),
        noteActionId: s.id,
        status: isWaitExecutor(typeBy.get(s.type)?.executor) ? 'WAITING' : 'TODO',
        contacts: contactId ? { create: [{ contactId }] } : undefined,
        clients:  { create: [...new Set(s.note.clients.map(c => c.clientId))].map(clientId => ({ clientId })) },
        projects: { create: projectIds.map(projectId => ({ projectId })) },
        tags: { create: [{ tagId }] },
      },
    }).catch(e => {
      // Two reads raced and the other one made it.
      if (e?.code !== 'P2002') throw e;
    });
  }
}

const live = (rows, key) => rows.map(r => r[key]).filter(x => x && !x.archivedAt);

function taskView(row, { typeBy, viewerId, isAdmin, now }) {
  const step = row.noteAction;
  const noteOwnerIds = step ? ownerIdsOf(step.note) : [];
  const who = !step ? row.assignee?.name || ''
    : step.lead?.name || step.note.owners.map(o => o.user?.name).filter(Boolean).join(', ');
  return {
    id: row.id,
    stepId: step?.id || null,
    title: step ? stepTitle(step) : row.title,
    detail: row.detail,
    status: taskStatusOf(row, step),
    dueDate: taskDue(row, step, now),
    doneAt: step ? step.fulfilledAt : row.doneAt,
    assigneeId: row.assigneeId,
    who,
    people: step ? (step.lead ? [step.lead] : step.note.owners.map(o => o.user).filter(Boolean)) : row.assignee ? [row.assignee] : [],
    fromNote: step ? { id: step.note.id, title: step.note.title || 'Sales note', kind: typeBy.get(step.type)?.label || step.type } : null,
    snoozedUntil: step?.snoozedUntil && new Date(step.snoozedUntil) > now ? step.snoozedUntil : null,
    paused: Boolean(step?.pausedAt),
    canChange: canChangeTask({ noteOwnerIds, assigneeId: row.assigneeId, createdById: row.createdById, isStep: Boolean(step) }, viewerId, isAdmin),
    clients: live(row.clients, 'client').map(({ id, name }) => ({ id, name })),
    contacts: live(row.contacts, 'contact').map(({ id, name, clientId }) => ({ id, name, clientId })),
    projects: live(row.projects, 'project').map(({ id, name }) => ({ id, name })),
    tags: live(row.tags, 'tag').map(({ id, name }) => ({ id, name })),
  };
}

/** Which rows count: open ones, and the ones done in the last 30 days. */
function taskWhere(target, since) {
  const own = {
    noteActionId: null,
    AND: [
      // A step row loses its link if its step is deleted; it has no person, so it stays hidden.
      target ? { OR: [{ assigneeId: target }, { assigneeId: null, createdById: target }] }
        : { OR: [{ assigneeId: { not: null } }, { createdById: { not: null } }] },
      { OR: [{ status: { not: 'DONE' } }, { doneAt: { gte: since } }] },
    ],
  };
  const steps = {
    noteAction: {
      is: {
        ...stepScope(target),
        AND: [{ OR: [{ status: 'CONFIRMED', fulfilledAt: null }, { fulfilledAt: { gte: since } }] }],
      },
    },
  };
  return { OR: [own, steps] };
}

async function taskViews(where, { viewerId = null, isAdmin = false, now }) {
  const [rows, types] = await Promise.all([
    prisma.salesTask.findMany({ where, select: TASK_SELECT, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.noteActionType.findMany({ select: { key: true, label: true } }),
  ]);
  const typeBy = new Map(types.map(t => [t.key, t]));
  return rows.map(r => taskView(r, { typeBy, viewerId, isAdmin, now }));
}

async function taskPayload(where, { viewerId, isAdmin, canMakeTags, now }) {
  const [tasks, tags, salesPeople] = await Promise.all([
    taskViews(where, { viewerId, isAdmin, now }),
    listTaskTags(),
    prisma.user.findMany({
      where: { OR: [{ isActive: true, ...inDepartment(SALES_MARKETING) }, { id: viewerId }] },
      select: { id: true, name: true }, orderBy: { name: 'asc' },
    }),
  ]);
  return { viewerId, canMakeTags, tasks: sortTasks(tasks), tags, salesPeople };
}

/** One person's tasks, or everyone's with `scope: 'everyone'`. */
export async function loadTasks({ viewerId, userId, scope, isAdmin = false, canMakeTags = false, now = new Date() }) {
  const target = scope === 'everyone' ? null : userId || viewerId;
  await syncStepTasks(target);
  const since = new Date(now.getTime() - DONE_SHOWN_DAYS * DAY);
  return taskPayload(taskWhere(target, since), { viewerId, isAdmin, canMakeTags, now });
}

const LINKS = {
  client:  id => ({ clients:  { some: { clientId: id } } }),
  contact: id => ({ contacts: { some: { contactId: id } } }),
  project: id => ({ projects: { some: { projectId: id } } }),
};

/** Everyone's tasks on one company, person or project. */
export async function loadRecordTasks({ kind, id, viewerId, isAdmin = false, canMakeTags = false, now = new Date() }) {
  await syncStepTasks(null);
  const since = new Date(now.getTime() - DONE_SHOWN_DAYS * DAY);
  return taskPayload({ AND: [taskWhere(null, since), LINKS[kind](id)] }, { viewerId, isAdmin, canMakeTags, now });
}

/** The weekly meeting card. */
export async function tasksDueThisWeek(now = new Date()) {
  await syncStepTasks(null);
  const since = new Date(now.getTime() - DONE_SHOWN_DAYS * DAY);
  return tasksDueByPerson(await taskViews(taskWhere(null, since), { now }), { now });
}

const linkCreates = data => ({
  ...(data.clientIds ? { clients: { create: data.clientIds.map(clientId => ({ clientId })) } } : {}),
  ...(data.contactIds ? { contacts: { create: data.contactIds.map(contactId => ({ contactId })) } } : {}),
  ...(data.projectIds ? { projects: { create: data.projectIds.map(projectId => ({ projectId })) } } : {}),
  ...(data.tagIds ? { tags: { create: data.tagIds.map(tagId => ({ tagId })) } } : {}),
});

const linkSwaps = data => ({
  ...(data.clientIds ? { clients: { deleteMany: {}, create: data.clientIds.map(clientId => ({ clientId })) } } : {}),
  ...(data.contactIds ? { contacts: { deleteMany: {}, create: data.contactIds.map(contactId => ({ contactId })) } } : {}),
  ...(data.projectIds ? { projects: { deleteMany: {}, create: data.projectIds.map(projectId => ({ projectId })) } } : {}),
  ...(data.tagIds ? { tags: { deleteMany: {}, create: data.tagIds.map(tagId => ({ tagId })) } } : {}),
});

const GONE = { error: 'One of the picked records no longer exists. Nothing was saved. Refresh the page and pick again.', status: 400 };

export async function createTask(user, body, { now = new Date() } = {}) {
  const { data, error } = cleanTaskInput(body, { creating: true });
  if (error) return { error, status: 400 };
  const status = data.status || 'TODO';
  try {
    const task = await prisma.salesTask.create({
      data: {
        title: data.title,
        detail: data.detail ?? null,
        status,
        dueDate: data.dueDate ?? null,
        assigneeId: data.assigneeId === undefined ? user.id : data.assigneeId,
        createdById: user.id,
        doneAt: status === 'DONE' ? now : null,
        ...linkCreates(data),
      },
      select: { id: true },
    });
    return { ok: true, id: task.id };
  } catch (e) {
    if (e?.code === 'P2003') return GONE;
    throw e;
  }
}

/** Saves wording and dates to the step itself, so the desk and reminders follow. */
async function editStep(user, row, data, now) {
  const step = row.noteAction;
  const stepData = {};
  const changes = [];
  if (data.title !== undefined && data.title !== stepTitle(step)) {
    stepData.detail = data.title;
    changes.push({ field: 'step', before: stepTitle(step), after: data.title });
  }
  if (data.dueDate !== undefined) {
    Object.assign(stepData, { dueDate: data.dueDate, remindAt: data.dueDate, remindedAt: null, snoozedUntil: null });
    changes.push({ field: 'step', before: `${stepTitle(step)}: due date`, after: data.dueDate ? data.dueDate.toISOString().slice(0, 10) : 'no date' });
  }
  if (!changes.length) return;
  await prisma.noteAction.update({ where: { id: step.id }, data: stepData });
  await logNoteChanges(prisma, step.noteId, user, changes, now);
}

export async function updateTask(user, id, body, { isAdmin = false, now = new Date() } = {}) {
  const row = await prisma.salesTask.findUnique({
    where: { id },
    select: {
      id: true, status: true, archivedAt: true, assigneeId: true, createdById: true,
      noteAction: {
        select: {
          id: true, noteId: true, detail: true, rawText: true, status: true, fulfilledAt: true,
          note: { select: { createdById: true, owners: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!row || row.archivedAt) return { error: 'That task is gone. Refresh the page.', status: 404 };
  const step = row.noteAction;
  const allowed = canChangeTask({
    noteOwnerIds: step ? ownerIdsOf(step.note) : [], assigneeId: row.assigneeId, createdById: row.createdById, isStep: Boolean(step),
  }, user.id, isAdmin);
  if (!allowed) return { error: 'Only the person this task sits with can change it. Nothing was saved.', status: 403 };

  if (body?.archive) {
    if (step) return { error: 'This task comes from a sales note. Mark it done, or change it on the note.', status: 400 };
    await prisma.salesTask.update({ where: { id }, data: { archivedAt: now, archivedById: user.id } });
    return { ok: true };
  }

  const { data, error } = cleanTaskInput(body);
  if (error) return { error, status: 400 };
  if (step && data.assigneeId !== undefined) return { error: 'A sales note step stays with its note. Change who has it on the note.', status: 400 };
  if (step && data.tagIds) data.tagIds = [...new Set([...data.tagIds, await noteTaskTagId()])];

  const was = taskStatusOf(row, step);
  const next = data.status;
  if (step) {
    if (next && next !== was && (next === 'DONE' || was === 'DONE')) {
      const out = await actOnStep(user, step.id, { do: next === 'DONE' ? 'done' : 'reopen' }, { isAdmin, now });
      if (out.error) return out;
    }
    await editStep(user, row, data, now);
  }
  try {
    await prisma.salesTask.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.detail !== undefined ? { detail: data.detail } : {}),
        ...(next ? { status: next, doneAt: next === 'DONE' ? (was === 'DONE' ? undefined : now) : null } : {}),
        ...(!step && data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...linkSwaps(data),
      },
    });
  } catch (e) {
    if (e?.code === 'P2003') return GONE;
    throw e;
  }
  return { ok: true };
}

export function listTaskTags() {
  return prisma.salesTaskTag.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
}

/** Add a tag, or hand back the one that already has that name in any capitals. */
export async function addTaskTag(user, value) {
  const { name, error } = cleanTagName(value);
  if (error) return { error, status: 400 };
  const all = await prisma.salesTaskTag.findMany({ select: { id: true, name: true, archivedAt: true } });
  const same = all.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (same) {
    if (same.archivedAt) await prisma.salesTaskTag.update({ where: { id: same.id }, data: { archivedAt: null } });
    return { tag: { id: same.id, name: same.name } };
  }
  const tag = await prisma.salesTaskTag.create({ data: { name, createdById: user.id }, select: { id: true, name: true } });
  return { tag };
}

/** Company and project search for the task form. */
export async function lookupRecords(kind, q) {
  const needle = String(q || '').trim();
  if (needle.length < 2) return [];
  const contains = process.env.DATABASE_URL?.startsWith('file:') ? { contains: needle } : { contains: needle, mode: 'insensitive' };
  if (kind === 'client') {
    return prisma.client.findMany({ where: { name: contains }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 15 });
  }
  const rows = await prisma.project.findMany({
    where: { name: contains }, select: { id: true, name: true, client: { select: { name: true } } }, orderBy: { name: 'asc' }, take: 15,
  });
  return rows.map(r => ({ id: r.id, name: r.name, hint: r.client?.name || '' }));
}
