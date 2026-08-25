import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SOURCES, DEFAULT_MARKET } from '@/lib/market-intel/sourceCatalog';

/**
 * POST /api/market-intel/sources/seed
 *
 * Bring the source list up to date with the catalog: add what is missing, leave
 * alone what is already there.
 *
 * ── Why this is one endpoint and not a loop in the browser ──
 * The old seeder fired one POST per source from the page and only offered
 * itself when the list was completely empty, because adding a source that
 * already existed would have crashed on the unique name. That made it a
 * one-shot: the day a new paper was worth adding, there was no way to add it
 * short of deleting everything. Here the decision is made server-side against
 * the live list, so pressing the button twice does nothing the second time.
 *
 * It never edits an existing source's feed URL or frequency. If somebody has
 * turned a source off or moved it to weekly, that is a decision, and a seeder
 * that silently reverts decisions is worse than no seeder. The one exception is
 * `market` on a source that has never been given one — see below.
 */
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (user.role !== 'ILC_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await prisma.marketSource.findMany({
    select: { id: true, name: true, market: true },
  });
  const byName = new Map(existing.map(s => [s.name.trim().toLowerCase(), s]));

  const log = { added: [], alreadyThere: 0, retagged: [], errors: [] };

  for (const source of SOURCES) {
    const key   = source.name.trim().toLowerCase();
    const found = byName.get(key);

    if (found) {
      log.alreadyThere++;
      // Sources that predate the market column all carry the default. If the
      // catalog says this one is local, say so — that is a fact about the
      // paper, not a setting somebody chose, so it is safe to correct.
      if ((found.market || DEFAULT_MARKET) === DEFAULT_MARKET && source.market !== DEFAULT_MARKET) {
        try {
          await prisma.marketSource.update({ where: { id: found.id }, data: { market: source.market } });
          log.retagged.push({ name: source.name, market: source.market });
        } catch (err) {
          log.errors.push({ name: source.name, error: err?.message ?? String(err) });
        }
      }
      continue;
    }

    try {
      await prisma.marketSource.create({
        data: {
          name:             source.name,
          feedUrl:          source.feedUrl,
          siteUrl:          source.siteUrl || '',
          market:           source.market || DEFAULT_MARKET,
          projectTypes:     JSON.stringify(source.projectTypes || []),
          pollingFrequency: source.pollingFrequency || 'DAILY',
          notes:            source.notes || null,
        },
      });
      log.added.push({ name: source.name, market: source.market });
    } catch (err) {
      // One bad row must not stop the other thirty-four from landing.
      log.errors.push({ name: source.name, error: err?.message ?? String(err) });
    }
  }

  return NextResponse.json({ ok: true, log });
}
