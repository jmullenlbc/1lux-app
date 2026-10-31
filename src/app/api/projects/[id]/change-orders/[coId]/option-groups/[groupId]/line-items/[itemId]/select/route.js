import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST, select this option as the active one within its group
// Deselects all other siblings (same root)
export async function POST(req, { params }) {
  const { error } = await requirePermission(req, 'editJobMoney'); // Construction, Operations, Finance, admins
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'This change order is approved and locked. Nothing was changed. An admin can undo the approval.' }, { status: 403 });

  const item = await prisma.changeOrderLineItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.optionGroupId !== params.groupId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Find root of this group
  const rootId = item.parentLineItemId || item.id;

  // Deselect all in the group (root + children), then select this one
  await prisma.$transaction([
    prisma.changeOrderLineItem.updateMany({
      where: {
        optionGroupId: params.groupId,
        OR: [{ id: rootId }, { parentLineItemId: rootId }],
      },
      data: { isGroupSelected: false },
    }),
    prisma.changeOrderLineItem.update({
      where: { id: params.itemId },
      data:  { isGroupSelected: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
