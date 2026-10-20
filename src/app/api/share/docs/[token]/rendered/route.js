import { NextResponse } from 'next/server';
import { loadLink, requirePass, docOnLink } from '@/lib/salesDocs/share';
import { getSalesDocObject, renderedSheetKey } from '@/lib/salesDocs/storage';

export const runtime = 'nodejs';

// GET /api/share/docs/[token]/rendered?docId=&index=
// One drawn sheet of a shared workbook. Only sheets that were shown are
// listed on the doc, so a hidden sheet's index is never served.
export async function GET(request, { params }) {
  const link = await loadLink(params.token);
  const pass = await requirePass(link);
  if (!pass) return new NextResponse(null, { status: 401 });
  const q = new URL(request.url).searchParams;
  const doc = docOnLink(link, q.get('docId') || '');
  const index = Number(q.get('index'));
  if (!doc || doc.kind !== 'XLSX' || !Number.isInteger(index)) return new NextResponse(null, { status: 404 });
  if (!doc.currentVersion.sheets.some((s) => s.index === index)) return new NextResponse(null, { status: 404 });

  const buf = await getSalesDocObject(renderedSheetKey(doc.id, doc.currentVersion.id, index)).catch(() => null);
  if (!buf) return new NextResponse(null, { status: 404 });
  return new NextResponse(buf, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}
