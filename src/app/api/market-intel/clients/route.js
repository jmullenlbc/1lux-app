import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/market-intel/clients
// Returns clients that have at least one linked market signal (any matchStatus)
// Used to populate the client filter dropdown on the Market Intel page.
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  // Find distinct client IDs that appear in MarketSignal.linkedClientId
  const signals = await prisma.marketSignal.findMany({
    where:  { linkedClientId: { not: null } },
    select: { linkedClientId: true, linkedClient: { select: { id: true, name: true } } },
    distinct: ['linkedClientId'],
    orderBy: { publishedAt: 'desc' },
  });

  // Dedupe and shape
  const seen = new Set();
  const clients = [];
  for (const s of signals) {
    if (s.linkedClient && !seen.has(s.linkedClient.id)) {
      seen.add(s.linkedClient.id);
      clients.push(s.linkedClient);
    }
  }

  // Sort alphabetically
  clients.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ clients });
}
