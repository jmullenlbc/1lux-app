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
  const notes = await prisma.$queryRawUnsafe(
    `SELECT id, title, content, meetingDate, attendees, createdAt, updatedAt
     FROM "MeetingNote"
     WHERE "projectId" = ? AND "isExternalVisible" = 1
     ORDER BY "createdAt" DESC`,
    params.id
  );

  return NextResponse.json({ notes });
}
