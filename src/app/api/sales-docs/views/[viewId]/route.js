import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';

// GET /api/sales-docs/views/[viewId]: one visit, page by page (or sheet by sheet),
// plus what else happened on it (downloads, forwards).
export async function GET(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const view = await prisma.salesDocView.findUnique({
    where: { id: params.viewId },
    include: {
      visitor: { select: { email: true, name: true, matchType: true, client: { select: { id: true, name: true } }, contact: { select: { id: true, name: true } } } },
      link: { select: { id: true, name: true, recipientEmail: true } },
      doc: { select: { id: true, title: true, kind: true } },
      version: { select: { version: true, pageCount: true, sheets: { where: { hidden: false }, orderBy: { index: 'asc' }, select: { index: true, name: true } } } },
      unitStats: { orderBy: { unitIndex: 'asc' }, select: { unitIndex: true, label: true, durationMs: true, visits: true } },
      events: { orderBy: { createdAt: 'asc' }, select: { type: true, createdAt: true } },
    },
  });
  if (!view) return badRequest('Not found', 404);
  return NextResponse.json({ view });
}
