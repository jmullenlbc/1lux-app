import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { addNoteLinks, removeNoteLinks, setNoteContacts, stampLastMet, NOTE_CONTACTS_INCLUDE } from '@/lib/noteLinks';
import { archiveData, readArchivedFlag, deleteRefused, ARCHIVED_FLAG_HELP } from '@/lib/archive';
import { extractActionsOnPublish } from '@/lib/notes/publishActions';
import { executeNotePublished, pauseNoteOnUnpublish } from '@/lib/bot/noteActionRunner';
// Which activity types count as in person lives in one place now — shared with
// the note-create route and the calendar sync.
import { isInPersonType } from '@/lib/calendar/inPerson';
import { cleanCalendarLink } from '@/lib/calendar/salesOwner';
import { addNoteOwners, logNoteChanges, ownerIdsOf } from '@/lib/notes/owners';

const NOTE_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  owners: { select: { userId: true, user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
  clients: {
    include: { client: { select: { id: true, clientNumber: true, name: true, type: true } } },
    orderBy: { createdAt: 'asc' },
  },
  projects: {
    include: {
      project: {
        select: { id: true, projectNumber: true, name: true, serviceType: true, procurementStage: true, designStage: true, procurementStatus: true, designStatus: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  contacts: NOTE_CONTACTS_INCLUDE,
};

// GET /api/crm/notes/[id]
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const note = await prisma.note.findUnique({ where: { id: params.id }, include: NOTE_INCLUDE });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(note);
}

// PATCH /api/crm/notes/[id]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const note = await prisma.note.findUnique({
    where: { id: params.id },
    include: { contacts: { select: { contactId: true } }, owners: { select: { userId: true } } },
  });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const {
    title, noteBody, meetingDate, attendees, calendarRef, meetingLink,
    activityType,
    publish,          // true = mark complete (enable automations); false = revert to draft
    addClientIds    = [],
    removeClientIds = [],
    addProjectIds   = [],
    removeProjectIds = [],
    contactIds,       // the note's full list of people, when the editor changed it
    ownerIds,         // the note's full list of owners (0108), when someone changed it
  } = body;

  // Owners: at least one, and only real staff accounts.
  let owners = null;
  if (Array.isArray(ownerIds)) {
    const ids = [...new Set(ownerIds.filter(x => typeof x === 'string'))];
    const real = await prisma.user.findMany({ where: { id: { in: ids }, role: { not: 'CLIENT_VIEWER' } }, select: { id: true } });
    owners = ids.filter(id => real.some(u => u.id === id));
    if (!owners.length) return NextResponse.json({ error: 'A note needs at least one owner.' }, { status: 400 });
  }

  const data = {};
  if (title        !== undefined) data.title       = title.trim();
  if (noteBody     !== undefined) data.body         = noteBody;
  if (calendarRef  !== undefined) data.calendarRef  = calendarRef || null;
  if (meetingDate  !== undefined) data.meetingDate  = meetingDate ? new Date(meetingDate) : null;
  if (meetingLink  !== undefined) {
    const link = cleanCalendarLink(meetingLink);
    if (link === undefined) return NextResponse.json({ error: 'The calendar link has to be a web address (https://…).' }, { status: 400 });
    data.meetingLink = link;
  }
  if (attendees    !== undefined) {
    data.attendees = typeof attendees === 'string' ? attendees : JSON.stringify(attendees);
  }
  if (activityType !== undefined) {
    data.activityType = activityType;
    data.isInPerson   = isInPersonType(activityType);
    // A person just set this by hand, so the calendar sync must stop deciding it.
    // recordCalendarEvent() reads this and leaves the note alone from here on.
    data.classificationSource     = 'manual';
    data.classificationConfidence = 100;
  }

  // Publish: mark note complete → unlocks automations + updates Contact.lastInPersonAt
  if (publish === true && !note.isPublished) {
    data.isPublished = true;
    data.publishedAt = new Date();
  }
  // Unpublish: revert to draft
  if (publish === false && note.isPublished) {
    data.isPublished = false;
    data.publishedAt = null;
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.note.update({ where: { id: params.id }, data });
      }
      await addNoteLinks(tx, 'client', params.id, addClientIds);
      await removeNoteLinks(tx, 'client', params.id, removeClientIds);
      await addNoteLinks(tx, 'project', params.id, addProjectIds);
      await removeNoteLinks(tx, 'project', params.id, removeProjectIds);
      if (Array.isArray(contactIds)) await setNoteContacts(tx, params.id, contactIds);
    });
  } catch (err) {
    console.error('[PATCH /api/crm/notes] error:', err);
    return NextResponse.json({ error: err?.message || 'Database error' }, { status: 500 });
  }

  // Owners (0108). A step led by someone taken off the note goes back to everyone.
  const hadOwners = ownerIdsOf(note);
  let ownersAdded = [], ownersRemoved = [];
  if (owners) {
    ownersAdded = await addNoteOwners(prisma, params.id, owners, { source: 'manual', addedById: user.id });
    ownersRemoved = hadOwners.filter(id => !owners.includes(id));
    if (ownersRemoved.length) {
      await prisma.noteOwner.deleteMany({ where: { noteId: params.id, userId: { in: ownersRemoved } } });
      await prisma.noteAction.updateMany({ where: { noteId: params.id, leadUserId: { in: ownersRemoved } }, data: { leadUserId: null } });
    }
  }

  // History (0108): who changed what.
  await logNoteChanges(prisma, params.id, user, await changesFor(note, data, {
    addClientIds, removeClientIds, addProjectIds, removeProjectIds, contactIds, ownersAdded, ownersRemoved,
  }));

  // Published and in person → the people on it were met on the meeting date.
  if (publish === true && !note.isPublished) {
    const inPerson = data.isInPerson ?? note.isInPerson;
    if (inPerson) {
      try { await stampLastMet(prisma, params.id, data.meetingDate ?? note.meetingDate); }
      catch (e) { console.error('[notes publish] last-met update failed:', e?.message ?? e); }
    }
  }

  // On first publish, read the next steps out of the words and switch them on
  // (src/lib/notes/publishActions.js). Best-effort: a failed read never blocks publish.
  if (publish === true && !note.isPublished) {
    try { await extractActionsOnPublish(params.id); }
    catch (e) { console.error('[notes publish] action extraction failed:', e?.message ?? e); }

    // Now the note is live → run the bot for every already-confirmed action
    // (compose outreach emails, schedule reminders, fire if-then rules).
    try { await executeNotePublished(params.id); }
    catch (e) { console.error('[notes publish] execution failed:', e?.message ?? e); }
  }

  // Reverted to draft → pause the bot: unsent drafts + reminders go back to draft.
  if (publish === false && note.isPublished) {
    try { await pauseNoteOnUnpublish(params.id); }
    catch (e) { console.error('[notes unpublish] pause failed:', e?.message ?? e); }
  }

  const updated = await prisma.note.findUnique({ where: { id: params.id }, include: NOTE_INCLUDE });
  return NextResponse.json(updated);
}

