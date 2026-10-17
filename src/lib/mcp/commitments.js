/**
 * "What do we owe LAC, and what do they owe us?"
 *
 * ── Read this before changing anything here ─────────────────────────────────
 * The MCP build plan specified `get_commitments` against "the commitment schema
 * (THEY_OWE_US, WE_OWE_THEM, FOLLOW_UP_EMAIL, …)". **There is no Commitment
 * table.** It was never built, no model, no migration, no route, nothing in
 * src/. The plan was written against a schema that only ever existed on paper.
 *
 * Rather than invent a new table nobody asked for and then have to keep it in
 * step with the four screens that already record obligations, this composes the
 * answer out of the rows the app genuinely writes today:
 *
 *   Task, an internal to-do with an owner and a due date
 *   NoteAction, a follow-up pulled out of a meeting or sales note
 *   Project.nextAction*, the one next step on a live deal
 *   RFI, a question in the field somebody owes an answer to
 *
 * The upside is that this cannot drift: there is no second copy of an
 * obligation to fall out of sync, and an item closed on its own screen
 * disappears from here on the next call. The cost is that a commitment cannot
 * be created THROUGH this tool, it is a read over four systems of record, not
 * a system of record itself. If Mike ever wants commitments to be a first-class
 * thing people file directly, that is a real table and a real migration, and
 * this file becomes the backfill.
 *
 * ── Direction ───────────────────────────────────────────────────────────────
 * Derived from which row it came from and what type it is, never stored:
 *
 *   THEY_OWE_US, EXPECT_INTRO note actions (somebody is introducing us) and
 *                   RFIs ILC raised itself, which are waiting on an answer.
 *   FOLLOW_UP, an outbound message we owe: EMAIL, TEXT, SEND_MATERIALS.
 *   WE_OWE_THEM, everything else. Tasks, calls, scheduling, the next step on
 *                   a deal, and any RFI a GC or EC sent us.
 *
 * ── Only CONFIRMED note actions count ───────────────────────────────────────
 * A SUGGESTED NoteAction is the AI's read of a sentence somebody typed. Nobody
 * has agreed to it. Reporting it as a commitment would mean the bot inventing
 * obligations out of meeting minutes, which is exactly the failure this list is
 * supposed to prevent.
 */
import { prisma } from '@/lib/db';
import { NEXT_ACTION_LABEL } from '@/lib/pipeline';
import { DIRECTIONS } from './catalog.js';

/** The three directions the plan named. Derived per row, never stored. */
// The list itself lives in the pure catalogue, because it is also the enum in
// get_commitments’ argument schema and the two must never drift apart.
export { DIRECTIONS };

/** NoteAction executor types that are an outbound message we owe someone. */
const OUTBOUND_TYPES = new Set(['EMAIL', 'TEXT', 'SEND_MATERIALS']);

/** The one NoteAction type where the ball is in somebody else's court. */
const AWAITING_TYPES = new Set(['EXPECT_INTRO']);

/** Deal next actions that are really an outbound message. */
const OUTBOUND_NEXT_ACTIONS = new Set([
  'EMAIL', 'TEXT', 'SEND_PROPOSAL', 'SEND_BUDGET', 'SEND_PHOTOMETRICS', 'SEND_INVOICE',
]);

/** Task statuses that are still outstanding. */
const OPEN_TASK_STATUS = ['TODO', 'IN_PROGRESS', 'IN_REVIEW'];

/** RFI statuses that are still outstanding. */
const OPEN_RFI_STATUS = ['OPEN', 'IN_REVIEW'];

/** A per-source fetch cap, so one noisy source cannot fill the whole answer. */
const PER_SOURCE = 200;

const iso = (d) => (d instanceof Date ? d.toISOString() : d || null);

/**
 * One commitment, in the shape every source is flattened into.
 *
 * `source` and `sourceId` are deliberate: a bot that reports "you owe Ryan an
 * intro follow-up" should be able to say where to go change it, and nothing
 * here can be edited through this surface.
 */
