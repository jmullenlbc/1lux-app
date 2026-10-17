import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/alerts/mute, "stop sending me this kind" / "start again".
// Body: { alertType, muted: boolean }
//
// Per person, per kind. Nothing is deleted from anyone else's bell, and nothing
// stops being recorded, only this one person stops being told.
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const alertType = typeof body.alertType === 'string' ? body.alertType.trim() : '';
  if (!alertType) return NextResponse.json({ error: 'alertType is required' }, { status: 400 });

  if (body.muted === false) {
    await prisma.alertMute.deleteMany({ where: { userId: user.id, alertType } });
    return NextResponse.json({ ok: true, alertType, muted: false });
  }

  try {
    await prisma.alertMute.create({ data: { userId: user.id, alertType } });
  } catch (err) {
    if (err?.code !== 'P2002') throw err;   // already off, nothing to do
  }
  return NextResponse.json({ ok: true, alertType, muted: true });
}

// GET /api/alerts/mute, the kinds this person has turned off.
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const rows = await prisma.alertMute.findMany({
    where: { userId: user.id }, select: { alertType: true, mutedAt: true },
    orderBy: { mutedAt: 'desc' },
  });
  return NextResponse.json({ mutes: rows });
}
