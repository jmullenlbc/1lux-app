import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/annotations/[id]
export async function PATCH(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { x, y, x2, y2, rotation, text_content, metadata } = body;

  const existing = await prisma.markupAnnotation.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = {};
  if (x        != null) data.x             = x;
  if (y        != null) data.y             = y;
  if (x2       != null) data.x2            = x2;
  if (y2       != null) data.y2            = y2;
  if (rotation != null) data.rotation      = rotation;
  if (text_content !== undefined) data.text_content = text_content;
  if (metadata !== undefined) data.metadata = metadata ? JSON.stringify(metadata) : null;

  const annotation = await prisma.markupAnnotation.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(annotation);
}

// DELETE /api/annotations/[id]
export async function DELETE(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  await prisma.markupAnnotation.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
