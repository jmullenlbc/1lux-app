import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';

export async function GET(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await prisma.projectExternalContact.findFirst({
    where: { project_id: params.id, portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
  });
  if (!contact?.canViewMeetings) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Only return notes explicitly marked as visible to external contacts
  const rows = await prisma.note.findMany({
    where:   { noteType: 'PROJECT_MEETING', projectId: params.id, isExternalVisible: true },
    orderBy: { createdAt: 'desc' },
    select:  { id: true, title: true, body: true, meetingDate: true, attendees: true, createdAt: true, updatedAt: true },
  });
  const notes = rows.map(n => ({
    id: n.id, title: n.title, content: n.body, meetingDate: n.meetingDate,
    attendees: n.attendees === '[]' ? null : n.attendees, createdAt: n.createdAt, updatedAt: n.updatedAt,
  }));

  return NextResponse.json({ notes });
}
