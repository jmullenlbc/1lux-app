import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/[id]/annotations?drawingId=<id>&page=<n>
export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const drawingId = searchParams.get('drawingId');
  const page      = searchParams.get('page');

  const where = {
    projectId: params.id,
    ...(drawingId ? { drawing_id: drawingId } : {}),
    ...(page      ? { page_number: parseInt(page, 10) } : {}),
  };

  const annotations = await prisma.markupAnnotation.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(annotations);
}

// POST /api/projects/[id]/annotations
// Body: { drawing_id, page_number?, annotation_type, tool_id, x, y, x2?, y2?,
//         width?, height?, rotation?, text_content?, scale_factor?, metadata? }
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const {
    drawing_id, page_number = 1, annotation_type, tool_id,
    x, y, x2, y2, width, height,
    rotation = 0, text_content, scale_factor, metadata,
  } = body;

  if (!drawing_id || !annotation_type || !tool_id || x == null || y == null) {
    return NextResponse.json(
      { error: 'drawing_id, annotation_type, tool_id, x, y are required' },
      { status: 400 }
    );
  }

  // Verify drawing belongs to this project
  const drawingFile = await prisma.drawingFile.findFirst({
    where: { id: drawing_id, submission: { projectId: params.id } },
  });
  if (!drawingFile) {
    return NextResponse.json({ error: 'Drawing file not found' }, { status: 404 });
  }

  const annotation = await prisma.markupAnnotation.create({
    data: {
      projectId:       params.id,
      drawing_id,
      page_number:     parseInt(page_number, 10),
      annotation_type,
      tool_id,
      x,
      y,
      x2:              x2      ?? null,
      y2:              y2      ?? null,
      width:           width   ?? null,
      height:          height  ?? null,
      rotation,
      text_content:    text_content  ?? null,
      scale_factor:    scale_factor  ?? null,
      metadata:        metadata ? JSON.stringify(metadata) : null,
      placedById:      user.id,
    },
  });

  return NextResponse.json(annotation, { status: 201 });
}
