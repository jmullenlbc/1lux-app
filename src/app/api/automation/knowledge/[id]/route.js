import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = params;

  const existing = await prisma.botKnowledgeEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Knowledge entry not found' }, { status: 404 });
  }

  const body = await req.json();
  const { category, keywords, question, answer, isActive } = body;

  const updated = await prisma.botKnowledgeEntry.update({
    where: { id },
    data: {
      ...(category !== undefined && { category }),
      ...(keywords !== undefined && { keywords }),
      ...(question !== undefined && { question }),
      ...(answer !== undefined && { answer }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json({ entry: updated });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const adminRoles = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'];
  if (!adminRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = params;

  const existing = await prisma.botKnowledgeEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Knowledge entry not found' }, { status: 404 });
  }

  await prisma.botKnowledgeEntry.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
