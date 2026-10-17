import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/dashboards/[id]/hidden { key }, put back a prebuilt card that was
// taken off this dashboard. Removing the "hidden" row is all it takes: the next
// GET /api/dashboards re-adds the card at the end of the dashboard.
//
// The row is a layout preference, not a record of anything, so clearing it is
// not a deletion in the sense of Mike's "nothing gets deleted" rule.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const dash = await prisma.dashboard.findUnique({ where: { id: params.id } });
  if (!dash) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = dash.ownerUserId === user.id || (dash.ownerUserId === null && actsAsAdmin(user));
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { key } = await request.json().catch(() => ({}));
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  await prisma.dashboardHiddenWidget.deleteMany({ where: { dashboardId: params.id, widgetKey: key } });
  return NextResponse.json({ ok: true });
}
