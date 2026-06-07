import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = params;

  const existing = await prisma.botRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Bot rule not found' }, { status: 404 });
  }

  const body = await req.json();
  const { name, triggerType, triggerConfig, actionType, actionConfig, appliesTo, isActive, executionOrder } = body;

  const updated = await prisma.botRule.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(triggerType !== undefined && { triggerType }),
      ...(triggerConfig !== undefined && { triggerConfig: typeof triggerConfig === 'string' ? triggerConfig : JSON.stringify(triggerConfig) }),
      ...(actionType !== undefined && { actionType }),
      ...(actionConfig !== undefined && { actionConfig: typeof actionConfig === 'string' ? actionConfig : JSON.stringify(actionConfig) }),
      ...(appliesTo !== undefined && { appliesTo }),
      ...(isActive !== undefined && { isActive }),
      ...(executionOrder !== undefined && { executionOrder }),
    },
  });

  return NextResponse.json({ rule: updated });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const adminRoles = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'];
  if (!adminRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = params;

  const existing = await prisma.botRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Bot rule not found' }, { status: 404 });
  }

  await prisma.botRule.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
