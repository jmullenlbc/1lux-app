import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';

// GET /api/sales-docs/folders: every open folder with its doc count.
export async function GET() {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const folders = await prisma.salesDocFolder.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, parentId: true, _count: { select: { docs: { where: { archivedAt: null } } } } },
  });
  return NextResponse.json({ folders: folders.map(({ _count, ...f }) => ({ ...f, docCount: _count.docs })) });
}

// POST /api/sales-docs/folders  { name, parentId? }
export async function POST(request) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) return badRequest('Give the folder a name.');
  const folder = await prisma.salesDocFolder.create({ data: { name, parentId: body.parentId || null } });
  return NextResponse.json({ folder }, { status: 201 });
}
