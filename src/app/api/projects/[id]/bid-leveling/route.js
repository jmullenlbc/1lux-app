import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { guardLeveling } from '@/lib/bidLeveling/guard';

// GET /api/projects/[id]/bid-leveling  every leveling on the project (archived left out)
export async function GET(request, { params }) {
  const g = await guardLeveling(params);
  if (g.error) return g.error;
  const levelings = await prisma.bidLeveling.findMany({
    where: { projectId: params.id, archivedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, createdAt: true, _count: { select: { bids: { where: { archivedAt: null } } } } },
  });
  return NextResponse.json({ levelings });
}

// POST /api/projects/[id]/bid-leveling  { name }
export async function POST(request, { params }) {
  const g = await guardLeveling(params);
  if (g.error) return g.error;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 120) || `${g.project.name} bid leveling`;
  const leveling = await prisma.bidLeveling.create({ data: { projectId: params.id, name, createdById: g.user.id } });
  return NextResponse.json({ leveling }, { status: 201 });
}
