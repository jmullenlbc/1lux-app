import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { morningBriefing } from '@/lib/desk/briefingServer';

export const dynamic = 'force-dynamic';

// GET: the signed-in person's morning briefing (My Desk, placeholder 10-23).
// Written once a day per person and kept; ?refresh=1 writes it again.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';
  try {
    return NextResponse.json(await morningBriefing(user.id, { refresh }));
  } catch (e) {
    console.error('[briefing] failed:', e?.message || e);
    return NextResponse.json({ error: 'Could not put the briefing together.' }, { status: 500 });
  }
}
