import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isSuperAdmin } from '@/lib/auth';
import { readLedgerTail } from '@/lib/agent/ledger';
import {
  collectMetrics, DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS, rollupKey, dayKey,
} from '@/lib/admin/metrics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/metrics?days=30
 *
 * Operational view for the backend dashboard: usage, uploads, errors, AI spend.
 *
 * ── Super admin only, and not via requireAdmin ───────────────────────────────
 * `requireAdmin` also lets in Company Admins and anyone in Operations. Every
 * admin is ILC staff (Mike, 2026-09-14: only internal people can be admins), so
 * this is not about keeping outsiders out: it is an engineering view that spans
 * every project and client at once, who is uploading what, which modules break
 * and it stays on `isSuperAdmin` (SUPER_ADMIN | ILC_ADMIN).
 */
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw  = Number(new URL(request.url).searchParams.get('days'));
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(Math.trunc(raw), MAX_WINDOW_DAYS) : DEFAULT_WINDOW_DAYS;

  const until = new Date();
  const since = new Date(until.getTime() - days * 86400_000);

  try {
    const metrics = await collectMetrics(prisma, {
      since,
      until,
      // The ledger tail is deliberately generous but bounded: the JSONL sink has
      // no index, so this reads the file and filters. If it ever moves to an
      // AgentRun table this becomes a windowed query and the cap goes away.
      readLedger: () => readLedgerTail(5000),
    });

    // Historical snapshots, so the dashboard can draw a trend that predates the
    // current ledger file. Missing days are simply absent, the UI treats gaps as
    // "not recorded", never as zero, because a Lambda that never ran and a day
    // with no activity are different facts.
    const keys = [];
    for (let i = 1; i <= Math.min(days, 90); i++) {
      keys.push(rollupKey(new Date(until.getTime() - i * 86400_000)));
    }
    const rows = await prisma.systemConfig.findMany({ where: { key: { in: keys } } });
    const history = rows
      .map(r => { try { return JSON.parse(r.value); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => a.day.localeCompare(b.day));

    return NextResponse.json({ ...metrics, history, today: dayKey(until) });
  } catch (e) {
    console.error('[admin/metrics] failed:', e?.message || e);
    return NextResponse.json({ error: 'Failed to collect metrics' }, { status: 500 });
  }
}
