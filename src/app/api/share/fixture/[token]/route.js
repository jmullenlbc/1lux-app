import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { publicFixtureItem, cleanShareEdit } from '@/lib/share/fixtureShare';
import { brandForProject } from '@/lib/brandServer';

// Public endpoint, no auth required
// GET /api/share/fixture/[token]
// Returns the fixture schedule (draft items + project info) for the share token.
// Only the allowlisted columns leave the building, see src/lib/share/fixtureShare.js.

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
    brand:     await brandForProject(share.projectId),
    schedule:  { items: (schedule?.items ?? []).map(publicFixtureItem) },
  });
}

// PATCH, save a cell edit (only for 'edit' permission links)
export async function PATCH(req, { params }) {
  const { token } = params;

  const share = await prisma.fixtureScheduleShare.findUnique({ where: { token } });
  if (!share || share.permission !== 'edit') {
    return NextResponse.json({ error: 'Not authorized to edit via this link' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { itemId, field, value } = body;
  if (!itemId || !field) return NextResponse.json({ error: 'itemId and field required' }, { status: 400 });

  const edit = cleanShareEdit(field, value);
  if (edit.error) return NextResponse.json({ error: edit.error }, { status: 400 });

  // The row must be on THIS link's job, in the draft schedule the link shows.
  const item = await prisma.fixtureScheduleItem.findFirst({
    where:  { id: itemId, schedule: { projectId: share.projectId, state: 'DRAFT' } },
    select: { id: true },
  });
  if (!item) return NextResponse.json({ error: 'That fixture isn’t on this shared schedule' }, { status: 404 });

  const updated = await prisma.fixtureScheduleItem.update({
    where: { id: item.id },
    data:  edit.data,
  });

  return NextResponse.json(publicFixtureItem(updated));
}