function shape({ source, sourceId, direction, what, detail, who, company, dueDate,
                 ownerId, projectId, projectName, clientId, clientName, status, url }) {
  const due = iso(dueDate);
  return {
    source, sourceId, direction,
    what, detail: detail || null,
    who: who || null, company: company || null,
    dueDate: due,
    overdue: !!(due && new Date(due) < new Date()),
    ownerId: ownerId || null,
    projectId: projectId || null, projectName: projectName || null,
    clientId: clientId || null, clientName: clientName || null,
    status: status || null,
    url: url || null,
  };
}

/**
 * Every outstanding obligation, from all four sources at once.
 *
 * @param {object} filters
 * @param {string} [filters.clientId]   only commitments that trace to this company
 * @param {string} [filters.projectId]  only commitments on this job
 * @param {string} [filters.ownerId]    only commitments owned by this ILC user
 * @param {string} [filters.direction]  one of DIRECTIONS
 * @param {string} [filters.status]     'open' (default) | 'overdue' | 'all'
 * @param {number} [filters.limit]
 * @returns {Promise<{count:number, bySource:object, byDirection:object, commitments:Array}>}
 */
export async function loadCommitments(filters = {}) {
  const { clientId, projectId, ownerId } = filters;
  const status = filters.status || 'open';
  const wantAll = status === 'all';

  // A clientId or projectId filter rules Tasks out entirely rather than
  // returning all of them: a Task has no company and no job, so there is no
  // honest way to say a general to-do belongs to LAC. Silently including them
  // would make "what do we owe LAC" wrong in the direction that matters.
  const taskScoped = !clientId && !projectId;

  const [tasks, noteActions, deals, rfis] = await Promise.all([
    taskScoped
      ? prisma.task.findMany({
          where: {
            ...(wantAll ? {} : { status: { in: OPEN_TASK_STATUS } }),
            ...(ownerId ? { assigneeId: ownerId } : {}),
          },
          select: { id: true, title: true, description: true, status: true, dueDate: true, assigneeId: true },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
          take: PER_SOURCE,
        })
      : [],

    prisma.noteAction.findMany({
      where: {
        kind: 'ACTION',
        // SUGGESTED is the AI's guess; DONE and DISMISSED are closed.
        ...(wantAll ? { status: { in: ['SUGGESTED', 'CONFIRMED'] } } : { status: 'CONFIRMED' }),
        // An unpublished note is a draft nobody has stood behind yet.
        // A note reaches a job two ways, its own projectId, or the NoteProject
        // join, and reaches a company three, so both paths are spelled out.
        // A step belongs to its lead, else to every owner of the note (0108).
        ...(ownerId ? { OR: [{ leadUserId: null }, { leadUserId: ownerId }] } : {}),
        note: {
          isPublished: true,
          ...(ownerId ? { owners: { some: { userId: ownerId } } } : {}),
          ...(projectId ? { OR: [{ projectId }, { projects: { some: { projectId } } }] } : {}),
          ...(clientId && !projectId
            ? { OR: [
                { project: { clientId } },
                { clients: { some: { clientId } } },
                { projects: { some: { project: { clientId } } } },
              ] }
            : {}),
        },
      },
      select: {
        id: true, type: true, detail: true, rawText: true, status: true,
        contactName: true, company: true, dueDate: true, remindAt: true, leadUserId: true,
        note: {
          select: {
            id: true, title: true, createdById: true, projectId: true,
            project: { select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: PER_SOURCE,
    }),

    prisma.project.findMany({
      where: {
        nextActionType: { not: null },
        ...(projectId ? { id: projectId } : {}),
        ...(clientId ? { clientId } : {}),
        ...(ownerId ? { nextActionOwnerId: ownerId } : {}),
        ...(wantAll ? {} : { OR: [{ procurementStatus: 'OPEN' }, { designStatus: 'OPEN' }] }),
      },
      select: {
        id: true, name: true, clientId: true,
        nextActionType: true, nextActionOwnerId: true, nextActionDueDate: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ nextActionDueDate: 'asc' }],
      take: PER_SOURCE,
    }),

    prisma.rFI.findMany({
      where: {
        ...(wantAll ? {} : { status: { in: OPEN_RFI_STATUS } }),
        ...(projectId ? { projectId } : {}),
        ...(clientId ? { project: { clientId } } : {}),
        ...(ownerId ? { assignedToId: ownerId } : {}),
      },
      select: {
        id: true, rfiNumber: true, subject: true, status: true, receivedFrom: true,
        dateDue: true, assignedToId: true, shipFlag: true,
        project: { select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true } } } },
      },
      orderBy: [{ dateDue: 'asc' }],
      take: PER_SOURCE,
    }),
  ]);

  const out = [];

  for (const t of tasks) {
    out.push(shape({
      source: 'task', sourceId: t.id, direction: 'WE_OWE_THEM',
      what: t.title, detail: t.description, dueDate: t.dueDate,
      ownerId: t.assigneeId, status: t.status, url: '/tasks',
    }));
  }

  for (const a of noteActions) {
    const p = a.note?.project;
    out.push(shape({
      source: 'note_action', sourceId: a.id,
      direction: AWAITING_TYPES.has(a.type) ? 'THEY_OWE_US'
        : OUTBOUND_TYPES.has(a.type) ? 'FOLLOW_UP'
        : 'WE_OWE_THEM',
      what: a.detail || a.rawText || a.type,
      detail: a.detail && a.rawText && a.detail !== a.rawText ? a.rawText : null,
      who: a.contactName, company: a.company,
      // EXPECT_INTRO carries its clock on remindAt, not dueDate.
      dueDate: a.dueDate || a.remindAt,
      ownerId: a.leadUserId || a.note?.createdById,
      projectId: p?.id, projectName: p?.name,
      clientId: p?.client?.id, clientName: p?.client?.name,
      status: a.status,
      url: a.note?.id ? `/sales/notes/${a.note.id}` : null,
    }));
  }

  for (const d of deals) {
    out.push(shape({
      source: 'deal_next_action', sourceId: d.id,
      // WAITING is the one next action that means the ball is not in our court.
      direction: d.nextActionType === 'WAITING' ? 'THEY_OWE_US'
        : OUTBOUND_NEXT_ACTIONS.has(d.nextActionType) ? 'FOLLOW_UP'
        : 'WE_OWE_THEM',
      what: NEXT_ACTION_LABEL[d.nextActionType] || d.nextActionType,
      dueDate: d.nextActionDueDate,
      ownerId: d.nextActionOwnerId,
      projectId: d.id, projectName: d.name,
      clientId: d.client?.id, clientName: d.client?.name,
      status: 'OPEN', url: `/project/${d.id}/summary`,
    }));
  }

  for (const r of rfis) {
    // An RFI ILC raised itself is one we are waiting on; anything from the GC
    // or the EC is one we owe an answer to.
    const selfRaised = String(r.receivedFrom || '').toUpperCase() === 'ILC';
    out.push(shape({
      source: 'rfi', sourceId: r.id,
      direction: selfRaised ? 'THEY_OWE_US' : 'WE_OWE_THEM',
      what: `RFI ${r.rfiNumber}: ${r.subject}`,
      detail: r.shipFlag ? 'Flagged as holding up a shipment.' : null,
      who: selfRaised ? null : r.receivedFrom,
      dueDate: r.dateDue, ownerId: r.assignedToId,
      projectId: r.project?.id, projectName: r.project?.name,
      clientId: r.project?.client?.id, clientName: r.project?.client?.name,
      status: r.status, url: r.project?.id ? `/project/${r.project.id}/rfis` : null,
    }));
  }

  let rows = out;
  if (filters.direction) rows = rows.filter(r => r.direction === filters.direction);
  if (status === 'overdue') rows = rows.filter(r => r.overdue);

  // Overdue first, then soonest-due, then the undated. An item with no date is
  // last rather than first, no date means nobody set a clock on it, which is
  // weaker than a date that has not arrived yet.
  rows.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
  });

  const total = rows.length;
  const limit = Math.max(1, Math.min(Number(filters.limit) || 50, 200));
  const page = rows.slice(0, limit);

  const tally = (key) => page.reduce((m, r) => ({ ...m, [r[key]]: (m[r[key]] || 0) + 1 }), {});

  return {
    count: page.length,
    total,
    truncated: total > page.length,
    overdue: page.filter(r => r.overdue).length,
    bySource: tally('source'),
    byDirection: tally('direction'),
    commitments: page,
  };
}
