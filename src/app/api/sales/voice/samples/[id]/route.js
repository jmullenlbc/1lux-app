import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { whoseLibrary } from '@/lib/tone/voiceApi';
import { autoSetAside } from '@/lib/tone/library';

// PATCH /api/sales/voice/samples/[id]  { keep: true }
// "Put back" one email the relearn set aside as out-of-office or calendar
// mail (Mike 9-30). It is marked KEPT so it is never set aside again. The
// screen then relearns the voice.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const s = await prisma.voiceSample.findUnique({ where: { id: params.id }, select: { id: true, userId: true } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const who = whoseLibrary(user, s.userId);
  if (who.error) return who.error;
  const b = await request.json().catch(() => ({}));
  if (!b.keep) return NextResponse.json({ error: 'Nothing to do' }, { status: 400 });
  await prisma.voiceSample.update({ where: { id: s.id }, data: { archivedAt: null, archiveReason: 'KEPT' } });
  return NextResponse.json({ autoSetAside: await autoSetAside(s.userId) });
}
