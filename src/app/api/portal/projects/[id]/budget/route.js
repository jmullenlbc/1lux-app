import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';
import { NOT_CO_VERSION } from '@/lib/budgetVersions';
import { getProjectRates, calcCOTotal, CO_OPTION_MONEY } from '@/lib/changeOrderRates';

// Rates are stored as decimals, the portal page works in percents
const asPercent = rate => Math.round((rate ?? 0) * 1e6) / 1e4;

export async function GET(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await prisma.projectExternalContact.findFirst({
    where: { project_id: params.id, portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
  });
  if (!contact?.canViewBudgets) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Latest DesignBidMatrix for this project (highest version). A version pushed
  // from a change order holds only that change order's lines, so it is not the budget.
  const matrix = await prisma.designBidMatrix.findFirst({
    where: { projectId: params.id, ...NOT_CO_VERSION },
    orderBy: { version: 'desc' },
    select: {
      version: true,
      createdAt: true,
      salesTaxPct: true,
      freightPct: true,
      warehousingPct: true,
      freightOverride: true,
      warehousingOverride: true,
      items: {
        where:   { isArchived: false },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, type: true, description: true, locationTag: true,
          manufacturer: true, qty: true, cnPerUnit: true, cnTotal: true,
          sortOrder: true,
        },
      },
    },
  });

  // Approved COs and their totals
  const changeOrders = await prisma.changeOrder.findMany({
    where: { projectId: params.id, status: { not: 'DRAFT' } },
    select: {
      id: true, coNumber: true, title: true, status: true, date: true, salesTaxPct: true, freightPct: true, warehousingPct: true,
      optionGroups: {
        select: {
          isSelected: true, ...CO_OPTION_MONEY,
          lineItems: {
            select: { id: true, qty: true, cnUnitPrice: true, isOptionRow: true, parentLineItemId: true, isGroupSelected: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Build CO summaries
  const rates = await getProjectRates(params.id);
  const coSummaries = changeOrders.map(co => ({
    id: co.id, coNumber: co.coNumber, title: co.title, status: co.status, total: calcCOTotal(co, rates),
  }));

  const approvedTotal = coSummaries.filter(c => c.status === 'APPROVED').reduce((s, c) => s + c.total, 0);
  const pendingTotal  = coSummaries.filter(c => c.status !== 'APPROVED' && c.status !== 'REJECTED').reduce((s, c) => s + c.total, 0);

  // Rate fields live on ProjectData (not Project)
  const projectData = await prisma.projectData.findUnique({
    where:  { projectId: params.id },
    select: { salesTaxPct: true, freightPct: true, warehousingPct: true },
  });

  return NextResponse.json({
    matrix: matrix
      ? {
          version: matrix.version,
          items: matrix.items,
          createdAt: matrix.createdAt,
          salesTaxRate:    asPercent(matrix.salesTaxPct ?? projectData?.salesTaxPct),
          freightRate:     asPercent(matrix.freightPct ?? projectData?.freightPct),
          warehousingRate: asPercent(matrix.warehousingPct ?? projectData?.warehousingPct),
          freightOverride:     matrix.freightOverride,
          warehousingOverride: matrix.warehousingOverride,
        }
      : null,
    coSummary: {
      approvedTotal,
      pendingTotal,
      approvedCount: coSummaries.filter(c => c.status === 'APPROVED').length,
      pendingCount:  coSummaries.filter(c => c.status !== 'APPROVED' && c.status !== 'REJECTED').length,
    },
  });
}
