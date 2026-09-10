import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { selectItems, SCOPE_DAYS, WEEKLY_NEW_LIMIT } from '@/lib/verification/checks';
import { runChecksFromDb, loadActions } from '@/lib/verification/load';

export const dynamic = 'force-dynamic';

/**
 * GET /api/verification
 *
 * Powers the "Things Needing a Look" card on the Main dashboard.
 *
 * Everything is worked out live — no problem is ever stored, so fixing a record
 * makes the item disappear on the next load with nothing to clean up. The only
 * rows this reads and writes are the two facts a live recompute cannot know:
 * whether an item has been put in front of anyone before (SHOWN), and whether
 * anyone has buried it (DISMISSED).
 *
 * Yes, a GET writes. Deliberately: SHOWN has to be stamped at the moment an item
 * is actually displayed, and it is written idempotently, so a reload shows the
 * same five and changes nothing.
 */
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const now = new Date();
  const [all, { shown, dismissed, actions }] = await Promise.all([
    runChecksFromDb(now),
    loadActions(),
  ]);

  const { items, fresh, remainingThisWeek, totalOpen } = selectItems(all, { shown, dismissed, now });

  // Stamp the ones being shown for the first time.
  //
  // upsert rather than createMany({ skipDuplicates }) for two reasons: two people
  // can open the dashboard at the same moment, and the unique index would turn
  // the second insert into a 500; and skipDuplicates is a Postgres-only option in
  // Prisma 5 — it throws outright on the SQLite dev database. This is at most five
  // rows a load, so the loop costs nothing.
  if (fresh.length) {
    await Promise.all(fresh.map(itemKey => prisma.verificationAction.upsert({
      where:  { itemKey_kind: { itemKey, kind: 'SHOWN' } },
      update: {},
      create: { itemKey, kind: 'SHOWN', userId: user.id },
    })));
  }

  // How many are sitting in the archive, so the card can offer a way back in
  // without going and fetching the whole thing.
  const archivedCount = actions.filter(a => a.kind === 'DISMISSED' && !a.restoredAt).length;

  return NextResponse.json({
    items,
    totalOpen,
    remainingThisWeek,
    archivedCount,
    weeklyLimit: WEEKLY_NEW_LIMIT,
    scopeDays:   SCOPE_DAYS,
  });
}
