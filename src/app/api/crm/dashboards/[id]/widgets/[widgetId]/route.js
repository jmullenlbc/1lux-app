import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma as db } from '@/lib/db';
import { runWidget } from '@/lib/dashboardEngine';

// PATCH /api/crm/dashboards/[id]/widgets/[widgetId]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    const body = await request.json();
    const { name, category, metric, viewBy, segmentBy, filters, width, position } = body;

    const data = {};
    if (name      !== undefined) data.name      = name.trim();
    if (category  !== undefined) data.category  = category;
    if (metric    !== undefined) data.metric    = metric;
    if (viewBy    !== undefined) data.viewBy    = viewBy;
    if (segmentBy !== undefined) data.segmentBy = segmentBy;
    if (filters   !== undefined) data.filters   = JSON.stringify(filters);
    if (width     !== undefined) data.width     = width;
    if (position  !== undefined) data.position  = position;

    const widget = await db.dashboardWidget.update({
      where: { id: params.widgetId },
      data,
    });
    return NextResponse.json(widget);
  } catch (err) {
    console.error('[widget PATCH]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to update widget' }, { status: 500 });
  }
}

// DELETE /api/crm/dashboards/[id]/widgets/[widgetId]
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    await db.dashboardWidget.delete({ where: { id: params.widgetId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[widget DELETE]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to delete widget' }, { status: 500 });
  }
}

// POST /api/crm/dashboards/[id]/widgets/[widgetId]/run, run single widget
export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    // Accept optional override config from body (for live preview while editing)
    const body = await request.json().catch(() => ({}));
    let widget = await db.dashboardWidget.findUnique({ where: { id: params.widgetId } });
    if (!widget) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Allow overriding filters/dimensions for preview without saving
    if (body.preview) {
      widget = { ...widget, ...body.preview };
    }

    const data = await runWidget(widget, db);
    return NextResponse.json({ widgetId: params.widgetId, ...data });
  } catch (err) {
    console.error('[widget run]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to run widget' }, { status: 500 });
  }
}
