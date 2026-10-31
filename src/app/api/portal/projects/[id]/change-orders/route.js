import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';
import { getProjectRates, calcCOTotal } from '@/lib/changeOrderRates';

export async function GET(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await prisma.projectExternalContact.findFirst({
    where: { project_id: params.id, portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
  });
  if (!contact?.canViewChangeOrders) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const changeOrders = await prisma.changeOrder.findMany({
    where:   { projectId: params.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, coNumber: true, title: true, status: true, date: true, notes: true,
      optionGroups: {
        select: {
          isSelected: true, discountAmount: true, discountPct: true,
          lineItems: {
            select: { id: true, qty: true, cnUnitPrice: true, isOptionRow: true, parentLineItemId: true, isGroupSelected: true },
          },
        },
      },
    },
  });

  const rates = await getProjectRates(params.id);
  const cos = changeOrders.map(co => {
    const total = calcCOTotal(co, rates);
    return {
      id:       co.id,
      coNumber: co.coNumber,
      title:    co.title,
      status:   co.status,
      date:     co.date,
      notes:    co.notes,
      total,
    };
  });

  const approvedTotal = cos.filter(c => c.status === 'APPROVED').reduce((s, c) => s + c.total, 0);
  const pendingTotal  = cos.filter(c => c.status !== 'APPROVED' && c.status !== 'REJECTED').reduce((s, c) => s + c.total, 0);

  return NextResponse.json({ changeOrders: cos, approvedTotal, pendingTotal });
}
