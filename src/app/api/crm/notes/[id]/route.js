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

const NOTE_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
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

  const note = await prisma.note.findUnique({ where: { id: params.id } });
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
  } = body;

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

  return NextResponse.json(updated);
}
