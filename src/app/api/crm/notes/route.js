import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { addNoteLinks, NOTE_CONTACTS_INCLUDE } from '@/lib/noteLinks';
// Which activity types count as in person lives in one place now, so this route,
// the note PATCH route and the calendar sync can never drift apart.
import { isInPersonType } from '@/lib/calendar/inPerson';
import { cleanCalendarLink } from '@/lib/calendar/salesOwner';
import { addNoteOwners } from '@/lib/notes/owners';

async function nextNoteNumber() {
  const max = await prisma.note.aggregate({ where: { noteType: 'SALES' }, _max: { noteNumber: true } });
  return (max._max.noteNumber ?? 0) + 1;
}

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

// GET /api/crm/notes. Query params: search, clientId, projectId, contactId,
// published=1 (only published notes; the client and person profile pages use it).
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search    = searchParams.get('search');
  const clientId  = searchParams.get('clientId');
  const projectId = searchParams.get('projectId');
  const contactId = searchParams.get('contactId');
  const published = searchParams.get('published');

  const where = { noteType: 'SALES' };
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { body:  { contains: search } },
    ];
  }
  if (clientId)  where.clients  = { some: { clientId } };
  if (projectId) where.projects = { some: { projectId } };
  if (contactId) where.contacts = { some: { contactId } };
  if (published === '1' || published === 'true') where.isPublished = true;

  const notes = await prisma.note.findMany({
    where,
    orderBy: [{ meetingDate: 'desc' }, { updatedAt: 'desc' }],
    include: NOTE_INCLUDE,
  });

  return NextResponse.json({ notes });
}

// POST /api/crm/notes
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const {
    title        = '',
    noteBody     = '',
    meetingDate,
    attendees    = '[]',
    calendarRef,
    meetingLink,
    clientIds    = [],
    projectIds   = [],
    activityType,
    contactIds   = [],
    ownerIds     = [],
  } = body;

  const link = cleanCalendarLink(meetingLink);
  if (link === undefined) return NextResponse.json({ error: 'The calendar link has to be a web address (https://…).' }, { status: 400 });

  // An empty draft is fine — the "New" button starts one and the editor fills it in.
  const isInPerson = isInPersonType(activityType);
  const noteNumber = await nextNoteNumber();

  const note = await prisma.note.create({
    data: {
      noteType:     'SALES',
      noteNumber,
      title:        title.trim(),
      body:         noteBody,
      meetingDate:  meetingDate ? new Date(meetingDate) : null,
      attendees:    typeof attendees === 'string' ? attendees : JSON.stringify(attendees),
      calendarRef:  calendarRef  || null,
      meetingLink:  link,
      activityType: activityType || null,
      isInPerson,
      createdById:  user.id,
    },
  });

  // The person writing it owns it; anyone else picked shares it (0108).
  await addNoteOwners(prisma, note.id, [user.id], { source: 'creator', addedById: user.id });
  await addNoteOwners(prisma, note.id, ownerIds, { source: 'manual', addedById: user.id });
  await addNoteLinks(prisma, 'client',  note.id, clientIds);
  await addNoteLinks(prisma, 'project', note.id, projectIds);
  await addNoteLinks(prisma, 'contact', note.id, contactIds);
  // "Last met" dates move only when the note is published, never on a draft.

  const full = await prisma.note.findUnique({ where: { id: note.id }, include: NOTE_INCLUDE });
  return NextResponse.json(full, { status: 201 });
}
