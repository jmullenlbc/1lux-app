import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { whoseLibrary, libraryState } from '@/lib/tone/voiceApi';

// PATCH /api/sales/voice/batches/[id]  { archived: true | false }
// Archive-only: an archived upload stops teaching the voice, and every email
// in it stays on file. Restore brings it back. The screen then calls
// /api/sales/voice/rebuild to relearn the voice.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const batch = await prisma.voiceBatch.findUnique({ where: { id: params.id }, select: { id: true, userId: true } });
  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const who = whoseLibrary(user, batch.userId);
  if (who.error) return who.error;

  const b = await request.json().catch(() => ({}));
  await prisma.voiceBatch.update({
    where: { id: batch.id },
    data: b.archived ? { archivedAt: new Date(), archivedById: user.id } : { archivedAt: null, archivedById: null },
  });
  return NextResponse.json(await libraryState(batch.userId));
}
