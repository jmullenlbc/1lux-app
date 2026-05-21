import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import db from '@/lib/db';
import { unlink } from 'fs/promises';
import path from 'path';

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const attachment = await db.taskAttachment.findUnique({
    where: { id: params.attachmentId },
  });
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    await unlink(path.join(process.cwd(), 'uploads', attachment.storedPath));
  } catch {}

  await db.taskAttachment.delete({ where: { id: attachment.id } });
  return NextResponse.json({ ok: true });
}
