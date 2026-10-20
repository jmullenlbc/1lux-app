import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { getSalesDocObject, renderedSheetKey } from '@/lib/salesDocs/storage';

export const runtime = 'nodejs';

// GET /api/sales-docs/versions/[versionId]/sheets/[index]: one drawn sheet
// for the staff preview. Hidden sheets were never drawn, so they 404.
export async function GET(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const index = Number(params.index);
  if (!Number.isInteger(index) || index < 0) return badRequest('Not found', 404);
  const sheet = await prisma.salesDocSheet.findUnique({
    where: { versionId_index: { versionId: params.versionId, index } },
    select: { hidden: true, version: { select: { docId: true } } },
  });
  if (!sheet || sheet.hidden) return badRequest('Not found', 404);
  const buf = await getSalesDocObject(renderedSheetKey(sheet.version.docId, params.versionId, index)).catch(() => null);
  if (!buf) return badRequest('Not found', 404);
  return new NextResponse(buf, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}
