import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NOT_CO_VERSION } from '@/lib/budgetVersions';
import { normalizeKey } from '@/lib/pricingIntelligence';

// POST /api/pricing/price-history
// Called fire-and-forget from openMailto() in EmailBidPopup.
// Receives { projectId }, looks up current budget items itself.
// Writes one ProductPriceHistory record per item with manufacturer + partNumber.
export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let projectId;
  try { ({ projectId } = await req.json()); } catch { return NextResponse.json({ written: 0 }); }
  if (!projectId) return NextResponse.json({ written: 0 });

  // Load latest budget items
  const matrix = await prisma.designBidMatrix.findFirst({
    where:   { projectId, ...NOT_CO_VERSION },
    orderBy: { version: 'desc' },
    include: { items: { where: { isArchived: false } } },
  });
  if (!matrix?.items?.length) return NextResponse.json({ written: 0 });

  const eligible = matrix.items.filter(i => i.manufacturer && i.partNumber && i.cnPerUnit);

  if (eligible.length === 0) return NextResponse.json({ written: 0 });

  await prisma.productPriceHistory.createMany({
    data: eligible.map(i => ({
      manufacturer:  normalizeKey(i.manufacturer),
      partNumber:    normalizeKey(i.partNumber),
      unitPrice:     i.cnPerUnit,
      projectId,
      budgetVersion: matrix.version,
    })),
    skipDuplicates: false, // allow multiple entries over time
  });

  return NextResponse.json({ written: eligible.length });
}
