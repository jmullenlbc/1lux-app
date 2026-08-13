import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  return isSuperAdmin(user.role) || p.createdById === user.id;
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { typeCode, description, location, sortOrder } = await request.json();
  const item = await prisma.submittalItem.update({
    where: { id: params.itemId },
    data: {
      ...(typeCode     !== undefined && { typeCode }),
      ...(description  !== undefined && { description }),
      ...(location     !== undefined && { location }),
      ...(sortOrder    !== undefined && { sortOrder }),
    },
  });
  return NextResponse.json({ item });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.submittalItem.delete({ where: { id: params.itemId } });
  return NextResponse.json({ success: true });
}
