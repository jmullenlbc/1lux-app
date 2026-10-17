import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/crm/notes/upcoming
// Returns sales notes with meetingDate in the next 14 days, ordered by date asc.
// Used for the "Upcoming, Next 2 Weeks" widget on the Sales Activity page.
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const now   = new Date();
  const end   = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const raw = await prisma.note.findMany({
    where: {
      noteType: 'SALES',
      meetingDate: { gte: now, lte: end },
      activityType: { not: null },
    },
    orderBy: { meetingDate: 'asc' },
    take: 50,  // fetch more, then dedupe
    include: {
      createdBy: { select: { id: true, name: true } },
      clients:   { include: { client:  { select: { id: true, name: true } } } },
      projects:  { include: { project: { select: { id: true, name: true } } } },
      contacts:  { include: { contact: { select: { id: true, name: true } } } },
    },
  });

  // Deduplicate: same title on the same calendar day → keep first occurrence only
  const seen  = new Set();
  const notes = raw.filter(n => {
    const dateKey = n.meetingDate ? n.meetingDate.toISOString().slice(0, 10) : 'none';
    const key     = n.title.trim().toLowerCase() + '|' + dateKey;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);

  return NextResponse.json({ notes });
}
