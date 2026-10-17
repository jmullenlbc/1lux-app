/**
 * My Desk, the database half. Server only. Rules live in `./desk.js`.
 * A person's desk is their own: steps from notes they own (every owner, or
 * just the step's lead, 0108), drafts made for them, and a shared note's email
 * still waiting for somebody to pick who sends it.
 */
import { prisma } from '@/lib/db';
import { isWaitExecutor } from '@/lib/followUp/watch';
import { groupDesk, deskAttention, snoozeUntil, deskDue, DESK_GROUPS } from '@/lib/desk/desk';
import { meetingsNeedingPeople } from '@/lib/desk/meetingPeople';
import { checkInsWithoutOwner } from '@/lib/checkIns/checkInDrafts';
import { ownedBy, ownerIdsOf, logNoteChanges } from '@/lib/notes/owners';
import { pendingReviews } from '@/lib/intake/webReviews';
import { CONCEPTUAL_SERVICE_TYPE } from '@/lib/intake/conceptualProjects';
import { inDepartment, SALES_MARKETING } from '@/lib/departments';

const DRAFT_SELECT = {
  id: true, type: true, status: true, toEmail: true, toName: true, subject: true, body: true,
  reviewExpiresAt: true, classificationReason: true, emailKind: true, contactId: true, createdAt: true,
  userId: true, senderPending: true,
  project: { select: { id: true, name: true, serviceType: true } },
};

/**
 * `full` adds the company-wide lists: people nobody looks after, web budgets
 * with no salesperson (the pool) and "Same person?" questions (0117). They are
 * shown on the page but never counted in anyone's sidebar number.
 */
export async function loadDesk(userId, now = new Date(), { full = true } = {}) {
  const [actions, types, ownDrafts, pending, meetings, noOwner, pool, reviews, salesPeople, budgetsNotSent] = await Promise.all([
    prisma.noteAction.findMany({
      where: {
        kind: 'ACTION', status: 'CONFIRMED', fulfilledAt: null,
        note: { ...ownedBy(userId), isPublished: true, archivedAt: null },
        OR: [{ leadUserId: null }, { leadUserId: userId }],
      },
      select: {
        id: true, type: true, detail: true, rawText: true, contactId: true, contactName: true,
        targetName: true, company: true, dueDate: true, remindAt: true, reminderCount: true,
        snoozedUntil: true, pausedAt: true, nudgeDraftId: true,
        note: { select: { id: true, title: true, meetingDate: true } },
      },
      take: 500,
    }),
    prisma.noteActionType.findMany({ select: { key: true, label: true, executor: true } }),
    prisma.botDraft.findMany({
      where: { userId, status: 'PENDING_REVIEW' }, orderBy: { createdAt: 'desc' }, select: DRAFT_SELECT, take: 100,
    }),
    pendingSenderDrafts(userId),
    meetingsNeedingPeople(userId, now),
    full ? checkInsWithoutOwner({ now }) : [],
    full ? webBudgetPool() : [],
    full ? pendingReviews(prisma).catch(e => { console.error('[desk] look alikes failed (non-fatal):', e?.message || e); return []; }) : [],
    full ? prisma.user.findMany({ where: { isActive: true, ...inDepartment(SALES_MARKETING) }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [],
    full ? budgetsMadeNotSent(userId).catch(e => { console.error('[desk] budgets not sent failed (non-fatal):', e?.message || e); return []; }) : [],
  ]);
  const seen = new Set(pending.map(d => d.id));
  const drafts = [...pending, ...ownDrafts.filter(d => !seen.has(d.id))];
  const typeBy = new Map(types.map(t => [t.key, t]));
  const ids = [...new Set(actions.map(a => a.contactId).filter(Boolean))];
  const contacts = ids.length
    ? await prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, clientId: true } })
    : [];
  const cBy = new Map(contacts.map(c => [c.id, c]));
  const items = actions.map(a => ({
    ...a,
    label: typeBy.get(a.type)?.label || a.type,
    waiting: isWaitExecutor(typeBy.get(a.type)?.executor),
    who: cBy.get(a.contactId)?.name || a.contactName || '',
    clientId: cBy.get(a.contactId)?.clientId || null,
  }));
  const groups = groupDesk(items, { isWaiting: a => a.waiting, now });
  return { userId, groups, drafts, meetings, noOwner, pool, reviews, salesPeople, budgetsNotSent, attention: deskAttention({ groups, drafts: drafts.length, meetings: meetings.length }) };
}

