import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendNotification } from '@/lib/notify';
import { toMeetingNote } from '../route';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return canSeeAllData(user) || project.createdById === user.id;
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { title, content, meetingDate, meetingLink, attendees, isExternalVisible } = body;

  const prev = await prisma.note.findUnique({ where: { id: params.noteId }, select: { isExternalVisible: true } });

  const data = {};
  if (title             !== undefined) data.title             = title;
  if (content           !== undefined) data.body              = content;
  if (meetingDate       !== undefined) data.meetingDate       = meetingDate ? new Date(meetingDate) : null;
  if (meetingLink       !== undefined) data.meetingLink       = meetingLink || null;
  if (attendees         !== undefined)
    data.attendees = typeof attendees === 'string'
      ? attendees
      : JSON.stringify(attendees || []);
  if (isExternalVisible !== undefined) data.isExternalVisible = !!isExternalVisible;

  const updated = await prisma.note.update({ where: { id: params.noteId }, data });

  if (!prev?.isExternalVisible && isExternalVisible === true) {
    sendNotification(params.id, 'MEETING_NOTE', { noteId: params.noteId, title: updated.title, meetingDate: updated.meetingDate }).catch(() => {});
  }

  return NextResponse.json({ note: toMeetingNote(updated) });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.note.delete({ where: { id: params.noteId } });
  return NextResponse.json({ success: true });
}
