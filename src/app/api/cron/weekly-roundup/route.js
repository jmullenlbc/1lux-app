import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { notifyUser } from '@/lib/alerts';
import { buildRoundup, SIGNAL_WINDOW_DAYS } from '@/lib/roundup';

/**
 * GET /api/cron/weekly-roundup
 * Monday morning. One bell item per person: what YOU are on the hook for this
 * week, linking into the weekly meeting board.
 *
 * ── Why this is not another dashboard ──
 * /dashboards/meeting already shows everything open for everybody, and it is
 * the right thing to work down IN the meeting. What was missing is the hour
 * before it — the personal cut, arriving on its own, so nobody has to remember
 * to go and look. Building a second board would have added a place to look;
 * this adds a thing that finds you.
 *
 * ── Why it is not email ──
 * Because email is weeks away (Microsoft), and because a roundup that only
 * exists in an inbox is a roundup half the company has already archived. The
 * bell is in the app they are already in. When mail is wired up, the same
 * `buildRoundup` output can be rendered into a message without changing a rule.
 *
 * ── NOT SCHEDULED YET ──
 * Deliberate. See `.claude/coordination.md` for the exact EventBridge rule and
 * the instruction not to create it yet. Until then an admin can run it by hand,
 * which is also the only way to prove it works.
 *
 * The rules for what belongs in somebody's week live in `@/lib/roundup` so they
 * can be tested without a database. This file only reads rows and rings bells.
 */

const DAY = 86400_000;

export async function GET(req) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET;

  if (!isCron) {
    const { user, error } = await requireAuth();
    if (error) return error;
    if (!actsAsAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();
  const log = { users: 0, sent: 0, quiet: 0, duplicate: 0, errors: [] };

  try {
    // Read everything once, then cut it per person in memory. The alternative
    // is one query per person per section, which is the same data fetched a
    // dozen times over and a job that gets slower as the company grows.
    const [users, projects, noteActions, signals] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true },
      }),
      prisma.project.findMany({
        where: { lifecycleStatus: { not: 'ARCHIVED' } },
        select: {
          id: true, name: true, clientId: true,
          salesOwnerId: true, preconManagerId: true,
          procurementStatus: true, designStatus: true, designStage: true,
          proposalSentDate: true, expectedOrderDate: true,
          nextActionOwnerId: true, nextActionDueDate: true,
          flagged: true, flagNote: true,
        },
      }),
      prisma.noteAction.findMany({
        where: {
          remindedAt: null,
          remindAt:   { not: null },
          status:     { in: ['CONFIRMED', 'SUGGESTED'] },
          kind:       'ACTION',
        },
        take: 1000,
        select: {
          id: true, remindAt: true, remindedAt: true,
          contactName: true, targetName: true, company: true,
          detail: true, rawText: true, leadUserId: true,
          note: { select: { id: true, createdById: true, isPublished: true, owners: { select: { userId: true } } } },
        },
      }),
      prisma.marketSignal.findMany({
        where: {
          publishedAt:  { gte: new Date(now.getTime() - SIGNAL_WINDOW_DAYS * DAY) },
          reviewStatus: { not: 'DISMISSED' },
          // Screened out as not about a project (0125): true or null only.
          OR: [{ projectRelated: true }, { projectRelated: null }],
        },
        take: 500,
        select: {
          id: true, title: true, publishedAt: true, createdAt: true,
          linkedClientId: true, matchStatus: true,
          linkedProjectId: true, projectMatchStatus: true,
          linkedClient:  { select: { name: true } },
          linkedProject: { select: { name: true } },
        },
      }),
    ]);

    log.users = users.length;

    for (const user of users) {
      try {
        const { alert } = buildRoundup({ userId: user.id, projects, noteActions, signals, now });

        // No alert is the normal outcome for anyone having a quiet week, and
        // sending "nothing this week" is how a bell stops being read.
        if (!alert) { log.quiet++; continue; }

        const res = await notifyUser(alert);
        if (res.created) log.sent++; else log.duplicate++;
      } catch (err) {
        // One person's roundup failing must not cost everyone else theirs.
        log.errors.push(`${user.id}: ${err?.message ?? err}`);
      }
    }

    return NextResponse.json({ ok: true, log });
  } catch (err) {
    console.error('[cron/weekly-roundup]', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'failed' }, { status: 500 });
  }
}
