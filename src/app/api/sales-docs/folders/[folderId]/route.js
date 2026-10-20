import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';

// PATCH /api/sales-docs/folders/[folderId]  { name?, archived? }
// Archiving a folder moves its documents to "No folder"; nothing is lost.
export async function PATCH(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const data = {};
  if ('name' in body) {
    const n = String(body.name || '').trim().slice(0, 80);
    if (!n) return badRequest('Give the folder a name.');
    data.name = n;
  }
  if ('archived' in body) data.archivedAt = body.archived ? new Date() : null;
  if (!Object.keys(data).length) return badRequest('Nothing to change.');
  const folder = await prisma.salesDocFolder.update({ where: { id: params.folderId }, data }).catch(() => null);
  if (!folder) return badRequest('Not found', 404);
  if (data.archivedAt) await prisma.salesDoc.updateMany({ where: { folderId: folder.id }, data: { folderId: null } });
  return NextResponse.json({ folder });
}
