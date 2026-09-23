import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NOTIFICATION_TYPES } from '@/lib/notify';
import { summarizeFeedback, describeNoise } from '@/lib/alertFeedback';

// GET /api/admin/alert-feedback — which notifications people find useful and
// which they call noise. Mike, 2026-09-14: "Admins get a report showing which
// alerts people find useful and which are noise."
//
// Counts only. No names: the point is to fix the alert, not to look at who
// clicked what.
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const [rows, mutes] = await Promise.all([
    prisma.alertFeedback.findMany({ select: { alertType: true, verdict: true } }),
    prisma.alertMute.findMany({ select: { alertType: true } }),
  ]);

  const summary = summarizeFeedback(rows, mutes).map(r => ({
    ...r,
    label:   NOTIFICATION_TYPES[r.alertType]?.label || r.alertType,
    verdict: describeNoise(r),
  }));

  return NextResponse.json({
    summary,
    totalClicks: rows.length,
    totalMutes:  mutes.length,
  });
}
