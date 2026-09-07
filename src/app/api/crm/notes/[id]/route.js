import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { extractNoteActions } from '@/lib/bot/extractNoteActions';
import { getActiveActionTypes } from '@/lib/noteActionTypesStore';
import { executeNotePublished, pauseNoteOnUnpublish } from '@/lib/bot/noteActionRunner';
// Which activity types count as in person lives in one place now — shared with
// the note-create route and the calendar sync.
import { isInPersonType } from '@/lib/calendar/inPerson';

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
    title, noteBody, meetingDate, attendees, calendarRef,
    activityType,
    publish,          // true = mark complete (enable automations); false = revert to draft
    addClientIds    = [],
    removeClientIds = [],
    addProjectIds   = [],
    removeProjectIds = [],
  } = body;

  const data = {};
  if (title        !== undefined) data.title       = title.trim();
  if (noteBody     !== undefined) data.body         = noteBody;
  if (calendarRef  !== undefined) data.calendarRef  = calendarRef || null;
  if (meetingDate  !== undefined) data.meetingDate  = meetingDate ? new Date(meetingDate) : null;
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
    // Update Contact.lastInPersonAt for linked contacts if in-person
    const noteIsInPerson = data.isInPerson ?? note.isInPerson;
    const noteMeetingDate = data.meetingDate ?? note.meetingDate;
    if (noteIsInPerson && noteMeetingDate) {
      const linkedContacts = await prisma.noteContact.findMany({
        where:  { noteId: params.id },
        select: { contactId: true },
      });
      for (const { contactId } of linkedContacts) {
        const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { lastInPersonAt: true } });
        if (!c?.lastInPersonAt || c.lastInPersonAt < new Date(noteMeetingDate)) {
          await prisma.contact.update({
            where: { id: contactId },
            data:  { lastInPersonAt: new Date(noteMeetingDate), lastTouchpointAt: new Date(noteMeetingDate) },
          });
        }
      }
    }
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
      if (addClientIds.length > 0) {
        await tx.noteClient.createMany({
          data: addClientIds.map(cid => ({ noteId: params.id, clientId: cid })),
          skipDuplicates: true,
        });
      }
      if (removeClientIds.length > 0) {
        await tx.noteClient.deleteMany({
          where: { noteId: params.id, clientId: { in: removeClientIds } },
        });
      }
      if (addProjectIds.length > 0) {
        await tx.noteProject.createMany({
          data: addProjectIds.map(pid => ({ noteId: params.id, projectId: pid })),
          skipDuplicates: true,
        });
      }
      if (removeProjectIds.length > 0) {
        await tx.noteProject.deleteMany({
          where: { noteId: params.id, projectId: { in: removeProjectIds } },
        });
      }
    });
  } catch (err) {
    console.error('[PATCH /api/crm/notes] error:', err);
    return NextResponse.json({ error: err?.message || 'Database error' }, { status: 500 });
  }

  // On first publish, extract structured actions from the note's prose (best-effort).
  if (publish === true && !note.isPublished) {
    try {
      const existing = await prisma.noteAction.count({ where: { noteId: params.id } });
      if (existing === 0) {
        const full = await prisma.note.findUnique({
          where: { id: params.id },
          include: {
            contacts: { include: { contact: { select: { id: true, name: true } } } },
            clients:  { include: { client: { include: { contacts: { select: { id: true, name: true } } } } } },
          },
        });
        const cand = new Map();
        for (const c of full.contacts) if (c.contact) cand.set(c.contact.id, c.contact);
        for (const cl of full.clients) for (const c of (cl.client?.contacts || [])) cand.set(c.id, c);
        const actionTypes = await getActiveActionTypes();
        const extracted = await extractNoteActions(full, [...cand.values()], actionTypes);
        if (extracted.length) {
          await prisma.noteAction.createMany({ data: extracted.map(a => ({ ...a, noteId: params.id })) });
        }
      }
    } catch (e) { console.error('[notes publish] action extraction failed:', e?.message ?? e); }

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

// DELETE /api/crm/notes/[id]
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const isAdmin = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(user.role);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const note = await prisma.note.findUnique({ where: { id: params.id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.note.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
