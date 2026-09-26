/**
 * Follow-up watch — the database side (Mike 9-25).
 *
 *  - matchEmailToWaits: an email just came in. Does it close any step we were
 *    waiting on from that person (reply, drawings, invite, intro)? If so the
 *    step is DONE and points at the email.
 *  - matchEventToWaits: same, for a calendar invite the person organized.
 *  - sendDueWaitReminders: the daily sweep. Steps still open whose rung is due
 *    get ONE "still waiting on…" draft per person per note (Bot Queue, a human
 *    sends it — nothing is sent automatically) and a bell for the note's owner,
 *    then move to the next rung, or stop after the last one.
 *
 * Takes `prisma` as an argument and uses relative imports only, so the tests
 * can run it against a fake database. The email writer and the bell are
 * passed in (defaults load the real ones on first use).
 */
import { WAIT_EXECUTORS, isWaitExecutor, emailFulfills, eventFulfills, ladderOf, waitStart, nextRemindAt } from './watch.js';

const lower = s => String(s || '').trim().toLowerCase();
const DAY_MS = 86_400_000;

/**
 * The rung after the one just sent. When that date has already gone by (the
 * sweep ran late, or the rungs are close together) it is pushed out by the
 * normal gap between the two rungs, so two reminders never land on back-to-back days.
 */
export function nextRungAfterSend(start, rungs, count, now) {
  const next = nextRemindAt(start, rungs, count);
  if (!next || next > now) return next;
  const gapDays = Math.max(1, (rungs[count] ?? 0) - (rungs[count - 1] ?? 0));
  return new Date(now.getTime() + gapDays * DAY_MS);
}

async function defaultNotify(alert) {
  const { notifyUser } = await import('@/lib/alerts');
  return notifyUser(alert);
}
async function defaultCompose(group) {
  const { composeContactEmail } = await import('@/lib/bot/composeOutreach');
  return composeContactEmail(group);
}

async function typesByKey(prisma, keys) {
  const rows = await prisma.noteActionType.findMany({ where: { key: { in: [...new Set(keys)] } } });
  return new Map(rows.map(t => [t.key, t]));
}

/** Open waiting steps for these people on published, un-archived notes. */
async function openWaits(prisma, contactIds) {
  if (!contactIds.length) return [];
  const rows = await prisma.noteAction.findMany({
    where:   { kind: 'ACTION', status: 'CONFIRMED', fulfilledAt: null, contactId: { in: contactIds } },
    include: { note: { select: { id: true, title: true, meetingDate: true, isPublished: true, archivedAt: true, createdById: true, calendarRef: true, activityType: true } } },
  });
  // Includes are not covered by the archive filter — check by hand.
  const live = rows.filter(a => a.note?.isPublished && !a.note?.archivedAt);
  const types = await typesByKey(prisma, live.map(a => a.type));
  return live.map(a => ({ a, type: types.get(a.type) })).filter(x => isWaitExecutor(x.type?.executor));
}

async function contactsById(prisma, ids) {
  const rows = await prisma.contact.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, email: true } });
  return new Map(rows.map(c => [c.id, c]));
}

/** A "still waiting" draft nobody has sent is withdrawn once every step on it is done. */
async function withdrawSettledNudges(prisma, draftIds, now) {
  for (const id of new Set(draftIds.filter(Boolean))) {
    const open = await prisma.noteAction.count({ where: { nudgeDraftId: id, fulfilledAt: null, status: 'CONFIRMED' } });
    if (open > 0) continue;
    await prisma.botDraft.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data:  { status: 'CANCELLED', cancelledAt: now, classificationReason: 'Withdrawn — they did it before this went out' },
    });
  }
}

async function closeSteps(prisma, hits, { via, emailId = null, at, notify }) {
  const now = new Date();
  for (const { a, match } of hits) {
    await prisma.noteAction.update({
      where: { id: a.id },
      data:  {
        status: 'DONE', fulfilledAt: at || now, fulfilledVia: via, fulfilledByEmailId: emailId,
        fulfilledNote: match.note.slice(0, 300), remindAt: null,
      },
    });
    if (a.note?.createdById) {
      await notify({
        userId:    a.note.createdById,
        type:      'NOTE_REMINDER',
        title:     match.note.slice(0, 120),
        message:   `Next step from "${a.note.title || 'a sales note'}" is done: ${a.detail || a.rawText || ''}`.slice(0, 400),
        link:      `/crm/notes?note=${a.note.id}`,
        dedupeKey: `noteAction:${a.id}:fulfilled`,
      }).catch(() => {});
    }
  }
  await withdrawSettledNudges(prisma, hits.map(h => h.a.nudgeDraftId), now);
  return hits.map(h => ({ actionId: h.a.id, note: h.match.note }));
}

/**
 * An email was just recorded. Close any waiting step it fulfils.
 * @returns [{ actionId, note }]
 */
export async function matchEmailToWaits(prisma, messageId, { notify = defaultNotify } = {}) {
  const msg = await prisma.emailMessage.findUnique({
    where:   { id: messageId },
    include: { attachments: { select: { filename: true } }, contactLinks: { select: { contactId: true } } },
  });
  if (!msg || msg.isAutomated) return [];
  const waits = await openWaits(prisma, (msg.contactLinks || []).map(l => l.contactId));
  if (!waits.length) return [];
  const contacts = await contactsById(prisma, waits.map(w => w.a.contactId));

  const hits = [];
  for (const { a, type } of waits) {
    const c = contacts.get(a.contactId);
    const match = emailFulfills(type.executor, msg, {
      contactEmail: c?.email, contactName: c?.name || a.contactName, targetName: a.targetName,
      since: waitStart(a, a.note),
    });
    if (match) hits.push({ a, match });
  }
  return closeSteps(prisma, hits, { via: 'email', emailId: msg.id, at: msg.sentAt, notify });
}

