import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import db from '@/lib/db';
import { DEFAULT_WIDGETS } from '@/lib/defaultDashboard';

// GET /api/crm/dashboards
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    let dashboards = await db.dashboard.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { widgets: { orderBy: { position: 'asc' } } },
    });

    // Auto-seed default dashboard on first visit
    if (dashboards.length === 0) {
      const def = await db.dashboard.create({
        data: {
          name: 'Main Dashboard',
          isDefault: true,
          createdById: user.id,
          widgets: { create: DEFAULT_WIDGETS },
        },
        include: { widgets: { orderBy: { position: 'asc' } } },
      });
      dashboards = [def];
    }

    return NextResponse.json(dashboards);
  } catch (err) {
    console.error('[dashboards GET]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to load dashboards' }, { status: 500 });
  }
}

// POST /api/crm/dashboards
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    const { name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const dashboard = await db.dashboard.create({
      data: { name: name.trim(), createdById: user.id },
      include: { widgets: { orderBy: { position: 'asc' } } },
    });
    return NextResponse.json(dashboard, { status: 201 });
  } catch (err) {
    console.error('[dashboards POST]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to create dashboard' }, { status: 500 });
  }
}
