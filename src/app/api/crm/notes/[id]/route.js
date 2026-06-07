import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const NOTE_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  clients: {
    include: { client: { select: { id: true, clientNumber: true, name: true, type: true } } },
    orderBy: { createdAt: 'asc' },
  },
  deals: {
    include: {
      deal: {
        select: { id: true, dealNumber: true, title: true, pipeline: true, stage: true, dealStatus: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
};

// GET /api/crm/notes/[id]
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const note = await prisma.salesNote.findUnique({ where: { id: params.id }, include: NOTE_INCLUDE });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(note);
}

// PATCH /api/crm/notes/[id]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const note = await prisma.salesNote.findUnique({ where: { id: params.id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const {
    title, noteBody, meetingDate, attendees, calendarRef,
    activityType,
    publish,          // true = mark complete (enable automations); false = revert to draft
    addClientIds    = [],
    removeClientIds = [],
    addDealIds      = [],
    removeDealIds   = [],
  } = body;

  const IN_PERSON_TYPES = new Set(['COFFEE','LUNCH','HAPPY_HOUR','GOLF','SITE_VISIT']);

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
    data.isInPerson   = IN_PERSON_TYPES.has(activityType);
  }

  // Publish: mark note complete → unlocks automations + updates Contact.lastInPersonAt
  if (publish === true && !note.isPublished) {
    data.isPublished = true;
    data.publishedAt = new Date();
    // Update Contact.lastInPersonAt for linked contacts if in-person
    const noteIsInPerson = data.isInPerson ?? note.isInPerson;
    const noteMeetingDate = data.meetingDate ?? note.meetingDate;
    if (noteIsInPerson && noteMeetingDate) {
      const linkedContacts = await prisma.salesNoteContact.findMany({
        where:  { salesNoteId: params.id },
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
        await tx.salesNote.update({ where: { id: params.id }, data });
      }
      if (addClientIds.length > 0) {
        await tx.salesNoteClient.createMany({
          data: addClientIds.map(cid => ({ salesNoteId: params.id, clientId: cid })),
          skipDuplicates: true,
        });
      }
      if (removeClientIds.length > 0) {
        await tx.salesNoteClient.deleteMany({
          where: { salesNoteId: params.id, clientId: { in: removeClientIds } },
        });
      }
      if (addDealIds.length > 0) {
        await tx.salesNoteDeal.createMany({
          data: addDealIds.map(did => ({ salesNoteId: params.id, dealId: did })),
          skipDuplicates: true,
        });
      }
      if (removeDealIds.length > 0) {
        await tx.salesNoteDeal.deleteMany({
          where: { salesNoteId: params.id, dealId: { in: removeDealIds } },
        });
      }
    });
  } catch (err) {
    console.error('[PATCH /api/crm/notes] error:', err);
    return NextResponse.json({ error: err?.message || 'Database error' }, { status: 500 });
  }

  const updated = await prisma.salesNote.findUnique({ where: { id: params.id }, include: NOTE_INCLUDE });
  return NextResponse.json(updated);
}

// DELETE /api/crm/notes/[id]
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const isAdmin = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(user.role);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const note = await prisma.salesNote.findUnique({ where: { id: params.id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.salesNote.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
