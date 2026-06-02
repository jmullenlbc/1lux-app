import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProjectRates, calcCOTotal } from '@/lib/changeOrderRates';

const CO_INCLUDE = {
  optionGroups: {
    orderBy: { sortOrder: 'asc' },
    include: { lineItems: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  },
  sends: {
    orderBy: { sentAt: 'desc' },
    include: { sentBy: { select: { name: true, email: true } } },
  },
  shares: { select: { token: true, createdAt: true, lastViewedAt: true } },
  createdBy: { select: { name: true, email: true } },
};

// GET /api/projects/[id]/change-orders/[coId]
export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({
    where: { id: params.coId },
    include: CO_INCLUDE,
  });
  if (!co || co.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rates = await getProjectRates(params.id);
  return NextResponse.json({ ...co, totalValue: calcCOTotal(co, rates), rates });
}

// PATCH /api/projects/[id]/change-orders/[coId]
// Update header fields (title, date, status, notes, totalInvoiced on project)
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (co.status === 'APPROVED') {
    return NextResponse.json({ error: 'Approved COs are locked' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { title, date, status, notes, totalInvoiced } = body;

  // totalInvoiced lives on the project, not the CO
  if (totalInvoiced != null) {
    await prisma.project.update({
      where: { id: params.id },
      data:  { totalInvoiced: parseFloat(totalInvoiced) || null },
    });
  }

  const updated = await prisma.changeOrder.update({
    where: { id: params.coId },
    data: {
      ...(title  != null && { title }),
      ...(date   != null && { date: new Date(date) }),
      ...(status != null && { status }),
      ...(notes  != null && { notes: notes || null }),
    },
    include: CO_INCLUDE,
  });

  const rates = await getProjectRates(params.id);
  return NextResponse.json({ ...updated, totalValue: calcCOTotal(updated, rates), rates });
}

// DELETE /api/projects/[id]/change-orders/[coId]
// Only DRAFT COs can be deleted
export async function DELETE(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (co.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Only DRAFT change orders can be deleted' }, { status: 403 });
  }

  await prisma.changeOrder.delete({ where: { id: params.coId } });
  return NextResponse.json({ ok: true });
}
