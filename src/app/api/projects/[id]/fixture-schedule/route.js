import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const ITEM_ORDERBY = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

const SCHEDULE_INCLUDE = {
  items: { orderBy: ITEM_ORDERBY },
  publishedBy: { select: { id: true, name: true } },
};

// Ensure a DRAFT schedule exists for this project, create if missing
async function getOrCreateDraft(projectId) {
  let draft = await prisma.fixtureSchedule.findFirst({
    where: { projectId, state: 'DRAFT' },
    include: SCHEDULE_INCLUDE,
  });
  if (!draft) {
    draft = await prisma.fixtureSchedule.create({
      data: { projectId, state: 'DRAFT', version: 0 },
      include: SCHEDULE_INCLUDE,
    });
  }
  return draft;
}

// GET /api/projects/[id]/fixture-schedule
// Returns: { draft, published: [...] }
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const draft = await getOrCreateDraft(params.id);

  const published = await prisma.fixtureSchedule.findMany({
    where: { projectId: params.id, state: 'PUBLISHED' },
    orderBy: { version: 'desc' },
    include: SCHEDULE_INCLUDE,
  });

  return NextResponse.json({ draft, published });
}

// POST /api/projects/[id]/fixture-schedule/items — add a row
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const draft = await getOrCreateDraft(params.id);
  const body  = await request.json();
  const { type = '', location = '', description = '', manufacturer, catalogNumber,
          finish, cct, lumens, wattage, voltage, dimming, mounting, notes, internalNotes,
          isAlternate, alternateOf, sortOrder } = body;

  // sortOrder defaults to end of list
  const maxOrder = draft.items.length > 0
    ? Math.max(...draft.items.map(i => i.sortOrder))
    : -1;

  const item = await prisma.fixtureScheduleItem.create({
    data: {
      scheduleId: draft.id,
      type, location, description,
      manufacturer:  manufacturer  || null,
      catalogNumber: catalogNumber || null,
      finish:        finish        || null,
      cct:           cct           || null,
      lumens:        lumens        || null,
      wattage:       wattage       || null,
      voltage:       voltage       || null,
      dimming:       dimming       || null,
      mounting:      mounting      || null,
      notes:         notes         || null,
      internalNotes: internalNotes || null,
      isAlternate:   Boolean(isAlternate) || false,
      alternateOf:   alternateOf   || null,
      sortOrder:     sortOrder     != null ? Number(sortOrder) : maxOrder + 1,
    },
  });

  return NextResponse.json(item, { status: 201 });
}

// PATCH /api/projects/[id]/fixture-schedule
// Body: { reorder: [{ id, sortOrder }] }
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();

  if (body.reorder && Array.isArray(body.reorder)) {
    await Promise.all(
      body.reorder.map(({ id, sortOrder }) =>
        prisma.fixtureScheduleItem.update({ where: { id }, data: { sortOrder: Number(sortOrder) } })
      )
    );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown operation' }, { status: 400 });
}
