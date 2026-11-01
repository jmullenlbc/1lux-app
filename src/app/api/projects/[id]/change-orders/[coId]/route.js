import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, isClientViewer, isAnyAdmin, can } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProjectRates, calcCOTotal, ratesForCO, freezeRates } from '@/lib/changeOrderRates';

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
  approvals: {
    orderBy: { createdAt: 'desc' },
    include: {
      user:       { select: { name: true, email: true } },
      portalUser: { select: { name: true, email: true } },
    },
  },
  createdBy: { select: { name: true, email: true } },
};

// GET /api/projects/[id]/change-orders/[coId]
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  // Line items carry ILC's buy price (originalDN). Contractors see change orders
  // only through the client portal, which leaves it out.
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const co = await prisma.changeOrder.findUnique({
    where: { id: params.coId },
    include: CO_INCLUDE,
  });
  if (!co || co.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rates = await getProjectRates(params.id);
  return NextResponse.json({
    ...co, totalValue: calcCOTotal(co, rates), rates: ratesForCO(co, rates),
    canEdit: can(user, 'editJobMoney'), canUndoApproval: isAnyAdmin(user.role),
  });
}

// PATCH /api/projects/[id]/change-orders/[coId]
// Update header fields (title, date, status, notes, salesTaxPct)
export async function PATCH(req, { params }) {
  // Change orders are job money: Construction, Operations, Finance and admins.
  const { user, error } = await requirePermission(req, 'editJobMoney');
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (co.status === 'APPROVED') {
    return NextResponse.json({ error: 'This change order is approved and locked. Nothing was changed. An admin can undo the approval.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { title, date, status, notes, salesTaxPct } = body;

  if (status != null && !['DRAFT', 'SENT'].includes(status)) {
    return NextResponse.json({ error: 'Use Mark Approved to approve a change order, so who and when get recorded. Nothing was changed.' }, { status: 400 });
  }
  if (salesTaxPct !== undefined) {
    if (co.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Sales tax is frozen once a change order is sent. Nothing was changed. Move it back to Draft to change the rate.' }, { status: 400 });
    }
    if (salesTaxPct !== null && !(Number.isFinite(salesTaxPct) && salesTaxPct >= 0 && salesTaxPct <= 1)) {
      return NextResponse.json({ error: 'Sales tax has to be between 0% and 100%. Nothing was changed.' }, { status: 400 });
    }
  }

  // Going to Sent freezes the rates, the same as the Send button. Back to Draft
  // follows the job's freight and warehousing again, there is no box for them.
  const rates   = await getProjectRates(params.id);
  const taxNow  = salesTaxPct !== undefined ? salesTaxPct : co.salesTaxPct;
  const updated = await prisma.changeOrder.update({
    where: { id: params.coId },
    data: {
      ...(title  != null && { title }),
      ...(date   != null && { date: new Date(date) }),
      ...(status != null && { status }),
      ...(notes  != null && { notes: notes || null }),
      ...(salesTaxPct !== undefined && { salesTaxPct }),
      ...(status === 'SENT' && co.status === 'DRAFT' && freezeRates({ ...co, salesTaxPct: taxNow }, rates)),
      ...(status === 'DRAFT' && co.status !== 'DRAFT' && { freightPct: null, warehousingPct: null }),
    },
    include: CO_INCLUDE,
  });

  return NextResponse.json({ ...updated, totalValue: calcCOTotal(updated, rates), rates: ratesForCO(updated, rates) });
}

// DELETE /api/projects/[id]/change-orders/[coId]
// Only DRAFT COs can be deleted
export async function DELETE(req, { params }) {
  const { error } = await requirePermission(req, 'editJobMoney');
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
