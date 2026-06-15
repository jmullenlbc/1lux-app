import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/alerts — fetch current user's alerts (unread first)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const alerts = await prisma.userAlert.findMany({
    where: { userId: session.id },
    orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  });

  return NextResponse.json(alerts);
}

// PATCH /api/alerts — mark alerts as read
// Body: { ids: string[] } or { all: true }
export async function PATCH(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  if (body.all) {
    await prisma.userAlert.updateMany({
      where: { userId: session.id, isRead: false },
      data: { isRead: true },
    });
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    await prisma.userAlert.updateMany({
      where: { userId: session.id, id: { in: body.ids } },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/alerts — permanently delete the user's alerts
// Body: { ids: string[] } (only deletes alerts owned by the current user)
export async function DELETE(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await prisma.userAlert.deleteMany({
      where: { userId: session.id, id: { in: body.ids } },
    });
  }

  return NextResponse.json({ ok: true });
}
