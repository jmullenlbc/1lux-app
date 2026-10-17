import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runChecksFromDb } from '@/lib/verification/load';

export const dynamic = 'force-dynamic';

/**
 * POST /api/verification/dismiss   { key }
 *
 * "That's fine." Puts one item away, company-wide.
 *
 * Mike, 2026-09-10: "I think it's fine if one person says that's fine to a card
 * and it goes away for everyone and it's archived. I don't think these cards
 * should ever get deleted." So this is a bury, not a delete, the row is the
 * archive, and `/api/verification/archive` reads it back out.
 *
 * The reason this route re-runs the checks instead of just writing a key: once
 * somebody fixes the record behind an item, the checks stop producing that item
 * at all, and the archive would have nothing left to show but a machine key. So
 * the item's own words are copied onto the row at the moment it is put away.
 * They are taken from a fresh recompute here rather than from whatever the
 * browser sent, so what is stored is what the system actually found.
 *
 * upsert, not create: two people can press this on the same item at the same
 * moment, and the unique index would turn the second one into a 500. It also
 * covers the case of an item that was put away, brought back, and put away
 * again, the same row is reused and `restoredAt` is cleared.
 */
export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { key } = await req.json().catch(() => ({}));
  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'Nothing was named to put away.' }, { status: 400 });
  }

  const all  = await runChecksFromDb(new Date());
  const item = all.find(i => i.key === key);

  const snapshot = {
    title:     item?.title     ?? null,
    detail:    item?.detail    ?? null,
    href:      item?.href      ?? null,
    hrefLabel: item?.hrefLabel ?? null,
  };

  await prisma.verificationAction.upsert({
    where:  { itemKey_kind: { itemKey: key, kind: 'DISMISSED' } },
    // A second press re-buries it and refreshes the wording; it never clears
    // a snapshot that is already there with a blank one.
    update: {
      restoredAt: null,
      ...(item ? snapshot : {}),
    },
    create: { itemKey: key, kind: 'DISMISSED', userId: user.id, ...snapshot },
  });

  return NextResponse.json({ ok: true });
}
