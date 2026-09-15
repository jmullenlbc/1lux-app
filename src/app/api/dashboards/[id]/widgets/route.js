import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function assertEdit(id, user) {
  const dash = await prisma.dashboard.findUnique({ where: { id } });
  if (!dash) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const ok = dash.ownerUserId === user.id || (dash.ownerUserId === null && actsAsAdmin(user));
  if (!ok) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { dash };
}

// POST /api/dashboards/[id]/widgets — add a field-picker (or legacy) widget
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { error: forbidden } = await assertEdit(params.id, user);
  if (forbidden) return forbidden;

  const b = await request.json().catch(() => ({}));
  const count = await prisma.dashboardWidget.count({ where: { dashboardId: params.id } });

  const widget = await prisma.dashboardWidget.create({
    data: {
      dashboardId: params.id,
      name:      b.name || 'Untitled',
      chartType: ['BAR', 'LINE', 'TABLE'].includes(b.chartType) ? b.chartType : 'BAR',
      width:     ['HALF', 'FULL'].includes(b.width) ? b.width : 'HALF',
      dataSpec:  b.dataSpec ? (typeof b.dataSpec === 'string' ? b.dataSpec : JSON.stringify(b.dataSpec)) : null,
      // legacy columns are NOT NULL — sentinels for field-picker widgets
      category:  b.category || 'FIELD',
      metric:    b.metric   || 'custom',
      viewBy:    b.viewBy   || 'none',
      segmentBy: b.segmentBy || null,
      filters:   b.filters ? (typeof b.filters === 'string' ? b.filters : JSON.stringify(b.filters)) : '[]',
      position:  count,
    },
  });
  return NextResponse.json({ widget });
}
