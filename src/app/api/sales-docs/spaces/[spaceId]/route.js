import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';

const VERSION = { select: { version: true, scanStatus: true, processStatus: true, pageCount: true } };

// GET /api/sales-docs/spaces/[spaceId]
export async function GET(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const space = await prisma.salesDocSpace.findUnique({
    where: { id: params.spaceId },
    include: {
      owner: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, section: true, sortOrder: true, doc: { select: { id: true, title: true, kind: true, archivedAt: true, currentVersion: VERSION } } },
      },
    },
  });
  if (!space) return badRequest('Not found', 404);
  return NextResponse.json({ space });
}

// PATCH /api/sales-docs/spaces/[spaceId]
//   { name?, description?, clientId?, archived?, items?: [{ docId, section }] }
// items, when sent, is the whole ordered list: order = position in the list.
export async function PATCH(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const space = await prisma.salesDocSpace.findUnique({ where: { id: params.spaceId }, select: { id: true } });
  if (!space) return badRequest('Not found', 404);

  const data = {};
  if ('name' in body) {
    const n = String(body.name || '').trim().slice(0, 120);
    if (!n) return badRequest('Give the Space a name.');
    data.name = n;
  }
  if ('description' in body) data.description = String(body.description || '').trim().slice(0, 1000) || null;
  if ('clientId' in body) data.clientId = body.clientId || null;
  if ('archived' in body) data.archivedAt = body.archived ? new Date() : null;

  const ops = [];
  if (Array.isArray(body.items)) {
    const seen = new Set();
    const items = body.items
      .filter((i) => i?.docId && !seen.has(i.docId) && seen.add(i.docId))
      .slice(0, 200)
      .map((i, n) => ({ docId: String(i.docId), section: String(i.section || '').trim().slice(0, 80) || null, sortOrder: n }));
    const docIds = items.map((i) => i.docId);
    const exist = await prisma.salesDoc.count({ where: { id: { in: docIds } } });
    if (exist !== docIds.length) return badRequest('One of those documents no longer exists.');
    ops.push(prisma.salesDocSpaceItem.deleteMany({ where: { spaceId: space.id, docId: { notIn: docIds } } }));
    for (const i of items) {
      ops.push(prisma.salesDocSpaceItem.upsert({
        where: { spaceId_docId: { spaceId: space.id, docId: i.docId } },
        create: { spaceId: space.id, ...i },
        update: { section: i.section, sortOrder: i.sortOrder },
      }));
    }
    data.updatedAt = new Date();
  }
  if (!Object.keys(data).length && !ops.length) return badRequest('Nothing to change.');
  await prisma.$transaction([...ops, prisma.salesDocSpace.update({ where: { id: space.id }, data })]);
  return GET(request, { params });
}
