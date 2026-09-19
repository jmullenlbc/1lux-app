import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { looseNumberOrNull } from '@/lib/numberInput';

// PATCH /api/projects/[id]/design-bid-matrix/items/[itemId]
// Editable fields on the current (latest) bid matrix only: pricing, salesRep, rfqStatus, notes
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Verify item belongs to this project's latest bid matrix
  const item = await prisma.designBidMatrixItem.findUnique({
    where: { id: params.itemId },
    include: { matrix: { select: { projectId: true, version: true } } },
  });
  if (!item || item.matrix.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only allow edits to the latest version
  const latest = await prisma.designBidMatrix.findFirst({
    where: { projectId: params.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  if (item.matrix.version !== latest.version) {
    return NextResponse.json({ error: 'Cannot edit a historical bid matrix' }, { status: 403 });
  }

  const body = await request.json();
  const { dnPerUnit, cnPerUnit, salesRep, rfqStatus, qty, qtyType, notes, internalNotes, isArchived } = body;

  const now = new Date();
  const hasPricingChange = dnPerUnit !== undefined || cnPerUnit !== undefined;

  const updated = await prisma.designBidMatrixItem.update({
    where: { id: params.itemId },
    data: {
      ...(dnPerUnit      !== undefined && { dnPerUnit:      looseNumberOrNull(dnPerUnit) }),
      ...(cnPerUnit      !== undefined && { cnPerUnit:      looseNumberOrNull(cnPerUnit) }),
      ...(salesRep       !== undefined && { salesRep:       salesRep       || null }),
      ...(rfqStatus      !== undefined && { rfqStatus:      rfqStatus      || null }),
      ...(qty            !== undefined && { qty:            looseNumberOrNull(qty) }),
      ...(qtyType        !== undefined && { qtyType:        qtyType        || null }),
      ...(notes          !== undefined && { notes:          notes          || null }),
      ...(internalNotes  !== undefined && { internalNotes:  internalNotes  || null }),
      ...(isArchived     !== undefined && { isArchived:     Boolean(isArchived) }),
      ...(hasPricingChange               && { pricingLastUpdated: now }),
    },
  });

  return NextResponse.json(updated);
}
