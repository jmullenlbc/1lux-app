import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { loadDesk, loadDeskFor } from '@/lib/desk/deskServer';

export const dynamic = 'force-dynamic';

// GET: the signed-in person's desk. ?count=1 returns only the number to act on.
// ?user=<id> loads that person's desk (look-only); ?scope=everyone merges every
// active Sales person's desk, each row tagged with ownerName (Mike 10-5).
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const countOnly = Boolean(sp.get('count'));
  if (countOnly) {
    const desk = await loadDesk(user.id, new Date(), { full: false });
    return NextResponse.json({ attention: desk.attention });
  }
  const scope = sp.get('scope') === 'everyone' ? 'everyone' : null;
  const userId = sp.get('user') || null;
  const desk = await loadDeskFor({ viewerId: user.id, userId, scope, now: new Date() });
  return NextResponse.json(desk);
}
