import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/dashboards/[id]/share { userId } — share this dashboard with a person.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const dash = await prisma.dashboard.findUnique({ where: { id: params.id } });
  if (!dash) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (userId === user.id) return NextResponse.json({ error: "Can't share with yourself" }, { status: 400 });

  const share = await prisma.dashboardShare.upsert({
    where:  { dashboardId_sharedWithUserId: { dashboardId: params.id, sharedWithUserId: userId } },
    update: {},
    create: { dashboardId: params.id, sharedWithUserId: userId, createdById: user.id },
  });
  return NextResponse.json({ share });
}
