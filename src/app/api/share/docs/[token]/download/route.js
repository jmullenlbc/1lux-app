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
  const doc = docOnLink(link, new URL(request.url).searchParams.get('docId') || '');
  if (!doc) return new NextResponse(null, { status: 404 });

  const v = doc.currentVersion;
  await prisma.salesDocEvent.create({
    data: { type: 'DOWNLOAD', linkId: link.id, visitorId: pass.visitorId, docId: doc.id, ipHash: ipHashOf(request) },
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