const day = d => (d ? new Date(d).toISOString().slice(0, 10) : null);
async function namesOf(model, ids) {
  if (!ids?.length) return [];
  return (await prisma[model].findMany({ where: { id: { in: ids } }, select: { name: true } })).map(r => r.name);
}

/** The history lines for one PATCH: plain before/after words, one per change. */
async function changesFor(note, data, links) {
  const out = [];
  const same = (a, b) => String(a ?? '') === String(b ?? '');
  if ('title' in data && !same(data.title, note.title)) out.push({ field: 'title', before: note.title, after: data.title });
  if ('body' in data && !same(data.body, note.body)) out.push({ field: 'body', before: note.body, after: data.body });
  if ('meetingDate' in data && !same(day(data.meetingDate), day(note.meetingDate))) out.push({ field: 'meetingDate', before: day(note.meetingDate), after: day(data.meetingDate) });
  if ('activityType' in data && !same(data.activityType, note.activityType)) out.push({ field: 'activityType', before: note.activityType, after: data.activityType });
  if ('meetingLink' in data && !same(data.meetingLink, note.meetingLink)) out.push({ field: 'meetingLink', before: note.meetingLink, after: data.meetingLink });
  if ('isPublished' in data) out.push({ field: 'published', before: note.isPublished ? 'Published' : 'Draft', after: data.isPublished ? 'Published' : 'Draft' });
  for (const n of await namesOf('client', links.addClientIds)) out.push({ field: 'company', after: n });
  for (const n of await namesOf('client', links.removeClientIds)) out.push({ field: 'company', before: n });
  for (const n of await namesOf('project', links.addProjectIds)) out.push({ field: 'project', after: n });
  for (const n of await namesOf('project', links.removeProjectIds)) out.push({ field: 'project', before: n });
  if (Array.isArray(links.contactIds)) {
    const had = note.contacts.map(c => c.contactId);
    for (const n of await namesOf('contact', links.contactIds.filter(id => !had.includes(id)))) out.push({ field: 'person', after: n });
    for (const n of await namesOf('contact', had.filter(id => !links.contactIds.includes(id)))) out.push({ field: 'person', before: n });
  }
  for (const n of await namesOf('user', links.ownersAdded)) out.push({ field: 'owner', after: n });
  for (const n of await namesOf('user', links.ownersRemoved)) out.push({ field: 'owner', before: n });
  return out;
}

// DELETE /api/crm/notes/[id] — refused. Notes are archived, never deleted
// (Mike, 2026-09-11; reconfirmed 9-25: "just make an archive to forget delete").
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Notes') }, { status: 405 });
}

// POST /api/crm/notes/[id]  { archived: true | false } — archive or restore.
// Anyone signed in (Mike 9-25: "anyone can touch it"). Archiving holds any follow-up emails the note
// queued that have not gone out yet (same as un-publishing it); restoring does
// not send them — publish the note again to re-run its actions.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const note = await prisma.note.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const updated = await prisma.note.update({
    where:   { id: params.id },
    data:    archiveData(archived, user),
    include: NOTE_INCLUDE,
  });
  if (archived) await pauseNoteOnUnpublish(params.id).catch(() => {});
  await logNoteChanges(prisma, params.id, user, [{ field: 'archived', before: archived ? 'Kept' : 'Archived', after: archived ? 'Archived' : 'Kept' }]);

  return NextResponse.json(updated);
}
