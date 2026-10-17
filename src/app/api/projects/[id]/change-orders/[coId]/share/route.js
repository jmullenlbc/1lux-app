import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET, get existing share link
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const share = await prisma.changeOrderShare.findFirst({
    where:   { changeOrderId: params.coId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ share: share || null });
}

// POST, create or regenerate share link
export async function POST(req, { params }) {
  // Change orders are job money: Construction, Operations, Finance and admins.
  const { user, error } = await requirePermission(req, 'editJobMoney');
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete existing shares for this CO
  await prisma.changeOrderShare.deleteMany({ where: { changeOrderId: params.coId } });

  const share = await prisma.changeOrderShare.create({
    data: {
      changeOrderId: params.coId,
      createdById:   user.id,
    },
  });

  return NextResponse.json({ share });
}

// DELETE, revoke share link
export async function DELETE(req, { params }) {
  const { error } = await requirePermission(req, 'editJobMoney');
  if (error) return error;

  await prisma.changeOrderShare.deleteMany({ where: { changeOrderId: params.coId } });
  return NextResponse.json({ ok: true });
}
