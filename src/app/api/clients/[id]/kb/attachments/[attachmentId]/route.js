import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import path from 'path';

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const attachment = await prisma.clientKBAttachment.findUnique({
    where: { id: params.attachmentId },
    include: { section: { include: { client: true } } },
  });

  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!canSeeAllData(user) && attachment.section.client.createdById !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await unlink(path.join(process.cwd(), 'uploads', attachment.storedPath));
  } catch {}

  await prisma.clientKBAttachment.delete({ where: { id: attachment.id } });
  return NextResponse.json({ ok: true });
}
