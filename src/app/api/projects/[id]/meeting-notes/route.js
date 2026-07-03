import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendNotification } from '@/lib/notify';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return user.role === 'ILC_ADMIN' || project.createdById === user.id;
}

// Project meeting notes live in the unified Note table (noteType='PROJECT_MEETING').
// The API preserves the meeting-note shape (content ↔ body) so the UI is unchanged.
export function toMeetingNote(n) {
  return {
    id: n.id, projectId: n.projectId, title: n.title, content: n.body,
    meetingDate: n.meetingDate, meetingLink: n.meetingLink,
    attendees: n.attendees === '[]' ? null : n.attendees,
    isExternalVisible: n.isExternalVisible, createdAt: n.createdAt, updatedAt: n.updatedAt,
  };
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rows = await prisma.note.findMany({
    where:   { noteType: 'PROJECT_MEETING', projectId: params.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ notes: rows.map(toMeetingNote) });
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const {
    title             = '',
    content           = '',
    meetingDate       = null,
    meetingLink       = null,
    attendees         = null,
    isExternalVisible = false,
  } = body;

  const created = await prisma.note.create({
    data: {
      noteType:          'PROJECT_MEETING',
      projectId:         params.id,
      title,
      body:              content,
      meetingDate:       meetingDate ? new Date(meetingDate) : null,
      meetingLink:       meetingLink || null,
      attendees:         attendees ? (typeof attendees === 'string' ? attendees : JSON.stringify(attendees)) : '[]',
      isExternalVisible: !!isExternalVisible,
      createdById:       user.id,
    },
  });

  if (isExternalVisible) {
    sendNotification(params.id, 'MEETING_NOTE', { noteId: created.id, title, meetingDate }).catch(() => {});
  }

  return NextResponse.json({ note: toMeetingNote(created) }, { status: 201 });
}
