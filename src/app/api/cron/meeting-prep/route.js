import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { buildMeetingBrief } from '@/lib/meetingPrep/build';
import { prepDueWhere, PREP_PER_RUN, PREP_TIME_BUDGET_MS } from '@/lib/meetingPrep/due';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/meeting-prep — hourly. Builds the Meeting Prep brief for sales
 * meetings coming up in the next two days that have none yet (Mike 9-25: "the
 * prep should happen before the event happens").
 *
 * Each brief is an AI call, and the front door kills a request at ~30s, so one
 * run builds at most PREP_PER_RUN and stops starting new ones after the time
 * budget. Hourly runs catch up. Protected by x-cron-secret; an admin can run it
 * by hand until the EventBridge rule exists.
 */
export async function GET(req) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET;
  if (!isCron) {
    const { user, error } = await requireAuth();
    if (error) return error;
    if (!actsAsAdmin(user)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const due = await prisma.note.findMany({
    where: prepDueWhere(new Date()),
    orderBy: { meetingDate: 'asc' },
    take: PREP_PER_RUN * 3,
    select: { id: true, noteType: true, title: true, meetingDate: true, activityType: true, projectId: true, createdById: true },
  });

  const results = [];
  for (const note of due) {
    if (results.filter(r => r.briefId).length >= PREP_PER_RUN) break;
    if (Date.now() - started > PREP_TIME_BUDGET_MS) break;
    try {
      const out = await buildMeetingBrief(prisma, note, { userId: note.createdById });
      results.push({ noteId: note.id, ...out });
    } catch (e) {
      console.error('[cron/meeting-prep] failed on', note.id, e?.message ?? e);
      results.push({ noteId: note.id, error: 'failed' });
    }
  }
  return NextResponse.json({ ok: true, due: due.length, results });
}
