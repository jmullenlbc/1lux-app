import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(request, { params }) {
  const { error } = await requireAuth(request);
  if (error) return error;
  const { id } = params;
  const body = await request.json();
  const data = {};
  if (body.status !== undefined) {
    if (!['todo', 'wip', 'done'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    data.name = body.name.trim();
  }
  const item = await prisma.roadmapPriority.update({ where: { id }, data });
  return NextResponse.json(item);
}

export async function DELETE(request, { params }) {
  const { error } = await requireAuth(request);
  if (error) return error;
  await prisma.roadmapPriority.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
