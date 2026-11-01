import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { publishIfDueSafely, publishSchedule } from '@/lib/shipSchedulePublish';

const NOT_ALLOWED = 'Only a Project Manager on this job or an admin can publish the Ship Schedule. Nothing changed. Tick your name under Project Managers on the job, or ask an admin.';

async function canPublish(projectId, user) {
  if (isAnyAdmin(user.role)) return true;
  const pm = await prisma.projectAssignee.findFirst({
    where:  { projectId, userId: user.id, isPm: true },
    select: { id: true },
  });
  return !!pm;
}

// GET /api/projects/[id]/ship-schedule/publish
// What clients see now, and the automatic date. Opening this runs a due date.
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canSeeAllData(user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await publishIfDueSafely(prisma, params.id);

  const [project, last, allowed] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.id }, select: { shipAutoPublishAt: true } }),
    prisma.shipSchedulePublish.findFirst({
      where:   { projectId: params.id },
      orderBy: { publishedAt: 'desc' },
      select:  {
        publishedAt: true,
        how:         true,
        publishedBy: { select: { name: true } },
        _count:      { select: { lines: true } },
      },
    }),
    canPublish(params.id, user),
  ]);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    canPublish:      allowed,
    autoPublishDate: project.shipAutoPublishAt?.toISOString().slice(0, 10) ?? null,
    last: last && {
      publishedAt: last.publishedAt,
      how:         last.how,
      by:          last.publishedBy?.name ?? null,
      lines:       last._count.lines,
    },
  });
}

// POST /api/projects/[id]/ship-schedule/publish
// Copies the live schedule to the client portal now.
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canPublish(params.id, user)) return NextResponse.json({ error: NOT_ALLOWED }, { status: 403 });

  const publish = await publishSchedule(prisma, params.id, user.id);
  if (!publish) {
    return NextResponse.json({ error: 'Nothing to publish: this job has no Ship Schedule lines yet. Clients still see the last published copy.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, publish }, { status: 201 });
}

// PATCH /api/projects/[id]/ship-schedule/publish
// Body: { autoPublishDate: 'YYYY-MM-DD' | null }
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canPublish(params.id, user)) return NextResponse.json({ error: NOT_ALLOWED }, { status: 403 });

  const { autoPublishDate } = await req.json().catch(() => ({}));
  if (autoPublishDate && !/^\d{4}-\d{2}-\d{2}$/.test(autoPublishDate)) {
    return NextResponse.json({ error: 'That is not a date we can read. The automatic date did not change. Pick one from the calendar.' }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (autoPublishDate && autoPublishDate < today) {
    return NextResponse.json({ error: 'That date has passed. The automatic date did not change. Pick today or later.' }, { status: 400 });
  }

  // Noon UTC so the date is the same calendar day in every US time zone.
  await prisma.project.update({
    where: { id: params.id },
    data:  { shipAutoPublishAt: autoPublishDate ? new Date(`${autoPublishDate}T12:00:00Z`) : null },
  });
  return NextResponse.json({ ok: true, autoPublishDate: autoPublishDate || null });
}
