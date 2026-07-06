import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/dashboards/[id]/fork
// Copy a dashboard (typically the admin default) into the user's personal copy
// for that section, so their edits don't touch the shared default. Idempotent:
// if they already have a personal copy for the section, return it.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const src = await prisma.dashboard.findUnique({ where: { id: params.id }, include: { widgets: true } });
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = await prisma.dashboard.findFirst({
    where: { section: src.section, ownerUserId: user.id },
    include: { widgets: { orderBy: { position: 'asc' } } },
  });
  if (existing) return NextResponse.json({ dashboard: existing });

  const fork = await prisma.dashboard.create({
    data: {
      name: src.name, section: src.section, createdById: user.id, ownerUserId: user.id, isDefault: false,
      widgets: { create: src.widgets.map(w => ({
        name: w.name, category: w.category, metric: w.metric, viewBy: w.viewBy, segmentBy: w.segmentBy,
        filters: w.filters, chartType: w.chartType, dataSpec: w.dataSpec, position: w.position, width: w.width,
      })) },
    },
    include: { widgets: { orderBy: { position: 'asc' } } },
  });
  return NextResponse.json({ dashboard: fork });
}
