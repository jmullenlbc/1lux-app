import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { looseNumberOrNull, looseInteger } from '@/lib/numberInput';

// PATCH, update line item
export async function PATCH(req, { params }) {
  const { error } = await requirePermission(req, 'editJobMoney'); // Construction, Operations, Finance, admins
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'This change order is approved and locked. Nothing was changed. An admin can undo the approval.' }, { status: 403 });

  const item = await prisma.changeOrderLineItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.optionGroupId !== params.groupId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body  = await req.json().catch(() => ({}));
  const rates = await (await import('@/lib/changeOrderRates')).getProjectRates(params.id);

  // If DN is being updated, auto-recalculate CN unless CN was explicitly provided too
  let cnUnitPrice = body.cnUnitPrice != null ? looseNumberOrNull(body.cnUnitPrice) : undefined;
  if (body.originalDN != null && body.cnUnitPrice == null && rates.marginPct != null) {
    const dn = looseNumberOrNull(body.originalDN);
    const factor = 1 - rates.marginPct;
    if (dn != null && factor > 0) cnUnitPrice = cents(dn / factor);
  }

  const updated = await prisma.changeOrderLineItem.update({
    where: { id: params.itemId },
    data: {
      ...(body.fixtureType    != null && { fixtureType:    body.fixtureType    }),
      ...(body.qty            != null && { qty:            looseNumberOrNull(body.qty) }),
      ...(body.manufacturer   != null && { manufacturer:   body.manufacturer   || null }),
      ...(body.partNumber     != null && { partNumber:     body.partNumber     || null }),
      ...(body.description    != null && { description:    body.description    || null }),
      ...(body.originalDN     != null && { originalDN:     looseNumberOrNull(body.originalDN) }),
      ...(cnUnitPrice         != null && { cnUnitPrice }),
      ...(body.quoteReference != null && { quoteReference: body.quoteReference || null }),
      ...(body.leadTime       != null && { leadTime:       body.leadTime       || null }),
      ...(body.notes          != null && { notes:          body.notes          || null }),
      ...(body.sortOrder      != null && { sortOrder:      looseInteger(body.sortOrder) }),
      ...(body.optionLabel    != null && { optionLabel:    body.optionLabel    || null }),
      ...(body.creditTaxPct !== undefined && { creditTaxPct: looseNumberOrNull(body.creditTaxPct) }),
    },
  });

  return NextResponse.json(updated);
}

// DELETE, remove line item
export async function DELETE(req, { params }) {
  const { error } = await requirePermission(req, 'editJobMoney'); // Construction, Operations, Finance, admins
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'This change order is approved and locked. Nothing was changed. An admin can undo the approval.' }, { status: 403 });

  // A restocking fee goes with the credit it came from
  await prisma.changeOrderLineItem.deleteMany({ where: { feeForLineId: params.itemId } });
  await prisma.changeOrderLineItem.delete({ where: { id: params.itemId } });
  return NextResponse.json({ ok: true });
}