/**
 * A calendar event was just synced. Close any "expect an invite" step whose
 * person organized it.
 */
export async function matchEventToWaits(prisma, event, { notify = defaultNotify } = {}) {
  const organizer = lower(event?.organizerEmail);
  if (!organizer) return [];
  const known = await prisma.contact.findMany({ where: { email: { not: null } }, select: { id: true, email: true, name: true } });
  const people = known.filter(c => lower(c.email) === organizer);
  const waits = await openWaits(prisma, people.map(c => c.id));
  const hits = [];
  const ref = event.externalId || event.iCalUid || null;
  for (const { a, type } of waits) {
    // The meeting the note is about is not "the invite they said they'd send".
    if (ref && a.note?.calendarRef === ref) continue;
    const c = people.find(p => p.id === a.contactId);
    const match = eventFulfills(type.executor, event, { contactEmail: c?.email, contactName: c?.name || a.contactName, since: waitStart(a, a.note) });
    if (match) hits.push({ a, match });
  }
  return closeSteps(prisma, hits, { via: 'calendar', notify });
}

/**
 * Date of the rung this step is on — the first one for a fresh step, the next
 * unused one for a step picked up again after a pause. Null when the ladder is
 * used up or empty.
 */
export function firstRemindAt(action, type, note) {
  return nextRemindAt(waitStart(action, note), ladderOf(type, action), action.reminderCount || 0);
}

/**
 * The daily sweep. One "still waiting" draft per person per note, whatever
 * number of steps are overdue for them.
 * @returns { due, drafted, notified, finished, skipped }
 */
export async function sendDueWaitReminders(prisma, {
  now = new Date(), compose = defaultCompose, notify = defaultNotify, reviewWindowMinutes = 30,
} = {}) {
  const log = { due: 0, drafted: 0, notified: 0, finished: 0, skipped: 0 };
  const rows = await prisma.noteAction.findMany({
    where:   { kind: 'ACTION', status: 'CONFIRMED', fulfilledAt: null, remindAt: { lte: now } },
    include: { note: { select: { id: true, title: true, meetingDate: true, isPublished: true, archivedAt: true, createdById: true, calendarRef: true, activityType: true } } },
    orderBy: { remindAt: 'asc' },
    take:    500,
  });
  const types = await typesByKey(prisma, rows.map(a => a.type));
  const due = rows.filter(a => isWaitExecutor(types.get(a.type)?.executor));
  log.due = due.length;

  // A draft note or one with no owner: leave it — tomorrow may be different.
  const ready = due.filter(a => a.note?.isPublished && !a.note?.archivedAt && a.note?.createdById);
  log.skipped = due.length - ready.length;

  const contacts = await contactsById(prisma, ready.map(a => a.contactId).filter(Boolean));
  const groups = new Map();
  for (const a of ready) {
    const k = `${a.noteId}|${a.contactId || a.id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }

  for (const actions of groups.values()) {
    const first = actions[0];
    const note = first.note;
    const c = first.contactId ? contacts.get(first.contactId) : null;
    const name = c?.name || first.contactName || 'your contact';
    const round = Math.max(...actions.map(a => a.reminderCount || 0)) + 1;

    let draftId = null;
    if (c?.email) {
      const { subject, body, emailKind = 'CHECK_IN' } = await compose({
        nudge: true, round, ownerUserId: note.createdById, meetingType: note.activityType || null, meetingTitle: note.title || '',
        contactId: c.id, contactName: name, email: c.email, company: first.company || '', contact: c,
        actions: actions.map(a => ({
          id: a.id, label: types.get(a.type)?.label || a.type, detail: a.detail || a.rawText,
          targetName: a.targetName, waitingFor: WAIT_EXECUTORS[types.get(a.type)?.executor],
        })),
      });
      const draft = await prisma.botDraft.create({
        data: {
          userId: note.createdById, type: 'FOLLOW_UP', status: 'PENDING_REVIEW',
          toEmail: c.email, toName: name, subject, body, aiSubject: subject, aiBody: body, emailKind, reviewWindowMinutes,
          classificationReason: `Still waiting (reminder ${round}) from a sales note`,
        },
        select: { id: true },
      });
      draftId = draft.id;
      log.drafted++;
    }

    const what = actions.map(a => a.detail || a.rawText).filter(Boolean).join('; ');
    const res = await notify({
      userId:    note.createdById,
      type:      'NOTE_REMINDER',
      title:     `Still waiting on ${name} (reminder ${round})`,
      message:   `${what}${draftId ? '. A check-in email is in the Bot Queue for you to review.' : '. No email on file, so no draft.'}`.slice(0, 400),
      link:      `/crm/notes?note=${note.id}`,
      dedupeKey: `noteWait:${note.id}:${first.contactId || first.id}:${round}`,
    }).catch(() => ({ created: false }));
    if (res?.created) log.notified++;

    for (const a of actions) {
      const count = (a.reminderCount || 0) + 1;
      const next = nextRungAfterSend(waitStart(a, note), ladderOf(types.get(a.type), a), count, now);
      if (!next) log.finished++;
      await prisma.noteAction.update({
        where: { id: a.id },
        data:  { reminderCount: count, remindedAt: now, remindAt: next, ...(draftId ? { nudgeDraftId: draftId } : {}) },
      });
    }
  }
  return log;
}
