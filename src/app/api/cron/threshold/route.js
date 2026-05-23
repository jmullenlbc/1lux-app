import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendThresholdNotification, queueDigestEvent } from '@/lib/notify';

/**
 * GET /api/cron/threshold
 * Daily 8am ET — checks all threshold conditions across active projects.
 * Protected by x-cron-secret header.
 * Triggered by AWS EventBridge Scheduler: cron(0 13 * * ? *)
 *
 * Checks per project:
 *  1. Shipment ESD within 14 days + not delivered → SHIP_ESD_2WEEKS (digest)
 *  2. Construction milestones within 2w/1m/2m/3m → CONSCHED_2W / _1M / _2M / _3M
 *  3. COI expiry within 30 days → COI_EXPIRING
 */

// ── Date helpers ──────────────────────────────────────────────────────────────

function daysUntil(dateVal) {
  if (!dateVal) return null;
  const target = new Date(dateVal);
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (24 * 60 * 60 * 1000));
}

function weekKey(date) {
  const d    = new Date(date);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week.toString().padStart(2, '0')}`;
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function parseTags(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const wk    = weekKey(today);
  const mo    = monthKey(today);

  // Fetch all active projects with their shipments
  const projects = await prisma.project.findMany({
    where:   { status: { not: 'COMPLETE' } },
    include: {
      shipments: {
        where: { deliveredDate: null },
        select: { id: true, manufacturer: true, esdDate: true },
      },
    },
  });

  // Fetch COI files across all active project IDs in one query
  const projectIds = projects.map(p => p.id);
  const coiFiles   = projectIds.length > 0
    ? await prisma.projectFile.findMany({
        where: { projectId: { in: projectIds }, tab: 'contracts' },
        select: { projectId: true, tags: true },
      })
    : [];

  // Group COI files by projectId
  const coiByProject = {};
  for (const f of coiFiles) {
    if (!coiByProject[f.projectId]) coiByProject[f.projectId] = [];
    coiByProject[f.projectId].push(f);
  }

  let checksRun = 0;
  let triggered = 0;

  for (const project of projects) {
    const pid = project.id;

    // ── 1. ESD within 2 weeks ───────────────────────────────────────────────
    for (const ship of project.shipments) {
      checksRun++;
      const d = daysUntil(ship.esdDate);
      if (d !== null && d > 0 && d <= 14) {
        // Deduplicate: only queue once per shipment per week
        const dk       = `${pid}:SHIP_ESD_2WEEKS:${ship.id}:${wk}`;
        const existing = await prisma.notificationLog.findFirst({ where: { dedupeKey: dk } });
        if (!existing) {
          await queueDigestEvent(pid, 'SHIP_ESD_2WEEKS', {
            manufacturer: ship.manufacturer,
            esdDate:      ship.esdDate,
            daysOut:      d,
          });
          // Stamp an internal log so this won't re-queue for the rest of the week
          await prisma.notificationLog.create({
            data: {
              project_id:       pid,
              notificationType: 'SHIP_ESD_2WEEKS',
              audience:         'INTERNAL',
              payload:          JSON.stringify({ manufacturer: ship.manufacturer, esdDate: ship.esdDate }),
              dedupeKey:        dk,
            },
          }).catch(() => {});
          triggered++;
        }
      }
    }

    // ── 2. Construction milestones ──────────────────────────────────────────
    const constMilestones = [
      { field: 'constructionStartDate', label: 'Construction Start' },
      { field: 'mepRoughInDate',        label: 'MEP Rough-In' },
      { field: 'constructionEndDate',   label: 'Substantial Completion' },
    ];

    for (const { field, label } of constMilestones) {
      const dateVal = project[field];
      if (!dateVal) continue;
      checksRun++;

      const d = daysUntil(dateVal);
      if (d === null || d <= 0) continue;

      let type = null;
      let dk   = null;

      if (d <= 14) {
        type = 'CONSCHED_2W'; dk = `${pid}:CONSCHED_2W:${field}:${wk}`;
      } else if (d <= 30) {
        type = 'CONSCHED_1M'; dk = `${pid}:CONSCHED_1M:${field}:${mo}`;
      } else if (d <= 60) {
        type = 'CONSCHED_2M'; dk = `${pid}:CONSCHED_2M:${field}:${mo}`;
      } else if (d <= 90) {
        type = 'CONSCHED_3M'; dk = `${pid}:CONSCHED_3M:${field}:${mo}`;
      }

      if (type && dk) {
        const dateStr = typeof dateVal === 'string' ? dateVal : dateVal.toISOString().split('T')[0];
        await sendThresholdNotification(pid, type, dk, { milestone: label, date: dateStr, daysOut: d });
        triggered++;
      }
    }

    // ── 3. COI expiry within 30 days ────────────────────────────────────────
    const files = coiByProject[pid] || [];
    for (const file of files) {
      checksRun++;
      const tags      = parseTags(file.tags);
      const expiryTag = tags.find(t => typeof t === 'string' && t.startsWith('COI_EXPIRY:'));
      if (!expiryTag) continue;

      const expiryDate = expiryTag.split(':')[1]; // YYYY-MM-DD
      if (!expiryDate) continue;

      const d = daysUntil(expiryDate);
      if (d !== null && d > 0 && d <= 30) {
        const dk = `${pid}:COI_EXPIRING:${expiryDate}`;
        await sendThresholdNotification(pid, 'COI_EXPIRING', dk, { expiryDate, daysOut: d });
        triggered++;
      }
    }
  }

  console.log(`[CRON THRESHOLD] projects=${projects.length} checks=${checksRun} triggered=${triggered}`);
  return NextResponse.json({ projects: projects.length, checksRun, triggered });
}
