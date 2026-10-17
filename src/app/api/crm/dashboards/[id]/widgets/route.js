import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma as db } from '@/lib/db';

// POST /api/crm/dashboards/[id]/widgets, add a widget
export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    const body = await request.json();
    const { name, category, metric, viewBy, segmentBy, filters, width } = body;

    const count = await db.dashboardWidget.count({ where: { dashboardId: params.id } });

    const widget = await db.dashboardWidget.create({
      data: {
        dashboardId: params.id,
        name: name?.trim() || 'New Chart',
        category: category || 'DEAL_COUNT',
        metric: metric || 'count',
        viewBy: viewBy || 'month',
        segmentBy: segmentBy || null,
        filters: filters ? JSON.stringify(filters) : '[]',
        width: width || 'HALF',
        position: count,
      },
    });
    return NextResponse.json(widget, { status: 201 });
  } catch (err) {
    console.error('[widgets POST]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to add widget' }, { status: 500 });
  }
}
