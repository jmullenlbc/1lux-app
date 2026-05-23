import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  return user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'COMPANY_ADMIN' || p.createdById === user.id;
}

/**
 * GET /api/projects/[id]/notifications
 * Returns all ProjectNotificationConfig records for this project,
 * keyed by notificationType for easy lookup in the settings UI.
 */
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const configs = await prisma.projectNotificationConfig.findMany({
    where: { project_id: params.id },
  });

  // Return as object keyed by notificationType for O(1) lookup in UI
  const byType = {};
  for (const c of configs) {
    byType[c.notificationType] = { id: c.id, enabled: c.enabled, externalEmails: c.externalEmails };
  }

  return NextResponse.json({ configs: byType });
}

/**
 * PATCH /api/projects/[id]/notifications
 * Upsert a single notification config.
 * Body: { notificationType: string, enabled: boolean, externalEmails: string }
 */
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { notificationType, enabled, externalEmails } = body;

  if (!notificationType) {
    return NextResponse.json({ error: 'notificationType required' }, { status: 400 });
  }

  const config = await prisma.projectNotificationConfig.upsert({
    where: { project_id_notificationType: { project_id: params.id, notificationType } },
    update: {
      ...(enabled        !== undefined && { enabled:        Boolean(enabled) }),
      ...(externalEmails !== undefined && { externalEmails: externalEmails || '' }),
    },
    create: {
      project_id:       params.id,
      notificationType,
      enabled:          enabled !== undefined ? Boolean(enabled) : true,
      externalEmails:   externalEmails || '',
    },
  });

  return NextResponse.json({ config });
}
