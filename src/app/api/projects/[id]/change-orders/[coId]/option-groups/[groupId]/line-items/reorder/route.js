import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH — reorder line items: body = { order: [{ id, sortOrder }] }
export async function PATCH(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { order } = await req.json().catch(() => ({ order: [] }));
  if (!Array.isArray(order)) return NextResponse.json({ error: 'order must be an array' }, { status: 400 });

  await Promise.all(
    order.map(({ id, sortOrder }) =>
      prisma.changeOrderLineItem.update({ where: { id }, data: { sortOrder: Number(sortOrder) } })
    )
  );

  return NextResponse.json({ ok: true });
}
