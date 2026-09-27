/**
 * My Desk, the database half. Server only. Rules live in `./desk.js`.
 * A person's desk is their own: steps from notes they wrote, drafts made for them.
 */
import { prisma } from '@/lib/db';
import { isWaitExecutor } from '@/lib/followUp/watch';
import { groupDesk, deskAttention, snoozeUntil } from '@/lib/desk/desk';
import { meetingsNeedingPeople } from '@/lib/desk/meetingPeople';
import { checkInsWithoutOwner } from '@/lib/checkIns/checkInDrafts';

const DRAFT_SELECT = {
  id: true, type: true, status: true, toEmail: true, toName: true, subject: true, body: true,
  reviewExpiresAt: true, classificationReason: true, emailKind: true, contactId: true, createdAt: true,
  project: { select: { id: true, name: true, serviceType: true } },
};

/**
 * `full` adds the list of people nobody looks after. It is company-wide, so it
 * is shown on the page but never counted in anyone's sidebar number.
 */
export async function loadDesk(userId, now = new Date(), { full = true } = {}) {
  const [actions, types, drafts, meetings, noOwner] = await Promise.all([
    prisma.noteAction.findMany({
      where: {
        kind: 'ACTION', status: 'CONFIRMED', fulfilledAt: null,
        note: { createdById: userId, isPublished: true, archivedAt: null },
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
    meetingsNeedingPeople(userId, now),
    full ? checkInsWithoutOwner({ now }) : [],
  ]);
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
  return { groups, drafts, meetings, noOwner, attention: deskAttention({ groups, drafts: drafts.length, meetings: meetings.length }) };
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
 * Only the note's writer (or an admin) can change their steps.
 */
export async function actOnStep(user, actionId, body, { isAdmin = false, now = new Date() } = {}) {
  const a = await prisma.noteAction.findUnique({
    where: { id: actionId },
    select: { id: true, kind: true, nudgeDraftId: true, note: { select: { createdById: true } } },
  });
  if (!a || a.kind !== 'ACTION') return { error: 'Not found', status: 404 };
  if (a.note?.createdById !== user.id && !isAdmin) return { error: 'This is not on your desk.', status: 403 };

  const what = body?.do;
  if (what === 'done') {
    await prisma.noteAction.update({
      where: { id: a.id },
      data: { status: 'DONE', fulfilledAt: now, fulfilledVia: 'manual', snoozedUntil: null, pausedAt: null },
    });
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
