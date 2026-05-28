/**
 * GET /api/cron/client-review-check
 *
 * Checks all clients with an assigned owner and sends a reminder email
 * when the playbook hasn't been updated in >= 12 months.
 *
 * Protected by CRON_SECRET header — set this env var and pass it as
 * the Authorization: Bearer <secret> header from your scheduler.
 *
 * Schedule: run monthly (e.g. 1st of each month at 9 AM).
 * Only sends when the threshold (12 months since last update) is crossed.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { clientAnnualReview } from '@/lib/emailTemplates';

const REVIEW_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

async function sendReminderEmail({ to, subject, html }) {
  if (process.env.NOTIFY_DRY_RUN !== 'false') {
    console.log(`[CRON DRY RUN] Annual review reminder → ${to}: ${subject}`);
    return;
  }
  // TODO: Microsoft Graph API — same stub pattern as notify.js
  console.warn('[CRON] sendReminderEmail: no email provider configured.');
}

export async function GET(request) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!prisma.clientPlaybook) {
    return NextResponse.json({ skipped: true, reason: 'clientPlaybook model not available' });
  }

  const now = Date.now();
  const threshold = new Date(now - REVIEW_INTERVAL_MS);
  const appUrl = process.env.APP_URL || '';

  // Find all clients with an owner assigned
  const clients = await prisma.client.findMany({
    where: { ownerId: { not: null } },
    select: {
      id:       true,
      name:     true,
      createdAt: true,
      owner:    { select: { name: true, email: true } },
      playbook: { select: { updatedAt: true } },
    },
  });

  const notified = [];
  const skipped  = [];

  for (const client of clients) {
    const owner = client.owner;
    if (!owner?.email) { skipped.push({ id: client.id, reason: 'no owner email' }); continue; }

    // Determine last review date: playbook updatedAt, or client createdAt as fallback
    const lastUpdated = client.playbook?.updatedAt ?? client.createdAt;
    if (new Date(lastUpdated) > threshold) {
      skipped.push({ id: client.id, reason: 'reviewed recently' });
      continue;
    }

    const { subject, html } = clientAnnualReview({
      ownerName:   owner.name,
      clientName:  client.name,
      clientUrl:   `${appUrl}/clients/${client.id}`,
      lastUpdated: lastUpdated,
    });

    await sendReminderEmail({ to: owner.email, subject, html });
    notified.push({ clientId: client.id, clientName: client.name, ownerEmail: owner.email });
  }

  return NextResponse.json({
    ran:      true,
    notified: notified.length,
    skipped:  skipped.length,
    detail:   notified,
  });
}
