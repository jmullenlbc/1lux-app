import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function nextNoteNumber() {
  const max = await prisma.salesNote.aggregate({ _max: { noteNumber: true } });
  return (max._max.noteNumber ?? 0) + 1;
}

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

// GET /api/crm/notes
// Query params: search, clientId, dealId
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search   = searchParams.get('search');
  const clientId = searchParams.get('clientId');
  const dealId   = searchParams.get('dealId');

  const where = {};
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { body:  { contains: search } },
    ];
  }
  if (clientId) where.clients = { some: { clientId } };
  if (dealId)   where.deals   = { some: { dealId } };

  const notes = await prisma.salesNote.findMany({
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
    title = '',
    noteBody = '',
    meetingDate,
    attendees = '[]',
    calendarRef,
    clientIds = [],
    dealIds   = [],
  } = body;

  const noteNumber = await nextNoteNumber();

  const note = await prisma.salesNote.create({
    data: {
      noteNumber,
      title:       title.trim(),
      body:        noteBody,
      meetingDate: meetingDate ? new Date(meetingDate) : null,
      attendees:   typeof attendees === 'string' ? attendees : JSON.stringify(attendees),
      calendarRef: calendarRef || null,
      createdById: user.id,
    },
  });

  if (clientIds.length > 0) {
    await prisma.salesNoteClient.createMany({
      data: clientIds.map(cid => ({ salesNoteId: note.id, clientId: cid })),
      skipDuplicates: true,
    });
  }
  if (dealIds.length > 0) {
    await prisma.salesNoteDeal.createMany({
      data: dealIds.map(did => ({ salesNoteId: note.id, dealId: did })),
      skipDuplicates: true,
    });
  }

  const full = await prisma.salesNote.findUnique({ where: { id: note.id }, include: NOTE_INCLUDE });
  return NextResponse.json(full, { status: 201 });
}
