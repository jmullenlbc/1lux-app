import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH — update line item
export async function PATCH(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'CO is locked' }, { status: 403 });

  const item = await prisma.changeOrderLineItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.optionGroupId !== params.groupId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body  = await req.json().catch(() => ({}));
  const rates = await (await import('@/lib/changeOrderRates')).getProjectRates(params.id);

  // If DN is being updated, auto-recalculate CN unless CN was explicitly provided too
  let cnUnitPrice = body.cnUnitPrice != null ? parseFloat(body.cnUnitPrice) : undefined;
  if (body.originalDN != null && body.cnUnitPrice == null && rates.marginPct != null) {
    const dn = parseFloat(body.originalDN);
    const factor = 1 - rates.marginPct;
    if (!isNaN(dn) && factor > 0) cnUnitPrice = Math.round((dn / factor) * 100) / 100;
  }

  const updated = await prisma.changeOrderLineItem.update({
    where: { id: params.itemId },
    data: {
      ...(body.fixtureType    != null && { fixtureType:    body.fixtureType    }),
      ...(body.qty            != null && { qty:            parseFloat(body.qty) }),
      ...(body.manufacturer   != null && { manufacturer:   body.manufacturer   || null }),
      ...(body.partNumber     != null && { partNumber:     body.partNumber     || null }),
      ...(body.description    != null && { description:    body.description    || null }),
      ...(body.originalDN     != null && { originalDN:     parseFloat(body.originalDN) || null }),
      ...(cnUnitPrice         != null && { cnUnitPrice }),
      ...(body.quoteReference != null && { quoteReference: body.quoteReference || null }),
      ...(body.leadTime       != null && { leadTime:       body.leadTime       || null }),
      ...(body.notes          != null && { notes:          body.notes          || null }),
      ...(body.sortOrder      != null && { sortOrder:      parseInt(body.sortOrder) }),
      ...(body.optionLabel    != null && { optionLabel:    body.optionLabel    || null }),
    },
  });

  return NextResponse.json(updated);
}

// DELETE — remove line item
export async function DELETE(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'CO is locked' }, { status: 403 });

  await prisma.changeOrderLineItem.delete({ where: { id: params.itemId } });
  return NextResponse.json({ ok: true });
}
