import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';

export async function GET(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await prisma.projectExternalContact.findFirst({
    where: { project_id: params.id, portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
  });
  if (!contact?.canViewShipSchedule) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const shipments = await prisma.shipment.findMany({
    where:   { project_id: params.id },
    include: { lineItems: { orderBy: { createdAt: 'asc' } } },
    orderBy: { manufacturer: 'asc' },
  });

  return NextResponse.json({ shipments });
}
