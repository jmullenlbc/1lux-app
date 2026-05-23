import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendNotification } from '@/lib/notify';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return user.role === 'ILC_ADMIN' || project.createdById === user.id;
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { title, content, meetingDate, meetingLink, attendees, isExternalVisible } = body;
  const now = new Date().toISOString();

  // Fetch previous state to detect isExternalVisible flip
  const [prev] = await prisma.$queryRawUnsafe(
    `SELECT isExternalVisible FROM "MeetingNote" WHERE id = ?`, params.noteId
  );

  // Build SET clause dynamically — only update fields that were sent
  const sets = ['"updatedAt" = ?'];
  const vals = [now];

  if (title             !== undefined) { sets.push('"title" = ?');             vals.push(title); }
  if (content           !== undefined) { sets.push('"content" = ?');           vals.push(content); }
  if (meetingDate       !== undefined) { sets.push('"meetingDate" = ?');       vals.push(meetingDate); }
  if (meetingLink       !== undefined) { sets.push('"meetingLink" = ?');       vals.push(meetingLink); }
  if (attendees         !== undefined) { sets.push('"attendees" = ?');         vals.push(attendees); }
  if (isExternalVisible !== undefined) { sets.push('"isExternalVisible" = ?'); vals.push(isExternalVisible ? 1 : 0); }

  vals.push(params.noteId);

  await prisma.$executeRawUnsafe(
    `UPDATE "MeetingNote" SET ${sets.join(', ')} WHERE id = ?`,
    ...vals
  );

  const [note] = await prisma.$queryRawUnsafe(
    `SELECT id, projectId, title, content, meetingDate, meetingLink, attendees, isExternalVisible, createdAt, updatedAt
     FROM "MeetingNote" WHERE id = ?`,
    params.noteId
  );

  // Fire notification when isExternalVisible is toggled ON for the first time
  const wasExternal = prev?.isExternalVisible === 1 || prev?.isExternalVisible === true;
  const isNowExternal = isExternalVisible === true;
  if (!wasExternal && isNowExternal) {
    sendNotification(params.id, 'MEETING_NOTE', { noteId: params.noteId, title: note.title, meetingDate: note.meetingDate }).catch(() => {});
  }

  return NextResponse.json({ note });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$executeRawUnsafe(
    `DELETE FROM "MeetingNote" WHERE id = ?`,
    params.noteId
  );

  return NextResponse.json({ success: true });
}
