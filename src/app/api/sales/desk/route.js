import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { loadDesk } from '@/lib/desk/deskServer';

export const dynamic = 'force-dynamic';

// GET: the signed-in person's desk. ?count=1 returns only the number to act on.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const desk = await loadDesk(user.id);
  if (new URL(request.url).searchParams.get('count')) return NextResponse.json({ attention: desk.attention });
  return NextResponse.json(desk);
}
