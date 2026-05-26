import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/drawing-files/[id]
// Body: { scale_ratio? }
// Used by DrawingMarkupModal to persist the scale setting per drawing file.
export async function PATCH(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { scale_ratio } = body;

  const existing = await prisma.drawingFile.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = {};
  if (scale_ratio !== undefined) data.scale_ratio = scale_ratio;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const file = await prisma.drawingFile.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(file);
}
