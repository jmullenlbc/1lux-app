import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request) {
  const { error } = await requireAuth(request);
  if (error) return error;
  const items = await prisma.roadmapPriority.findMany({ orderBy: { sortOrder: 'asc' } });
  return NextResponse.json(items);
}

export async function POST(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const agg = await prisma.roadmapPriority.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (agg._max.sortOrder ?? -1) + 1;
  const item = await prisma.roadmapPriority.create({
    data: { name: name.trim(), status: 'todo', sortOrder },
  });
  return NextResponse.json(item);
}
