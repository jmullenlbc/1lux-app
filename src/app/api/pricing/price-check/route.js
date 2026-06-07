import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeKey, getPricingConfig } from '@/lib/pricingIntelligence';

// GET /api/pricing/price-check?projectId=...&items=[{manufacturer,partNumber,unitPrice}]
// Returns price alert flags for a set of items vs. cross-project history.
export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  let items = [];
  try { items = JSON.parse(searchParams.get('items') || '[]'); } catch { return NextResponse.json({ flags: [] }); }

  if (!items.length) return NextResponse.json({ flags: [] });

  const { thresholdPct, windowMonths } = await getPricingConfig(prisma);
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - windowMonths);

  const flags = await Promise.all(items.map(async ({ manufacturer, partNumber, unitPrice }) => {
    const mfrNorm  = normalizeKey(manufacturer);
    const partNorm = normalizeKey(partNumber);

    const prior = await prisma.productPriceHistory.findFirst({
      where: {
        manufacturer: mfrNorm,
        partNumber:   partNorm,
        recordedAt:   { gte: windowStart },
        projectId:    projectId ? { not: projectId } : undefined,
      },
      orderBy: { recordedAt: 'desc' },
      include: { project: { select: { name: true } } },
    });

    if (!prior) {
      return { manufacturer, partNumber, flagged: false, priorPrice: null, pctIncrease: null };
    }

    // Divide-by-zero guard
    const pctIncrease = prior.unitPrice === 0
      ? null
      : Math.round(((unitPrice - prior.unitPrice) / prior.unitPrice) * 1000) / 10;

    return {
      manufacturer,
      partNumber,
      currentPrice:     unitPrice,
      priorPrice:       prior.unitPrice,
      priorProjectId:   prior.projectId,
      priorProjectName: prior.project?.name ?? null,
      priorRecordedAt:  prior.recordedAt,
      pctIncrease,
      flagged: pctIncrease !== null && pctIncrease > thresholdPct,
    };
  }));

  return NextResponse.json({ flags, thresholdPct, windowMonths });
}
