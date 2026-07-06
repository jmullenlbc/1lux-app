import { NextResponse } from 'next/server';
import { requireAuth, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function assertEdit(dashboardId, user) {
  const dash = await prisma.dashboard.findUnique({ where: { id: dashboardId } });
  if (!dash) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = dash.ownerUserId === user.id || (dash.ownerUserId === null && isAnyAdmin(user.role));
  return ok ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// PATCH — edit a widget (name, chartType, width, dataSpec, or position for drag)
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const forbidden = await assertEdit(params.id, user);
  if (forbidden) return forbidden;

  const b = await request.json().catch(() => ({}));
  const widget = await prisma.dashboardWidget.update({
    where: { id: params.widgetId },
    data: {
      ...(b.name      !== undefined && { name: b.name }),
      ...(b.chartType !== undefined && ['BAR', 'LINE'].includes(b.chartType) && { chartType: b.chartType }),
      ...(b.width     !== undefined && ['HALF', 'FULL'].includes(b.width) && { width: b.width }),
      ...(b.position  !== undefined && { position: Number(b.position) }),
      ...(b.dataSpec  !== undefined && { dataSpec: b.dataSpec == null ? null : (typeof b.dataSpec === 'string' ? b.dataSpec : JSON.stringify(b.dataSpec)) }),
      ...(b.filters   !== undefined && { filters: typeof b.filters === 'string' ? b.filters : JSON.stringify(b.filters) }),
    },
  });
  return NextResponse.json({ widget });
}

// DELETE — remove a widget
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const forbidden = await assertEdit(params.id, user);
  if (forbidden) return forbidden;
  await prisma.dashboardWidget.delete({ where: { id: params.widgetId } });
  return NextResponse.json({ ok: true });
}
