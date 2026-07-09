/**
 * GET /api/cron/client-review-check
 *
 * Checks all clients with an assigned owner and creates an in-app alert
 * when the playbook hasn't been updated in >= 12 months.
 *
 * Protected by CRON_SECRET header — set this env var and pass it as
 * the Authorization: Bearer <secret> header from your scheduler.
 *
 * Schedule: run monthly (e.g. 1st of each month at 9 AM).
 * Deduplicates by year so at most one alert per client per calendar year.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const REVIEW_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now    = Date.now();
  const year   = new Date().getFullYear();
  const threshold = new Date(now - REVIEW_INTERVAL_MS);
  const appUrl = process.env.APP_URL || '';

  const clients = await prisma.client.findMany({
    where: { ownerId: { not: null } },
    select: {
      id:        true,
      name:      true,
      createdAt: true,
      owner:     { select: { id: true, name: true } },
      playbook:  { select: { updatedAt: true } },
    },
  });

  const created = [];
  const skipped = [];

  for (const client of clients) {
    if (!client.owner) { skipped.push({ id: client.id, reason: 'no owner' }); continue; }

    const lastUpdated = client.playbook?.updatedAt ?? client.createdAt;
    if (new Date(lastUpdated) > threshold) {
      skipped.push({ id: client.id, reason: 'reviewed recently' });
      continue;
    }

    // One alert per owner per client per calendar year
    const dedupeKey = `CLIENT_ANNUAL_REVIEW:${client.id}:${client.owner.id}:${year}`;

    try {
      await prisma.userAlert.create({
        data: {
          userId:    client.owner.id,
          type:      'CLIENT_ANNUAL_REVIEW',
          title:     `Annual review due — ${client.name}`,
          message:   `It's been over a year since the standards and playbook for ${client.name} were last reviewed. Please verify the information is still current.`,
          link:      `${appUrl}/clients/${client.id}`,
          dedupeKey,
        },
      });
      created.push({ clientId: client.id, clientName: client.name, ownerId: client.owner.id });
    } catch {
      // dedupeKey unique constraint means it was already created this year
      skipped.push({ id: client.id, reason: 'already alerted this year' });
    }
  }

  return NextResponse.json({ ran: true, created: created.length, skipped: skipped.length, detail: created });
}
