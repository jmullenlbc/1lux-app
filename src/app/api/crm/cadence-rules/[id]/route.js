import { NextResponse } from 'next/server';
import { requireAuth, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/crm/cadence-rules/[id]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existing = await prisma.relationshipCadenceRule.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  const body = await request.json();
  const { label, cadenceDays, isActive } = body;

  const data = {};
  if (label       !== undefined) data.label       = label.trim();
  if (cadenceDays !== undefined) data.cadenceDays  = Number(cadenceDays);
  if (isActive    !== undefined) data.isActive     = Boolean(isActive);

  const rule = await prisma.relationshipCadenceRule.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ rule });
}

// DELETE /api/crm/cadence-rules/[id]  — admin only
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  if (!isAnyAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const existing = await prisma.relationshipCadenceRule.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  await prisma.relationshipCadenceRule.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
