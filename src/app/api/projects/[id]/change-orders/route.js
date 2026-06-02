import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProjectRates, calcCOTotal, nextCoNumber } from '@/lib/changeOrderRates';

const CO_INCLUDE = {
  optionGroups: {
    orderBy: { sortOrder: 'asc' },
    include: { lineItems: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  },
  sends: { orderBy: { sentAt: 'desc' }, include: { sentBy: { select: { name: true, email: true } } } },
  createdBy: { select: { name: true, email: true } },
};

// GET /api/projects/[id]/change-orders
// Returns all COs + contract balance rollup
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const [changeOrders, project, rates, legacyFiles] = await Promise.all([
    prisma.changeOrder.findMany({
      where:   { projectId: params.id },
      orderBy: { coNumber: 'asc' },
      include: CO_INCLUDE,
    }),
    prisma.project.findUnique({
      where:  { id: params.id },
      select: { contractValue: true, totalInvoiced: true },
    }),
    getProjectRates(params.id),
    // Legacy CO PDFs uploaded before the structured system
    prisma.projectFile.findMany({
      where: {
        projectId: params.id,
        tab:       'ca',
        tags:      { contains: 'Change Order' },
        parsedAmount: { not: null },
      },
      select: { parsedAmount: true },
    }),
  ]);

  // Compute per-CO totals and contract balance rollup
  const cos = changeOrders.map(co => ({
    ...co,
    totalValue: calcCOTotal(co, rates),
  }));

  // Legacy PDF-based CO total (from files tagged "Change Order" with parsed amounts)
  const legacyTotal = legacyFiles.reduce((s, f) => s + (f.parsedAmount || 0), 0);

  const approvedCOTotal = cos.filter(c => c.status === 'APPROVED').reduce((s, c) => s + c.totalValue, 0);
  const pendingCOTotal  = cos.filter(c => c.status === 'SENT').reduce((s, c) => s + c.totalValue, 0);
  const originalContract  = project?.contractValue ?? 0;
  const newContractTotal  = originalContract + approvedCOTotal + legacyTotal;

  return NextResponse.json({
    changeOrders: cos,
    balance: {
      originalContract,
      approvedCOTotal,
      pendingCOTotal,
      legacyTotal,
      newContractTotal,
    },
    rates,
  });
}

// POST /api/projects/[id]/change-orders
// Creates a new CO with one default option group
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { title = 'New Change Order', date, notes } = body;

  const coNumber = await nextCoNumber(params.id);

  const co = await prisma.changeOrder.create({
    data: {
      projectId:   params.id,
      coNumber,
      title,
      date:        date ? new Date(date) : new Date(),
      notes:       notes || null,
      createdById: user.id,
      optionGroups: {
        create: [{
          label:      'Default',
          sortOrder:  0,
          isSelected: true,
        }],
      },
    },
    include: CO_INCLUDE,
  });

  return NextResponse.json(co, { status: 201 });
}
