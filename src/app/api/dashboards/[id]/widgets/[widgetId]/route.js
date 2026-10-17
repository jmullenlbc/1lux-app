import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { prebuiltKey } from '@/lib/dashboards/prebuilt';

export const dynamic = 'force-dynamic';

async function assertEdit(dashboardId, user) {
  const dash = await prisma.dashboard.findUnique({ where: { id: dashboardId } });
  if (!dash) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = dash.ownerUserId === user.id || (dash.ownerUserId === null && actsAsAdmin(user));
  return ok ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// PATCH, edit a widget (name, chartType, width, dataSpec, or position for drag)
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const forbidden = await assertEdit(params.id, user);
  if (forbidden) return forbidden;

  // The widget has to be on the dashboard the caller may edit, or anybody who
  // owns one dashboard could edit a widget on another by its id.
  const existing = await prisma.dashboardWidget.findUnique({ where: { id: params.widgetId }, select: { dashboardId: true } });
  if (!existing || existing.dashboardId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const b = await request.json().catch(() => ({}));
  const widget = await prisma.dashboardWidget.update({
    where: { id: params.widgetId },
    data: {
      ...(b.name      !== undefined && { name: b.name }),
      ...(b.chartType !== undefined && ['BAR', 'LINE', 'TABLE'].includes(b.chartType) && { chartType: b.chartType }),
      ...(b.width     !== undefined && ['HALF', 'FULL'].includes(b.width) && { width: b.width }),
      ...(b.position  !== undefined && { position: Number(b.position) }),
      ...(b.dataSpec  !== undefined && { dataSpec: b.dataSpec == null ? null : (typeof b.dataSpec === 'string' ? b.dataSpec : JSON.stringify(b.dataSpec)) }),
      ...(b.filters   !== undefined && { filters: typeof b.filters === 'string' ? b.filters : JSON.stringify(b.filters) }),
    },
  });
  return NextResponse.json({ widget });
}

// DELETE, remove a widget.
//
// A prebuilt card (dataSpec.kind set) is re-added automatically on every load,
// so removing one also records that this dashboard does not want it, otherwise
// it is back on the next load (Mike, 2026-09-11: "Make it stick"). An upsert,
// because createMany's duplicate-skipping is Postgres-only and throws in dev.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const forbidden = await assertEdit(params.id, user);
  if (forbidden) return forbidden;

  const widget = await prisma.dashboardWidget.findUnique({ where: { id: params.widgetId } });
  if (!widget || widget.dashboardId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const key = prebuiltKey(widget.dataSpec);
  await prisma.$transaction([
    ...(key ? [prisma.dashboardHiddenWidget.upsert({
      where:  { dashboardId_widgetKey: { dashboardId: params.id, widgetKey: key } },
      update: {},
      create: { dashboardId: params.id, widgetKey: key, hiddenById: user.id },
    })] : []),
    prisma.dashboardWidget.delete({ where: { id: widget.id } }),
  ]);
  return NextResponse.json({ ok: true, hidden: key || null });
}
