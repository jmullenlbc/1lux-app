import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** PATCH { action: 'archive' | 'restore' }. Questions are archive-only. */
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canSeeAllData(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { action } = await req.json().catch(() => ({}));
  if (!['archive', 'restore'].includes(action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const done = await prisma.marketQuestion.updateMany({
    where: { id: params.id },
    data: { archivedAt: action === 'archive' ? new Date() : null },
  });
  if (!done.count) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
