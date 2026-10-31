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
    // Drafts are ILC's working copies, a client sees a change order once it is sent
    where:   { projectId: params.id, status: { not: 'DRAFT' } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, coNumber: true, title: true, status: true, date: true, notes: true, salesTaxPct: true,
      approvals: {
        orderBy: { createdAt: 'desc' }, take: 1,
        select: { action: true, createdAt: true, portalUser: { select: { name: true } } },
      },
      optionGroups: {
        select: {
          label: true, isSelected: true, discountAmount: true, discountPct: true,
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
    const last  = co.status === 'APPROVED' && co.approvals[0]?.action === 'APPROVED' ? co.approvals[0] : null;
    const chosen = co.optionGroups.find(g => g.isSelected);
    return {
      id:       co.id,
      coNumber: co.coNumber,
      title:    co.title,
      status:   co.status,
      date:     co.date,
      notes:    co.notes,
      total,
      hasChosenOption: !!chosen,
      chosenOption:    chosen?.label ?? null,
      approvedAt:     last?.createdAt ?? null,
      approvedByName: last?.portalUser?.name ?? null,
    };
  });

  const approvedTotal = cos.filter(c => c.status === 'APPROVED').reduce((s, c) => s + c.total, 0);
  const pendingTotal  = cos.filter(c => c.status !== 'APPROVED' && c.status !== 'REJECTED').reduce((s, c) => s + c.total, 0);

  return NextResponse.json({ changeOrders: cos, approvedTotal, pendingTotal, canApprove: !!contact.canApproveChangeOrders });
}
