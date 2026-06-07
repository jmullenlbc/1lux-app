import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeKey } from '@/lib/pricingIntelligence';

// POST /api/pricing/retail-lookup
// Fetch retail pricing from SerpAPI for a single manufacturer + partNumber.
// Merged retail-lookup + retail-refresh into one route with forceRefresh flag.
export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Graceful no-op if SerpAPI key not configured
  if (!process.env.SERPAPI_KEY) {
    return NextResponse.json({ cached: null, reason: 'SERPAPI_KEY not configured' });
  }

  let manufacturer, partNumber, forceRefresh = false;
  try {
    ({ manufacturer, partNumber, forceRefresh = false } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!manufacturer || !partNumber) {
    return NextResponse.json({ error: 'manufacturer and partNumber required' }, { status: 400 });
  }

  const mfrNorm  = normalizeKey(manufacturer);
  const partNorm = normalizeKey(partNumber);

  // Return cached result if exists and not forced
  if (!forceRefresh) {
    const existing = await prisma.productPriceCache.findUnique({
      where: { manufacturer_partNumber: { manufacturer: mfrNorm, partNumber: partNorm } },
    });
    if (existing) return NextResponse.json({ cached: existing });
  }

  // Fetch from SerpAPI
  let retailResults = [];
  try {
    const query = encodeURIComponent(`${manufacturer} ${partNumber}`);
    const url   = `https://serpapi.com/search.json?engine=google_shopping&q=${query}&api_key=${process.env.SERPAPI_KEY}&num=5`;
    const res   = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data  = await res.json();

    retailResults = (data.shopping_results || [])
      .slice(0, 5)
      .map(r => ({
        source: r.source || r.merchant || 'Unknown',
        price:  parseFloat((r.price || '0').replace(/[^0-9.]/g, '')) || 0,
        link:   r.link || null,
      }))
      .filter(r => r.price > 0);
  } catch (e) {
    console.error('SerpAPI error:', e.message);
    return NextResponse.json({ cached: null, reason: 'SerpAPI fetch failed' });
  }

  if (retailResults.length === 0) {
    return NextResponse.json({ cached: null, reason: 'No shopping results found' });
  }

  const lowestRetail = Math.min(...retailResults.map(r => r.price));

  const cached = await prisma.productPriceCache.upsert({
    where:  { manufacturer_partNumber: { manufacturer: mfrNorm, partNumber: partNorm } },
    create: {
      manufacturer:  mfrNorm,
      partNumber:    partNorm,
      retailResults: JSON.stringify(retailResults),
      lowestRetail,
      lastCheckedBy: user.id,
    },
    update: {
      retailResults: JSON.stringify(retailResults),
      lowestRetail,
      lastChecked:   new Date(),
      lastCheckedBy: user.id,
    },
  });

  return NextResponse.json({ cached });
}
