import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { weeklyDigest } from '@/lib/emailTemplates';

/**
 * GET /api/cron/digest
 * Wednesday 9am ET, flush the NotificationQueue.
 * Protected by x-cron-secret header.
 * Triggered by AWS EventBridge Scheduler: cron(0 14 ? * 4 *)
 *
 * Groups queued events by project + recipient, sends one digest email per group,
 * logs each to NotificationLog, then clears the queue.
 */

async function sendEmail({ to, subject, html }) {
  if (process.env.NOTIFY_DRY_RUN !== 'false') {
    console.log(`[DIGEST DRY RUN] to=${to} subject="${subject}"`);
    return;
  }
  // TODO: Microsoft Graph API
  console.warn('[DIGEST] sendEmail called but no email provider is configured.');
}

export async function GET(req) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const queued = await prisma.notificationQueue.findMany({
    orderBy: [{ project_id: 'asc' }, { recipientEmail: 'asc' }, { createdAt: 'asc' }],
  });

  if (queued.length === 0) {
    return NextResponse.json({ processed: 0, message: 'Queue empty' });
  }

  // ── Group by project_id + recipientEmail ─────────────────────────────────
  const groups = new Map();
  for (const item of queued) {
    const key = `${item.project_id}::${item.recipientEmail}`;
    if (!groups.has(key)) {
      groups.set(key, { projectId: item.project_id, email: item.recipientEmail, events: [] });
    }
    groups.get(key).events.push({
      type:    item.notificationType,
      payload: item.payload,
      at:      item.createdAt,
    });
  }

  // ── Fetch project names in one query ──────────────────────────────────────
  const projectIds = [...new Set(queued.map(q => q.project_id))];
  const projects   = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true },
  });
  const projectNameMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

  const appUrl   = process.env.APP_URL || '';
  let   sent     = 0;
  let   failed   = 0;
  const logData  = [];

  // ── Send one digest per group ─────────────────────────────────────────────
  for (const { projectId, email, events } of groups.values()) {
    try {
      const projectName = projectNameMap[projectId] || 'Your Project';

      // Create log entry first to get the open-tracking token
      const log = await prisma.notificationLog.create({
        data: {
          project_id:       projectId,
          notificationType: 'DIGEST',
          audience:         'EXTERNAL',
          recipientEmail:   email,
          payload:          JSON.stringify({ eventCount: events.length }),
        },
      });

      const pixelUrl          = `${appUrl}/api/notifications/opened/${log.openToken}`;
      const { subject, html } = weeklyDigest({ projectName, events, pixelUrl });

      await sendEmail({ to: email, subject, html });
      logData.push({ projectId, email, eventCount: events.length });
      sent++;
    } catch (err) {
      console.error(`[DIGEST] Failed for project=${projectId} email=${email}:`, err);
      failed++;
    }
  }

  // ── Also log one internal record per project ──────────────────────────────
  for (const projectId of projectIds) {
    const count = queued.filter(q => q.project_id === projectId).length;
    await prisma.notificationLog.create({
      data: {
        project_id:       projectId,
        notificationType: 'DIGEST',
        audience:         'INTERNAL',
        payload:          JSON.stringify({ eventCount: count }),
      },
    }).catch(() => {});
  }

  // ── Clear processed rows ──────────────────────────────────────────────────
  await prisma.notificationQueue.deleteMany({
    where: { id: { in: queued.map(q => q.id) } },
  });

  console.log(`[CRON DIGEST] sent=${sent} failed=${failed} events=${queued.length}`);
  return NextResponse.json({ processed: sent, failed, events: queued.length, digests: logData });
}
