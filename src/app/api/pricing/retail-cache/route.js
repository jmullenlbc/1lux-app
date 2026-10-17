import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeKey } from '@/lib/pricingIntelligence';

// GET /api/pricing/retail-cache?items=[{manufacturer,partNumber}]
// Returns cached retail prices for a batch. Called as background useEffect
// after budget items load, never blocks the initial render.
export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let items = [];
  try {
    items = JSON.parse(new URL(req.url).searchParams.get('items') || '[]');
  } catch {
    return NextResponse.json({ results: [] });
  }

  if (!items.length) return NextResponse.json({ results: [] });

  // Build normalized key pairs
  const normalized = items.map(i => ({
    original:  i,
    mfrNorm:   normalizeKey(i.manufacturer),
    partNorm:  normalizeKey(i.partNumber),
  }));

  // Batch fetch, one query for all requested pairs
  const cached = await prisma.productPriceCache.findMany({
    where: {
      OR: normalized.map(n => ({
        manufacturer: n.mfrNorm,
        partNumber:   n.partNorm,
      })),
    },
  });

  // Re-attach original (un-normalized) keys for client matching
  const results = cached.map(c => {
    const match = normalized.find(n => n.mfrNorm === c.manufacturer && n.partNorm === c.partNumber);
    return {
      manufacturer:  match?.original.manufacturer ?? c.manufacturer,
      partNumber:    match?.original.partNumber   ?? c.partNumber,
      lowestRetail:  c.lowestRetail,
      retailResults: (() => { try { return JSON.parse(c.retailResults); } catch { return []; } })(),
      lastChecked:   c.lastChecked,
    };
  });

  return NextResponse.json({ results });
}
