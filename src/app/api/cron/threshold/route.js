import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/cron/threshold
 * Daily 8am ET — checks all threshold conditions across active projects.
 * Protected by x-cron-secret header.
 * Triggered by AWS EventBridge Scheduler: cron(0 13 * * ? *)
 *
 * Sprint 3 will implement full threshold logic.
 * This stub validates auth and returns a count of active projects.
 */
export async function GET(req) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const activeProjects = await prisma.project.count({
    where: { status: { not: 'COMPLETE' } },
  });

  // TODO Sprint 3: loop projects and check all threshold conditions:
  // - ESD within 14 days + not SHIPPED/DELIVERED → queue SHIP_ESD_2WEEKS
  // - Construction dates within 3m/2m/1m/2w → sendThresholdNotification CONSCHED_Xd
  // - Design deadlines within 1m/2w/1w → sendThresholdNotification DESIGN_DEADLINE_Xd
  // - COI expiry within 30 days → sendThresholdNotification COI_EXPIRING
  // - Submittal items stale 60d / every 30d → queueDigestEvent SUBMITTAL_STALE_Xd
  // - Budget 20%+ jump vs previous → sendThresholdNotification BUDGET_20PCT

  console.log(`[CRON THRESHOLD] ${activeProjects} active projects (DRY RUN — Sprint 3 wires checks)`);

  return NextResponse.json({ activeProjects, message: 'Sprint 3 will implement threshold checks' });
}
