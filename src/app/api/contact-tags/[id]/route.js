import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/contact-tags/[id], rename on every person at once.
export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const tag = await prisma.contactTag.findUnique({ where: { id: params.id } });
  if (!tag) return NextResponse.json({ error: 'That tag is gone, someone may have deleted it. Nothing was changed. Reload the page. (TAG_NOT_FOUND)' }, { status: 404 });

  const { name } = await request.json();
  const clean = String(name ?? '').trim();
  if (!clean) return NextResponse.json({ error: 'Type a tag name first. Nothing was saved. (TAG_NAME_REQUIRED)' }, { status: 400 });

  const all = await prisma.contactTag.findMany({ select: { id: true, name: true } });
  if (all.some(t => t.id !== tag.id && t.name.toLowerCase() === clean.toLowerCase())) {
    return NextResponse.json({ error: 'A people tag with that name already exists. Nothing was changed. Pick another name. (TAG_NAME_TAKEN)' }, { status: 400 });
  }
  const updated = await prisma.contactTag.update({ where: { id: tag.id }, data: { name: clean } });
  return NextResponse.json({ tag: updated });
}

// DELETE /api/contact-tags/[id], removes the tag; the cascade un-tags everyone.
// Only the tag goes, never the people.
export async function DELETE(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const tag = await prisma.contactTag.findUnique({ where: { id: params.id } });
  if (!tag) return NextResponse.json({ error: 'That tag is gone, someone may have deleted it. Nothing was changed. Reload the page. (TAG_NOT_FOUND)' }, { status: 404 });

  await prisma.contactTag.delete({ where: { id: tag.id } });
  return NextResponse.json({ ok: true });
}
