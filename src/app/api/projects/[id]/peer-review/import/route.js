import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/projects/[id]/peer-review/import
// Body: { items: [{ typeCode, description, manufacturer, catalogNumber, watts, section }] }
// Batch-creates PeerReviewItems from a parsed fixture schedule.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { items } = await request.json();
  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ error: 'No items provided' }, { status: 400 });

  // Get current max sortOrder per section to append after existing rows
  const existing = await prisma.peerReviewItem.findMany({
    where:  { projectId: params.id },
    select: { section: true, sortOrder: true },
  });
  const maxBySection = {};
  for (const row of existing) {
    if ((row.sortOrder ?? 0) > (maxBySection[row.section] ?? -1))
      maxBySection[row.section] = row.sortOrder;
  }

  const rows = items.map((item, idx) => {
    const section = item.section || 'other';
    const base    = (maxBySection[section] ?? -1) + 1;
    maxBySection[section] = base + idx; // increment for subsequent same-section items
    return {
      projectId:        params.id,
      section,
      typeCode:         item.typeCode    || null,
      description:      item.description || null,
      specManufacturer: item.manufacturer  || null,
      specModel:        item.catalogNumber || null,
      specDetails:      item.watts != null ? `${item.watts}W` : null,
      qtyType:          'unit',
      sortOrder:        base,
      location:         '',
      notes:            '',
    };
  });

  await prisma.peerReviewItem.createMany({ data: rows });

  // Return fresh item list
  const allItems = await prisma.peerReviewItem.findMany({
    where:   { projectId: params.id },
    orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
  });

  return NextResponse.json({ imported: rows.length, items: allItems }, { status: 201 });
}
