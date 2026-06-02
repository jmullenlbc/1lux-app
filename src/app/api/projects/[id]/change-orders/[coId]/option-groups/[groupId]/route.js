import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/projects/[id]/change-orders/[coId]/option-groups/[groupId]
// Update label or set as selected (enforces single-selection in transaction)
export async function PATCH(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const group = await prisma.changeOrderOptionGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.changeOrderId !== params.coId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'CO is locked' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { label, isSelected } = body;

  if (isSelected === true) {
    // Transaction: deselect all others, select this one
    await prisma.$transaction([
      prisma.changeOrderOptionGroup.updateMany({
        where: { changeOrderId: params.coId },
        data:  { isSelected: false },
      }),
      prisma.changeOrderOptionGroup.update({
        where: { id: params.groupId },
        data:  { isSelected: true, ...(label != null && { label }) },
      }),
    ]);
  } else {
    await prisma.changeOrderOptionGroup.update({
      where: { id: params.groupId },
      data: {
        ...(label      != null && { label }),
        ...(isSelected != null && { isSelected }),
      },
    });
  }

  const updated = await prisma.changeOrderOptionGroup.findUnique({
    where: { id: params.groupId },
    include: { lineItems: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  });
  return NextResponse.json(updated);
}

// DELETE /api/projects/[id]/change-orders/[coId]/option-groups/[groupId]
// Must keep at least one group
export async function DELETE(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({
    where: { id: params.coId },
    include: { optionGroups: { select: { id: true } } },
  });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'CO is locked' }, { status: 403 });
  if (co.optionGroups.length <= 1) return NextResponse.json({ error: 'Cannot delete the last option group' }, { status: 400 });

  await prisma.changeOrderOptionGroup.delete({ where: { id: params.groupId } });
  return NextResponse.json({ ok: true });
}
