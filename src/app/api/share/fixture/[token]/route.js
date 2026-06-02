import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Public endpoint — no auth required
// GET /api/share/fixture/[token]
// Returns the fixture schedule (draft items + project info) for the share token

export async function GET(req, { params }) {
  const { token } = params;

  const share = await prisma.fixtureScheduleShare.findUnique({
    where: { token },
    include: { project: { select: { id: true, name: true, buildingType: true, city: true, state: true } } },
  });

  if (!share) {
    return NextResponse.json({ error: 'Share link not found or expired' }, { status: 404 });
  }

  // Load the draft fixture schedule
  const schedule = await prisma.fixtureSchedule.findFirst({
    where: { projectId: share.projectId, state: 'DRAFT' },
    include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  });

  // Track last viewed
  await prisma.fixtureScheduleShare.update({
    where: { id: share.id },
    data: { lastViewedAt: new Date() },
  }).catch(() => {});

  return NextResponse.json({
    permission: share.permission,
    project:   share.project,
    schedule:  schedule ? { items: schedule.items } : { items: [] },
  });
}

// PATCH — save a cell edit (only for 'edit' permission links)
export async function PATCH(req, { params }) {
  const { token } = params;

  const share = await prisma.fixtureScheduleShare.findUnique({ where: { token } });
  if (!share || share.permission !== 'edit') {
    return NextResponse.json({ error: 'Not authorized to edit via this link' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { itemId, field, value } = body;
  if (!itemId || !field) return NextResponse.json({ error: 'itemId and field required' }, { status: 400 });

  const updated = await prisma.fixtureScheduleItem.update({
    where: { id: itemId },
    data: { [field]: value ?? null },
  });

  return NextResponse.json(updated);
}
