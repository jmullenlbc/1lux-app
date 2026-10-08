/**
 * Meeting Prep — pull the rows a brief is built from, for one sales note.
 *
 * Sell figures only (Mike, 2026-09-14): each job's product sale total and
 * design fee, plus its budget from opts.budgetFor(). Nothing about what ILC
 * pays is read here — no DN, no pricing snapshot, no pipelinePerUnit, no
 * change-order line items — so none of it can reach brief.js, the model, or
 * the saved brief.
 *
 * Who counts as "on this meeting": the companies, projects and people linked
 * to the note, plus the companies behind those projects and people. Each
 * person comes with the jobs they are linked to (those jobs are pulled too,
 * whichever company they belong to) and their work history.
 *
 * Takes the Prisma client (and the budget function) as arguments so it
 * carries no `@/` imports.
 */
import { boardRows } from '../pipeline.js';

const DAY = 86_400_000;
const NEWS_LOOKBACK_DAYS = 120;
// Budgets run the whole budget engine per job, so only the jobs a brief can
// show get one: the note's own, the people's, and open ones — at most this many.
const MAX_BUDGETS = 60;

const CONTACT_SELECT = {
  id: true, name: true, title: true, company: true, clientId: true,
  lastInPersonAt: true, lastTouchpointAt: true, lastEmailReceivedAt: true, lastEmailSentAt: true,
  // Nested lists skip the archive filter in db.js — filter by hand.
  projectLinks: { where: { project: { archivedAt: null } }, select: { projectId: true, isLead: true } },
  employment: {
    where: { archivedAt: null },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { company: true, title: true, startYear: true, startMonth: true, endYear: true, endMonth: true, isCurrent: true, position: true },
  },
};

const uniq = xs => [...new Set(xs.filter(Boolean))];

// One failing table should thin the brief, not sink it.
async function safe(label, promise, fallback = []) {
  try { return await promise; } catch (e) {
    console.error(`[meetingPrep.gather] ${label} failed:`, e?.message ?? e);
    return fallback;
  }
}

/**
 * @returns {Promise<null | { empty: true } | object>}  null = no such note;
 *   { empty: true } = nothing linked to prep from; otherwise the raw lists
 *   buildFactBlocks() takes.
 * @param {object} [opts]
 * @param {(projectIds: string[]) => Promise<object>} [opts.budgetFor]  returns
 *   { [projectId]: { total, source } }; without it no budgets are shown.
 */
