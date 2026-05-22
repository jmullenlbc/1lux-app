import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma as db } from '@/lib/db';
import { runWidget } from '@/lib/dashboardEngine';

// POST /api/crm/dashboards/[id]/run
// Returns chart data for every widget on the dashboard in one request
export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    const dashboard = await db.dashboard.findUnique({
      where: { id: params.id },
      include: { widgets: { orderBy: { position: 'asc' } } },
    });
    if (!dashboard) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const results = await Promise.all(
      dashboard.widgets.map(async widget => {
        const data = await runWidget(widget, db);
        return { widgetId: widget.id, ...data };
      })
    );

    return NextResponse.json({ dashboardId: params.id, results });
  } catch (err) {
    console.error('[dashboard run]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to run dashboard' }, { status: 500 });
  }
}
