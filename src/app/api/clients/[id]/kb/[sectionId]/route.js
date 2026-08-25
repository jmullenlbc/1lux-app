import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import path from 'path';

async function authorizeSection(clientId, sectionId, user) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canSeeAllData(user) && client.createdById !== user.id)
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const section = await prisma.clientKBSection.findFirst({ where: { id: sectionId, clientId } });
  if (!section) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { section };
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err, section } = await authorizeSection(params.id, params.sectionId, user);
  if (err) return err;

  const { title, content, sortOrder } = await request.json();

  const updated = await prisma.clientKBSection.update({
    where: { id: section.id },
    data: {
      ...(title     !== undefined && { title }),
      ...(content   !== undefined && { content }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
    include: { attachments: { orderBy: { createdAt: 'asc' } } },
  });

  return NextResponse.json({ section: updated });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err, section } = await authorizeSection(params.id, params.sectionId, user);
  if (err) return err;

  // Delete attachment files from disk first
  const attachments = await prisma.clientKBAttachment.findMany({ where: { sectionId: section.id } });
  await Promise.all(attachments.map(a =>
    unlink(path.join(process.cwd(), 'uploads', a.storedPath)).catch(() => {})
  ));

  await prisma.clientKBSection.delete({ where: { id: section.id } });
  return NextResponse.json({ ok: true });
}
