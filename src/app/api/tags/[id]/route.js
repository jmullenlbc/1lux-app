import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/tags/[id], rename. One row, so the new name shows on every
// client already carrying the tag.
export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const tag = await prisma.clientTag.findUnique({ where: { id: params.id } });
  if (!tag) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { name } = await request.json();
  const clean = String(name ?? '').trim();
  if (!clean) return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });

  const all = await prisma.clientTag.findMany({ select: { id: true, name: true } });
  const clash = all.find(t => t.id !== tag.id && t.name.toLowerCase() === clean.toLowerCase());
  if (clash) return NextResponse.json({ error: 'A tag with that name already exists' }, { status: 400 });

  const updated = await prisma.clientTag.update({ where: { id: tag.id }, data: { name: clean } });
  return NextResponse.json({ tag: updated });
}

// DELETE /api/tags/[id], removes the tag and, through the cascade on
// ClientTagLink, un-tags every client that had it.
export async function DELETE(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const tag = await prisma.clientTag.findUnique({ where: { id: params.id } });
  if (!tag) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.clientTag.delete({ where: { id: tag.id } });
  return NextResponse.json({ ok: true });
}
