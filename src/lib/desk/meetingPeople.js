/**
 * My Desk: in-person meetings this week with guests who are not in the CRM, the
 * database half. Rules live in `./needsPerson.js`. Server only.
 *
 * Adding the person links them to the meeting's note. When the note is already
 * published, their last-met date moves and the meeting's follow-up email is
 * written for them, the same way it would have been had they been on it at publish.
 */
import { prisma } from '@/lib/db';
import { addNoteLinks, stampLastMet } from '@/lib/noteLinks';
import { fireNoteActionConfirmed } from '@/lib/bot/noteActionRunner';
import { needsPerson, stepIsFor, nameFromEmail, NEEDS_PERSON_DAYS } from '@/lib/desk/needsPerson';

const DAY = 86_400_000;

export async function meetingsNeedingPeople(userId, now = new Date()) {
  const notes = await prisma.note.findMany({
    where: {
      createdById: userId, noteType: 'SALES', isInPerson: true, peopleSkippedAt: null,
      meetingDate: { gte: new Date(now.getTime() - NEEDS_PERSON_DAYS * DAY), lte: now },
    },
    select: {
      id: true, title: true, activityType: true, meetingDate: true, attendees: true, isInPerson: true,
      isPublished: true, peopleSkippedAt: true, _count: { select: { contacts: true } },
    },
    orderBy: { meetingDate: 'desc' },
    take: 50,
  });
  if (!notes.length) return [];
  // Compared in JS: Prisma's case-insensitive match is Postgres-only (same as the calendar sync).
  const known = new Set((await prisma.contact.findMany({ where: { email: { not: null } }, select: { email: true } }))
    .map(c => String(c.email).trim().toLowerCase()));
  return notes.flatMap(n => {
    const flag = needsPerson({ ...n, contactCount: n._count.contacts }, known, now);
    if (!flag) return [];
    return [{
      id: n.id, title: n.title, activityType: n.activityType, meetingDate: n.meetingDate, isPublished: n.isPublished,
      nobody: flag.nobody, unknown: flag.unknown.map(g => ({ ...g, name: g.name || nameFromEmail(g.email) })),
    }];
  });
}

async function ownNote(user, noteId, isAdmin) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { id: true, createdById: true, isPublished: true, isInPerson: true, meetingDate: true },
  });
  if (!note) return { error: 'Meeting not found', status: 404 };
  if (note.createdById !== user.id && !isAdmin) return { error: 'This meeting is not on your desk.', status: 403 };
  return { note };
}

/** Put a person (already in the CRM) on the meeting. Returns { ok, drafted } or { error, status }. */
export async function addPersonToMeeting(user, noteId, contactId, { isAdmin = false } = {}) {
  const { note, error, status } = await ownNote(user, noteId, isAdmin);
  if (error) return { error, status };
  const person = await prisma.contact.findUnique({
    where: { id: contactId }, select: { id: true, name: true, ownerId: true, client: { select: { ownerId: true } } },
  });
  if (!person) return { error: 'Person not found', status: 404 };

  await addNoteLinks(prisma, 'contact', noteId, [contactId]);
  // Nobody looks after them yet: the person who met them does.
  if (!person.ownerId && !person.client?.ownerId && note.createdById) {
    await prisma.contact.update({ where: { id: contactId }, data: { ownerId: note.createdById } });
  }
  if (!note.isPublished) return { ok: true, drafted: 0 };

  if (note.isInPerson) await stampLastMet(prisma, noteId, note.meetingDate);
  const onNote = await prisma.noteContact.count({ where: { noteId } });
  const loose = await prisma.noteAction.findMany({
    where: { noteId, kind: 'ACTION', contactId: null }, select: { id: true, contactName: true, status: true },
  });
  const theirs = loose.filter(a => stepIsFor(a.contactName, person.name, onNote === 1));
  if (!theirs.length) return { ok: true, drafted: 0 };
  await prisma.noteAction.updateMany({
    where: { id: { in: theirs.map(a => a.id) } }, data: { contactId, contactName: person.name },
  });
  for (const a of theirs.filter(x => x.status === 'CONFIRMED')) {
    try { await fireNoteActionConfirmed(noteId, a.id); }
    catch (e) { console.error('[addPersonToMeeting] follow-up failed:', a.id, e?.message ?? e); }
  }
  const onDrafts = await prisma.noteAction.findMany({
    where: { id: { in: theirs.map(a => a.id) }, botDraftId: { not: null } }, select: { botDraftId: true },
  });
  return { ok: true, drafted: new Set(onDrafts.map(a => a.botDraftId)).size };
}

/** "Nobody to add": stop flagging this meeting. */
export async function skipMeetingPeople(user, noteId, { isAdmin = false, now = new Date() } = {}) {
  const { error, status } = await ownNote(user, noteId, isAdmin);
  if (error) return { error, status };
  await prisma.note.update({ where: { id: noteId }, data: { peopleSkippedAt: now } });
  return { ok: true };
}
