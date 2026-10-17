import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runChecksFromDb } from '@/lib/verification/load';

export const dynamic = 'force-dynamic';

/**
 * The archive behind "Things Needing a Look".
 *
 * Mike, 2026-09-10: "I don't think these cards should ever get deleted. they
 * should get archived somewhere into an archive that is accessible but not
 * easily."
 *
 * So: nothing here deletes anything, ever. Putting an item away writes a row,
 * bringing it back stamps that same row, and both directions are readable
 * afterwards. "Not easily" is the card's job, the archive sits behind a small
 * closed line at the bottom of it and is only fetched when somebody opens it.
 * This route is the whole of it.
 */

// GET, everything that has been put away and not brought back, newest first.
//
// Each row is checked against a fresh run of the five checks so the screen can
// say whether the thing is still true. That matters: most buried items are
// buried because they were fine as they were, but some get fixed afterwards, and
// those two are worth telling apart when you are deciding what to bring back.
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const [rows, all] = await Promise.all([
    prisma.verificationAction.findMany({
      where:   { kind: 'DISMISSED', restoredAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        itemKey: true, title: true, detail: true, href: true, hrefLabel: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    runChecksFromDb(new Date()),
  ]);

  const live = new Map(all.map(i => [i.key, i]));

  const items = rows.map(r => {
    const current = live.get(r.itemKey);
    return {
      key:       r.itemKey,
      // Prefer the wording the checks produce right now, a project renamed
      // since the bury should read by its current name. Fall back to the copy
      // taken when it was put away, which is all that is left once the record
      // behind it has been fixed.
      title:     current?.title     ?? r.title  ?? 'An item that is no longer on file',
      detail:    current?.detail    ?? r.detail ?? '',
      href:      current?.href      ?? r.href   ?? null,
      hrefLabel: current?.hrefLabel ?? r.hrefLabel ?? 'Open it',
      kind:      current?.kind      ?? null,
      stillTrue: !!current,
      putAwayAt: r.createdAt,
      putAwayBy: r.user?.name || r.user?.email || null,
    };
  });

  return NextResponse.json({ items });
}

// POST { key }, bring one back onto the card.
//
// An update, not a delete. The row survives with a restoredAt stamp on it, so
// who put it away and when is still on file, and the SHOWN row is left alone so
// the item does not eat one of this week's five new slots on the way back.
export async function POST(req) {
  const { error } = await requireAuth();
  if (error) return error;

  const { key } = await req.json().catch(() => ({}));
  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'Nothing was named to bring back.' }, { status: 400 });
  }

  const updated = await prisma.verificationAction.updateMany({
    where: { itemKey: key, kind: 'DISMISSED', restoredAt: null },
    data:  { restoredAt: new Date() },
  });

  if (!updated.count) {
    return NextResponse.json({ error: 'That one is not in the archive.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
