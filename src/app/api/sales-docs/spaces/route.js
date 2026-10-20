import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';

// Spaces (0137): a set of documents shared under one link, in sections.

// GET /api/sales-docs/spaces?archived=yes&clientId=
export async function GET(request) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const q = new URL(request.url).searchParams;
  const where = { archivedAt: q.get('archived') === 'yes' ? { not: null } : null };
  if (q.get('clientId')) where.clientId = q.get('clientId');
  const spaces = await prisma.salesDocSpace.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, description: true, createdAt: true, updatedAt: true, archivedAt: true,
      owner: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      _count: { select: { items: true, links: { where: { revokedAt: null } } } },
    },
  });
  return NextResponse.json({
    spaces: spaces.map(({ _count, ...s }) => ({ ...s, docCount: _count.items, liveLinks: _count.links })),
  });
}

// POST /api/sales-docs/spaces  { name, description?, clientId? }
export async function POST(request) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) return badRequest('Give the Space a name.');
  const space = await prisma.salesDocSpace.create({
    data: {
      name,
      description: String(body.description || '').trim().slice(0, 1000) || null,
      clientId: body.clientId || null,
      ownerId: user.id,
    },
  });
  return NextResponse.json({ space }, { status: 201 });
}
