import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { INCLUDE_ARCHIVED } from '@/lib/archive';

// POST /api/projects/[id]/design-bid-matrix/duplicate
// Body: { sourceVersion?: number, name: string }
// Copies all items from the specified version (or the latest) into a new version.
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { sourceVersion, name } = body;

  // Find the source matrix to copy from
  const sourceMatrix = await prisma.designBidMatrix.findFirst({
    where: {
      projectId: params.id,
      ...(sourceVersion != null ? { version: sourceVersion } : {}),
    },
    orderBy: { version: 'desc' },
    include: { items: { where: { isArchived: false }, orderBy: [{ sortOrder: 'asc' }] } },
  });

  if (!sourceMatrix) {
    return NextResponse.json({ error: 'No bid matrix found to duplicate' }, { status: 404 });
  }

  // Next version number. An archived version still holds its number.
  const lastMatrix = await prisma.designBidMatrix.findFirst({
    where:   { projectId: params.id, ...INCLUDE_ARCHIVED },
    orderBy: { version: 'desc' },
    select:  { version: true },
  });
  const nextVersion = (lastMatrix?.version ?? 0) + 1;

  // Copy items, carry all pricing forward
  const newItems = sourceMatrix.items.map(item => ({
    sourceItemId:       item.sourceItemId,
    type:               item.type,
    description:        item.description,
    locationTag:        item.locationTag,
    manufacturer:       item.manufacturer,
    partNumber:         item.partNumber,
    salesRep:           item.salesRep,
    rfqStatus:          item.rfqStatus,
    qty:                item.qty,
    qtyType:            item.qtyType,
    dnPerUnit:          item.dnPerUnit,
    cnPerUnit:          item.cnPerUnit,
    cnTotal:            item.cnTotal,
    pricingLastUpdated: item.pricingLastUpdated,
    notes:              item.notes,
    internalNotes:      item.internalNotes,
    sortOrder:          item.sortOrder,
    isArchived:         false,
  }));

  const newMatrix = await prisma.designBidMatrix.create({
    data: {
      projectId:        params.id,
      sourceScheduleId: sourceMatrix.sourceScheduleId,
      version:          nextVersion,
      pushedById:       user.id,
      submissionTag:    name?.trim() || `Copy of v${sourceMatrix.version}`,
      matrixType:       sourceMatrix.matrixType,
      changeSummary:    JSON.stringify({ duplicatedFrom: sourceMatrix.version }),
      salesTaxPct:      sourceMatrix.salesTaxPct,
      items:            { create: newItems },
    },
    include: {
      items:    { orderBy: [{ sortOrder: 'asc' }] },
      pushedBy: { select: { id: true, name: true } },
    },
  });

  // Also sync to PeerReviewItems so the live budget reflects the duplicate
  // (optional: only if explicitly requested, for now, just return the matrix)

  return NextResponse.json({ matrix: newMatrix, version: nextVersion }, { status: 201 });
}
