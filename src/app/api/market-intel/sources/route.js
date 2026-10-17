import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEFAULT_MARKET, isKnownMarket } from '@/lib/market-intel/sourceCatalog';

/**
 * Market news sources.
 *
 * ── A bug that was hiding here ──
 * POST used to call `getSession()`, which is not imported and does not exist in
 * this file, and then read `user`, also undefined. Every attempt to add a
 * source threw a ReferenceError and returned a 500. The old "Seed 20 Sources"
 * button only appeared when the list was empty, so once the first twenty-one
 * were in, nobody ever pressed it again and nobody found out. The same mistake
 * is in the PATCH and DELETE handlers next door and is fixed there too.
 */

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const sources = await prisma.marketSource.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(sources);
}

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (user.role !== 'ILC_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  if (!body?.name || !body?.feedUrl) {
    return NextResponse.json({ error: 'A source needs a name and a feed URL' }, { status: 400 });
  }

  // Adding a source that is already there is a no-op, not an error. The seeder
  // re-runs every time somebody presses the button, and a duplicate-key crash
  // halfway through would leave the list half-added with nothing to say why.
  const existing = await prisma.marketSource.findUnique({ where: { name: body.name } });
  if (existing) return NextResponse.json(existing, { status: 200 });

  const source = await prisma.marketSource.create({
    data: {
      name:             body.name,
      feedUrl:          body.feedUrl,
      siteUrl:          body.siteUrl || '',
      market:           isKnownMarket(body.market) ? body.market : DEFAULT_MARKET,
      projectTypes:     JSON.stringify(body.projectTypes || []),
      pollingFrequency: body.pollingFrequency || 'DAILY',
      notes:            body.notes || null,
    },
  });
  return NextResponse.json(source, { status: 201 });
}
