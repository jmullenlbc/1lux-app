import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { draftReminderWhere } from '@/lib/calendar/draftReminder';

// GET /api/crm/notes/drafts-reminder, how many of MY calendar meetings are
// still waiting for their note to be published. Feeds the banner and the
// sidebar badge, which never go away until this count is zero.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const where = draftReminderWhere(user.id);
  const [count, oldest] = await Promise.all([
    prisma.note.count({ where }),
    prisma.note.findFirst({
      where,
      orderBy: { meetingDate: { sort: 'asc', nulls: 'last' } },
      select:  { meetingDate: true },
    }),
  ]);

  return NextResponse.json({ count, oldestMeetingDate: oldest?.meetingDate ?? null });
}