export async function gatherMeetingFacts(prisma, noteId, now = new Date(), opts = {}) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      projectId: true,
      clients:  { select: { clientId: true } },
      projects: { select: { projectId: true } },
      contacts: { select: { contactId: true } },
    },
  });
  if (!note) return null;

  const noteProjectIds = uniq([note.projectId, ...note.projects.map(p => p.projectId)]);
  const notePersonIds  = uniq(note.contacts.map(c => c.contactId));

  // The link rows above skip the archive filter; these top-level reads don't,
  // so from here on an archived job or person on the note is simply not there.
  const [linkedProjects, noteContacts] = await Promise.all([
    noteProjectIds.length
      ? prisma.project.findMany({ where: { id: { in: noteProjectIds } }, select: { id: true, clientId: true } })
      : [],
    notePersonIds.length
      ? prisma.contact.findMany({ where: { id: { in: notePersonIds } }, select: { id: true, clientId: true } })
      : [],
  ]);
  const linkedProjectIds = linkedProjects.map(p => p.id);
  const noteContactIds   = noteContacts.map(c => c.id);

  const clientIds = uniq([
    ...note.clients.map(c => c.clientId),
    ...linkedProjects.map(p => p.clientId),
    ...noteContacts.map(c => c.clientId),
  ]);
  if (!clientIds.length && !linkedProjectIds.length && !noteContactIds.length) return { empty: true };

  const [clients, contacts] = await Promise.all([
    safe('clients', prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, name: true, type: true, city: true, state: true, tier: true, rating: true },
    })),
    // The people on the note always come first and are never cut; their
    // companies' other people fill in behind, most recently in touch first.
    safe('contacts', Promise.all([
      noteContactIds.length ? prisma.contact.findMany({ where: { id: { in: noteContactIds } }, select: CONTACT_SELECT }) : [],
      clientIds.length ? prisma.contact.findMany({
        where: { clientId: { in: clientIds }, id: { notIn: noteContactIds } },
        select: CONTACT_SELECT,
        orderBy: [{ lastTouchpointAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
        take: 40,
      }) : [],
    ]).then(([mine, theirs]) => [...mine, ...theirs])),
  ]);

  const personProjectIds = uniq(contacts.flatMap(c => (c.projectLinks || []).map(l => l.projectId)));

  const projects = await safe('projects', prisma.project.findMany({
    where: { OR: [{ id: { in: uniq([...linkedProjectIds, ...personProjectIds]) } }, { clientId: { in: clientIds } }] },
    select: {
      id: true, name: true, clientId: true, serviceType: true,
      procurementStage: true, designStage: true, procurementStatus: true, designStatus: true,
      expectedOrderDate: true, nextActionType: true, nextActionDueDate: true, flagged: true, flagNote: true,
      contractValue: true, designContractValue: true,
      client: { select: { name: true } },
    },
    take: 300,
  }));

  const linkedSet = new Set(linkedProjectIds);
  const personSet = new Set(personProjectIds);
  const clientSet = new Set(clientIds);
  const isOpen = p => boardRows(p).some(r => !r.status || r.status === 'OPEN');
  const rank = p => (linkedSet.has(p.id) ? 0 : personSet.has(p.id) ? 1 : 2);
  const budgetIds = projects
    .filter(p => linkedSet.has(p.id) || personSet.has(p.id) || isOpen(p))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_BUDGETS)
    .map(p => p.id);
  const budgets = opts.budgetFor && budgetIds.length
    ? await safe('budgets', opts.budgetFor(budgetIds), {})
    : {};

  // Change orders and RFIs: the note's jobs and its companies' jobs — not every
  // job a person has ever been on at some other company.
  const projectIds = uniq([...linkedProjectIds, ...projects.filter(p => clientSet.has(p.clientId)).map(p => p.id)]);
  const contactIds = uniq([...noteContactIds, ...contacts.map(c => c.id)]);

  // Notes that touch the same people, companies or jobs — other than this one.
  const relatedNote = {
    id: { not: noteId },
    archivedAt: null,
    OR: [
      { clients:  { some: { clientId:  { in: clientIds } } } },
      { contacts: { some: { contactId: { in: contactIds } } } },
      { projects: { some: { projectId: { in: linkedProjectIds } } } },
      { projectId: { in: linkedProjectIds } },
    ],
  };
  const actionSelect = {
    id: true, type: true, detail: true, rawText: true, contactName: true, company: true, dueDate: true, status: true,
    note: { select: { title: true, meetingDate: true } },
  };

  const [followUps, intel, changeOrders, rfis, news, standards, history] = await Promise.all([
    safe('followUps', prisma.noteAction.findMany({
      where: {
        kind: 'ACTION',
        status: { in: ['SUGGESTED', 'CONFIRMED'] },
        AND: [{ OR: [{ contactId: { in: contactIds } }, { note: relatedNote }] }, { note: { isPublished: true, archivedAt: null, id: { not: noteId } } }],
      },
      select: actionSelect,
      orderBy: { createdAt: 'desc' },
      take: 30,
    })),
    safe('intel', prisma.noteAction.findMany({
      where: {
        kind: 'INTEL',
        status: { not: 'DISMISSED' },
        AND: [{ OR: [{ contactId: { in: contactIds } }, { note: relatedNote }] }, { note: { isPublished: true, archivedAt: null, id: { not: noteId } } }],
      },
      select: actionSelect,
      orderBy: { createdAt: 'desc' },
      take: 20,
    })),
    safe('changeOrders', prisma.changeOrder.findMany({
      where: { projectId: { in: projectIds }, status: { in: ['DRAFT', 'SENT'] } },
      select: { id: true, projectId: true, coNumber: true, title: true, status: true, date: true },
      orderBy: { date: 'desc' },
      take: 10,
    })),
    safe('rfis', prisma.rFI.findMany({
      where: { projectId: { in: projectIds }, status: { in: ['OPEN', 'IN_REVIEW'] } },
      select: { id: true, projectId: true, rfiNumber: true, subject: true, status: true, dateDue: true },
      orderBy: { dateReceived: 'desc' },
      take: 10,
    })),
    safe('news', prisma.marketSignal.findMany({
      where: {
        publishedAt: { gte: new Date(now.getTime() - NEWS_LOOKBACK_DAYS * DAY) },
        reviewStatus: { not: 'DISMISSED' },
        // Screened out as not about a project (0125): true or null only.
        AND: [{ OR: [{ projectRelated: true }, { projectRelated: null }] }],
        OR: [
          { linkedClientId: { in: clientIds }, matchStatus: { not: 'REJECTED' } },
          { linkedProjectId: { in: projectIds }, projectMatchStatus: { not: 'REJECTED' } },
        ],
      },
      select: { id: true, title: true, publishedAt: true, linkedClientId: true, linkedProjectId: true, reviewStatus: true },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    })),
    safe('standards', prisma.clientStandardsAnswer.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds } },
      _count: { _all: true },
      _max: { answered_at: true },
    })),
    safe('history', prisma.note.findMany({
      where: { ...relatedNote, noteType: { not: 'PROJECT_MEETING' }, isPublished: true },
      select: { id: true, title: true, meetingDate: true, activityType: true, createdAt: true },
      orderBy: [{ meetingDate: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    })),
  ]);

  // Kids, golf, cold brew: only for the people actually on this meeting.
  const personal = noteContactIds.length ? await safe('personal', prisma.contactPersonalFact.findMany({
    where: { contactId: { in: noteContactIds }, archivedAt: null },
    select: { id: true, contactId: true, category: true, fact: true },
    orderBy: { createdAt: 'desc' },
    take: 24,
  })) : [];

  const noteContactSet = new Set(noteContactIds);
  const flat = a => ({ ...a, noteTitle: a.note?.title || null, noteDate: a.note?.meetingDate || null, note: undefined });

  return {
    clients,
    contacts: contacts.map(c => ({ ...c, onNote: noteContactSet.has(c.id) })),
    projects: projects.map(p => ({ ...p, linked: linkedSet.has(p.id), budget: budgets[p.id] || null })),
    followUps: followUps.map(flat),
    intel: intel.map(flat),
    changeOrders,
    rfis,
    news,
    standards: standards.map(s => ({ clientId: s.clientId, count: s._count?._all ?? 0, lastAnsweredAt: s._max?.answered_at ?? null })),
    history,
    personal,
  };
}
