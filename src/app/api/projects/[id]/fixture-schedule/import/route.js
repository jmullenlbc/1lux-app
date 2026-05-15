import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const ITEM_ORDERBY = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];
const SCHEDULE_INCLUDE = {
  items: { orderBy: ITEM_ORDERBY },
  publishedBy: { select: { id: true, name: true } },
};

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

// POST /api/projects/[id]/fixture-schedule/import
// Body: { mode: 'replace' | 'merge', items: [{ type, location, description, ... }] }
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { mode = 'merge', items = [] } = await request.json();

  const draft = await getOrCreateDraft(params.id);

  if (mode === 'replace') {
    await prisma.fixtureScheduleItem.deleteMany({ where: { scheduleId: draft.id } });
  }

  const existing = mode === 'replace' ? [] : draft.items;
  const startOrder = existing.length > 0 ? Math.max(...existing.map(i => i.sortOrder)) + 1 : 0;

  const ALLOWED_FIELDS = [
    'type', 'location', 'description', 'manufacturer', 'catalogNumber',
    'finish', 'cct', 'lumens', 'wattage', 'voltage', 'dimming', 'mounting', 'notes', 'internalNotes',
  ];

  const created = await prisma.$transaction(
    items.map((row, idx) => {
      const data = { scheduleId: draft.id, sortOrder: startOrder + idx };
      for (const f of ALLOWED_FIELDS) {
        data[f] = row[f] != null && row[f] !== '' ? String(row[f]).trim() : (
          ['type', 'location', 'description'].includes(f) ? '' : null
        );
      }
      return prisma.fixtureScheduleItem.create({ data });
    })
  );

  const updatedDraft = await prisma.fixtureSchedule.findUnique({
    where: { id: draft.id },
    include: SCHEDULE_INCLUDE,
  });

  return NextResponse.json({ draft: updatedDraft, imported: created.length });
}
