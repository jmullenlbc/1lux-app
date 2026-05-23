import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/cron/digest
 * Wednesday 9am ET — flush the NotificationQueue.
 * Protected by x-cron-secret header.
 * Triggered by AWS EventBridge Scheduler: cron(0 14 ? * 4 *)
 *
 * Sprint 3 will implement full digest email sending.
 * This stub groups the queue and logs the result.
 */
export async function GET(req) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const queued = await prisma.notificationQueue.findMany({
    orderBy: [{ project_id: 'asc' }, { recipientEmail: 'asc' }],
  });

  if (queued.length === 0) {
    return NextResponse.json({ processed: 0, message: 'Queue empty' });
  }

  // Group by project_id + recipientEmail
  const groups = new Map();
  for (const item of queued) {
    const key = `${item.project_id}::${item.recipientEmail}`;
    if (!groups.has(key)) groups.set(key, { projectId: item.project_id, email: item.recipientEmail, events: [] });
    groups.get(key).events.push({ type: item.notificationType, payload: item.payload, at: item.createdAt });
  }

  // TODO Sprint 3: send digest email per group via notify.js sendEmail()
  console.log(`[CRON DIGEST] ${groups.size} digest(s) to send (DRY RUN — Sprint 3 wires email)`);

  // Clear processed rows
  await prisma.notificationQueue.deleteMany({
    where: { id: { in: queued.map(q => q.id) } },
  });

  return NextResponse.json({ processed: groups.size, events: queued.length });
}
