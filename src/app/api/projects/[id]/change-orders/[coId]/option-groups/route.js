import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/projects/[id]/change-orders/[coId]/option-groups
export async function POST(req, { params }) {
  const { error } = await requirePermission(req, 'editJobMoney'); // Construction, Operations, Finance, admins
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({
    where: { id: params.coId },
    include: { optionGroups: { select: { id: true, sortOrder: true } } },
  });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'CO is locked' }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const nextOrder = co.optionGroups.length;
  const label  = body.label || `Option ${nextOrder + 1}`;

  const group = await prisma.changeOrderOptionGroup.create({
    data: {
      changeOrderId: params.coId,
      label,
      sortOrder: nextOrder,
      isSelected: false,
    },
    include: { lineItems: true },
  });

  return NextResponse.json(group, { status: 201 });
}
