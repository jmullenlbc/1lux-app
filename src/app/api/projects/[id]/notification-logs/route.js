import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  return canSeeAllData(user) || p.createdById === user.id;
}

/**
 * GET /api/projects/[id]/notification-logs
 * Returns most recent 100 notification log entries for this project.
 * Used by the NotificationLog UI component.
 */
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const logs = await prisma.notificationLog.findMany({
    where:   { project_id: params.id },
    orderBy: { sentAt: 'desc' },
    take:    100,
  });

  return NextResponse.json({ logs });
}
