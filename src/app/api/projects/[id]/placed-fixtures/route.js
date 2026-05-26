import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const FIXTURE_INCLUDE = {};

// GET /api/projects/[id]/placed-fixtures?drawingId=<DrawingFile.id>
export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const drawingId = searchParams.get('drawingId');

  const where = {
    projectId: params.id,
    status:    { not: 'DELETED' },
    ...(drawingId ? { drawing_id: drawingId } : {}),
  };

  const fixtures = await prisma.placedFixture.findMany({
    where,
    include:  FIXTURE_INCLUDE,
    orderBy:  { createdAt: 'asc' },
  });

  return NextResponse.json(fixtures);
}

// POST /api/projects/[id]/placed-fixtures
// Body: { drawing_id, page_number?, x, y, x2?, y2?, master_type_id, symbol_id?, toolset?,
//         length_inches?, scale_ratio?, unit_type?, room_type?, note? }
export async function POST(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const {
    drawing_id, page_number = 1,
    x, y, x2, y2,
    master_type_id, symbol_id, toolset,
    length_inches, scale_ratio,
    unit_type, room_type, note,
  } = body;

  if (!drawing_id || x == null || y == null || !master_type_id) {
    return NextResponse.json({ error: 'drawing_id, x, y, master_type_id required' }, { status: 400 });
  }

  // Verify drawing file belongs to this project
  const drawingFile = await prisma.drawingFile.findFirst({
    where: { id: drawing_id, submission: { projectId: params.id } },
  });
  if (!drawingFile) return NextResponse.json({ error: 'Drawing file not found' }, { status: 404 });

  const fixture = await prisma.placedFixture.create({
    data: {
      drawing_id,
      projectId:     params.id,
      page_number:   parseInt(page_number, 10),
      x,
      y,
      x2:            x2             ?? null,
      y2:            y2             ?? null,
      master_type_id,
      symbol_id:     symbol_id      ?? null,
      toolset:       toolset        ?? null,
      length_inches: length_inches  ?? null,
      scale_ratio:   scale_ratio    ?? null,
      unit_type:     unit_type      ?? null,
      room_type:     room_type      ?? null,
      note:          note           ?? null,
      status:        'SUGGESTED',
    },
  });

  return NextResponse.json(fixture, { status: 201 });
}
