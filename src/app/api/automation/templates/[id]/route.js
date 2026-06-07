import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = params;

  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const body = await req.json();
  const { name, channel, scenario, dealStage, clientType, subject, body: templateBody, direction, variables, isDefault, isActive } = body;

  const updated = await prisma.messageTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(channel !== undefined && { channel }),
      ...(scenario !== undefined && { scenario }),
      ...(dealStage !== undefined && { dealStage }),
      ...(clientType !== undefined && { clientType }),
      ...(subject !== undefined && { subject }),
      ...(templateBody !== undefined && { body: templateBody }),
      ...(direction !== undefined && { direction: direction || null }),
      ...(variables !== undefined && { variables }),
      ...(isDefault !== undefined && { isDefault }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json({ template: updated });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const adminRoles = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'];
  if (!adminRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = params;

  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  await prisma.messageTemplate.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