/**
 * Whose desk (Mike 10-5): the viewer's own, one salesperson's, or everyone's.
 * `loadDesk` is untouched; this picks who to call it for and merges.
 *   { userId }           one person's desk (look-only on the page)
 *   { scope: 'everyone' } every active Sales person's steps, drafts and
 *                         meetings merged, each row tagged with ownerName.
 * The company-wide lists (noOwner, pool, reviews, salesPeople, budgetsNotSent)
 * always come from the viewer's own full call, once.
 */
export async function loadDeskFor({ viewerId, userId, scope, now = new Date() }) {
  if (scope !== 'everyone') {
    const target = userId || viewerId;
    const desk = await loadDesk(target, now, { full: true });
    if (target === viewerId) return desk;
    const owner = await prisma.user.findUnique({ where: { id: target }, select: { name: true } });
    return { ...desk, viewerId, ownerName: owner?.name || '' };
  }

  const mine = await loadDesk(viewerId, now, { full: true });
  const people = mine.salesPeople.filter(u => u.id !== viewerId);
  const others = await Promise.all(people.map(u => loadDesk(u.id, now, { full: false }).then(d => ({ ...d, ownerName: u.name }))));
  const myName = mine.salesPeople.find(u => u.id === viewerId)?.name || '';
  const all = [{ ...mine, ownerName: myName }, ...others];

  const tag = (rows, d) => rows.map(r => ({ ...r, ownerName: d.ownerName, ownerId: d.userId }));
  // A shared note's step sits on every owner's desk; keep the viewer's copy (first in `all`).
  const seenStep = new Set();
  const byKey = new Map();
  for (const d of all) {
    for (const g of d.groups) {
      const slot = byKey.get(g.key) || { ...g, items: [] };
      for (const a of tag(g.items, d)) if (!seenStep.has(a.id)) { seenStep.add(a.id); slot.items.push(a); }
      byKey.set(g.key, slot);
    }
  }
  const t = a => deskDue(a, now)?.getTime() ?? Infinity;
  const groups = DESK_GROUPS.map(g => byKey.get(g.key)).filter(Boolean)
    .map(g => ({ ...g, items: g.items.sort((x, y) => t(x) - t(y)) }));

  const seenDraft = new Set();
  const drafts = [];
  for (const d of all) for (const x of tag(d.drafts, d)) if (!seenDraft.has(x.id)) { seenDraft.add(x.id); drafts.push(x); }
  const seenMeeting = new Set();
  const meetings = [];
  for (const d of all) for (const m of tag(d.meetings, d)) if (!seenMeeting.has(m.id)) { seenMeeting.add(m.id); meetings.push(m); }

  return { ...mine, viewerId, scope: 'everyone', groups, drafts, meetings };
}

/**
 * Budgets made but never sent (Mike 10-5): the viewer's projects with no
 * budgetSentDate that already hold a budget figure. "Budget made" = a live
 * ProjectBudgetAmount row at tier "budget" or "po" (a real budget file or a
 * hand-entered number; the "conceptual" tier is only the web guess, and
 * budgetNumber is set on web budgets too, so neither of those count).
 */
