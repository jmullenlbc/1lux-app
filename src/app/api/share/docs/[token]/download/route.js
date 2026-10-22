import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { loadLink, requirePass, docOnLink, ipHashOf } from '@/lib/salesDocs/share';
import { getSalesDocObject, presignSalesDocDownload } from '@/lib/salesDocs/storage';

export const runtime = 'nodejs';

const MIME = { PDF: 'application/pdf', XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

// GET /api/share/docs/[token]/download?docId=
// Only when the link allows downloads. Logged as a DOWNLOAD event.
export async function GET(request, { params }) {
  const link = await loadLink(params.token);
  const pass = await requirePass(link);
  if (!pass) return new NextResponse(null, { status: 401 });
  if (!link.allowDownload) return NextResponse.json({ error: 'Downloads are off for this link.' }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const doc = docOnLink(link, sp.get('docId') || '');
  if (!doc) return new NextResponse(null, { status: 404 });

  // Tie it to the visit when the page sent one that belongs to this visitor, link and document.
  const viewId = sp.get('viewId') || '';
  const view = viewId
    ? await prisma.salesDocView.findFirst({ where: { id: viewId, linkId: link.id, visitorId: pass.visitorId, docId: doc.id }, select: { id: true } }).catch(() => null)
    : null;

  const v = doc.currentVersion;
  await prisma.salesDocEvent.create({
    data: { type: 'DOWNLOAD', linkId: link.id, viewId: view?.id || null, visitorId: pass.visitorId, docId: doc.id, ipHash: ipHashOf(request) },
  }).catch(() => {});

  const url = await presignSalesDocDownload(v.storageKey, v.fileName);
  if (url) return NextResponse.redirect(url, 302);
  const buf = await getSalesDocObject(v.storageKey);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': MIME[doc.kind] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${String(v.fileName || 'document').replace(/["\\\r\n]/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
