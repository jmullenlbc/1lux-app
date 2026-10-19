import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { compareBudgetsForStaff } from '@/lib/intake/portalServer';

export const dynamic = 'force-dynamic';

// POST { draftIds }: two or three web budgets side by side for Sales on My
// Desk (Mike 10-18). Same rows as the company portal's compare.
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const out = await compareBudgetsForStaff(body?.draftIds);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status || 422 });
  return NextResponse.json(out);
}
