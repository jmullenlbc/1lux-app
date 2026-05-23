import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/[id]/placed-fixtures?drawingId=xxx
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const drawingId = searchParams.get('drawingId');

  const where = {
    projectId: params.id,
    status: { not: 'DELETED' },
    ...(drawingId ? { drawing_id: drawingId } : {}),
  };

  const fixtures = await prisma.placedFixture.findMany({
    where,
    include: { masterType: { select: { code: true, fixture_family: true, symbol_svg: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(fixtures);
}

// POST /api/projects/[id]/placed-fixtures
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { drawing_id, page_number = 1, x, y, master_type_id, unit_type, room_type, note } = body;

  if (!drawing_id || x == null || y == null || !master_type_id) {
    return NextResponse.json({ error: 'drawing_id, x, y, master_type_id required' }, { status: 400 });
  }

  const masterType = await prisma.masterType.findUnique({ where: { id: master_type_id }, select: { id: true } });
  if (!masterType) {
    return NextResponse.json({ error: 'Invalid master_type_id' }, { status: 400 });
  }

  const fixture = await prisma.placedFixture.create({
    data: {
      drawing_id,
      projectId: params.id,
      page_number,
      x,
      y,
      master_type_id,
      unit_type: unit_type ?? null,
      room_type: room_type ?? null,
      note: note ?? null,
      status: 'SUGGESTED',
    },
    include: { masterType: { select: { code: true, fixture_family: true, symbol_svg: true } } },
  });

  return NextResponse.json(fixture, { status: 201 });
}
