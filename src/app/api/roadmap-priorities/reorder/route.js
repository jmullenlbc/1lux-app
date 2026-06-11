import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(request) {
  const { error } = await requireAuth(request);
  if (error) return error;
  const { orderedIds } = await request.json();
  if (!Array.isArray(orderedIds)) return NextResponse.json({ error: 'orderedIds required' }, { status: 400 });
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.roadmapPriority.update({ where: { id }, data: { sortOrder: index } })
    )
  );
  return NextResponse.json({ ok: true });
}