function budgetsMadeNotSent(userId) {
  return prisma.project.findMany({
    where: {
      salesOwnerId: userId, archivedAt: null, budgetSentDate: null,
      budgetAmounts: { some: { tier: { in: ['budget', 'po'] }, archivedAt: null } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 25,
    select: { id: true, name: true, budgetNumber: true, updatedAt: true, client: { select: { name: true } } },
  });
}

/** Web budget projects nobody in Sales has taken yet (Mike, 10-4: "a pool where we assign that person to a sales person"). */
function webBudgetPool() {
  return prisma.project.findMany({
    where: { serviceType: CONCEPTUAL_SERVICE_TYPE, salesOwnerId: null, procurementStatus: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: {
      id: true, name: true, budgetNumber: true, city: true, state: true, createdAt: true, contactName: true, contactEmail: true,
      client: { select: { name: true } },
      // A copy made in the company portal (0132) shows a "copy of" chip.
      conceptualDraft: { select: { copiedFromId: true, budgetName: true } },
    },
  });
}

/**
 * A shared note's emails nobody has picked a sender for yet (0108, Mike 9-27:
 * "Must be chosen before it can be sent out"). They show on every owner's
 * desk, each with the note's owners to pick from.
 */
async function pendingSenderDrafts(userId) {
  const drafts = await prisma.botDraft.findMany({
    where: { senderPending: true, status: 'PENDING_REVIEW' }, orderBy: { createdAt: 'desc' }, select: DRAFT_SELECT, take: 100,
  });
  if (!drafts.length) return [];
  const steps = await prisma.noteAction.findMany({
    where: { botDraftId: { in: drafts.map(d => d.id) }, note: ownedBy(userId) },
    select: { botDraftId: true, note: { select: { createdById: true, owners: { select: { userId: true, user: { select: { id: true, name: true } } } } } } },
  });
  const senders = new Map();
  for (const s of steps) {
    const ids = ownerIdsOf(s.note);
    senders.set(s.botDraftId, ids.map(id => s.note.owners.find(o => o.userId === id)?.user).filter(Boolean));
  }
  return drafts.filter(d => senders.has(d.id)).map(d => ({ ...d, senders: senders.get(d.id) }));
}

/** Cancel a "still waiting" draft once no live, unpaused step still needs it. */
async function withdrawNudge(draftId, now, reason) {
  if (!draftId) return;
  const open = await prisma.noteAction.count({
    where: { nudgeDraftId: draftId, fulfilledAt: null, status: 'CONFIRMED', pausedAt: null },
  });
  if (open > 0) return;
  await prisma.botDraft.updateMany({
    where: { id: draftId, status: 'PENDING_REVIEW' },
    data: { status: 'CANCELLED', cancelledAt: now, classificationReason: reason },
  });
}

/**
 * Done / Snooze / Pause / Resume one step. Returns { error, status } or { ok }.
 * Only the note's owners (or an admin) can change its steps.
 */
export async function actOnStep(user, actionId, body, { isAdmin = false, now = new Date() } = {}) {
  const a = await prisma.noteAction.findUnique({
    where: { id: actionId },
    select: {
      id: true, kind: true, nudgeDraftId: true, noteId: true, detail: true, rawText: true,
      note: { select: { createdById: true, owners: { select: { userId: true } } } },
    },
  });
  if (!a || a.kind !== 'ACTION') return { error: 'Not found', status: 404 };
  if (!ownerIdsOf(a.note).includes(user.id) && !isAdmin) return { error: 'This is not on your desk.', status: 403 };

  const what = body?.do;
  if (what === 'done') {
    await prisma.noteAction.update({
      where: { id: a.id },
      data: { status: 'DONE', fulfilledAt: now, fulfilledVia: 'manual', snoozedUntil: null, pausedAt: null },
    });
    const label = a.detail || a.rawText || 'step';
    await logNoteChanges(prisma, a.noteId, user, [{ field: 'step', before: `${label}: Confirmed`, after: `${label}: Done` }], now);
    await withdrawNudge(a.nudgeDraftId, now, 'Withdrawn: marked done on My Desk');
    return { ok: true };
  }
  if (what === 'snooze') {
    const until = snoozeUntil({ days: body.days, date: body.date }, now);
    if (!until) return { error: 'Pick a number of days (1 to 365) or a date after today.', status: 400 };
    await prisma.noteAction.update({
      where: { id: a.id },
      data: { snoozedUntil: until, remindAt: until, remindedAt: null },
    });
    return { ok: true, snoozedUntil: until };
  }
  if (what === 'unsnooze') {
    await prisma.noteAction.update({ where: { id: a.id }, data: { snoozedUntil: null, remindAt: now, remindedAt: null } });
    return { ok: true };
  }
  if (what === 'pause') {
    await prisma.noteAction.update({ where: { id: a.id }, data: { pausedAt: now } });
    await withdrawNudge(a.nudgeDraftId, now, 'Withdrawn: reminder paused on My Desk');
    return { ok: true };
  }
  if (what === 'resume') {
    await prisma.noteAction.update({ where: { id: a.id }, data: { pausedAt: null } });
    return { ok: true };
  }
  return { error: 'Unknown action', status: 400 };
}
