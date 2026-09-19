import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get('limit')  || '50'), 200);
  const cursor = searchParams.get('cursor') || null;
  // ?type=deal_stage — the stage moves alone (Buyout Duration on the CRM popup and hub).
  const type   = searchParams.get('type') || null;

  const activities = await prisma.projectActivity.findMany({
    where:   { projectId: params.id, ...(type ? { type } : {}) },
    orderBy: { createdAt: 'desc' },
    take:    limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = activities.length > limit;
  const items   = hasMore ? activities.slice(0, limit) : activities;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({ activities: items, nextCursor, hasMore });
}
