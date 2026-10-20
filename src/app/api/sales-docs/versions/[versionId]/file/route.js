import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { getSalesDocObject, getSalesDocRange, presignSalesDocDownload } from '@/lib/salesDocs/storage';
import { parseRange } from '@/lib/salesDocs/share';

export const runtime = 'nodejs';

// GET /api/sales-docs/versions/[versionId]/file
//   Range: bytes=a-b  a slice of the PDF for the staff preview (3 MB at most)
//   ?download=1       the file itself (302 to S3, streamed in dev)
// Staff can open any version, blocked ones included; only links are guarded.
export async function GET(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const v = await prisma.salesDocVersion.findUnique({
    where: { id: params.versionId },
    select: { storageKey: true, sizeBytes: true, fileName: true, mimeType: true },
  });
  if (!v?.storageKey) return badRequest('Not found', 404);

  if (new URL(request.url).searchParams.get('download')) {
    const url = await presignSalesDocDownload(v.storageKey, v.fileName);
    if (url) return NextResponse.redirect(url, 302);
    const buf = await getSalesDocObject(v.storageKey);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': v.mimeType,
        'Content-Disposition': `attachment; filename="${v.fileName.replace(/["\\\r\n]/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const range = parseRange(request.headers.get('range'), v.sizeBytes);
  if (!range) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${v.sizeBytes}` } });
  const buf = await getSalesDocRange(v.storageKey, range.start, range.end);
  return new NextResponse(buf, {
    status: 206,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${range.start}-${range.start + buf.length - 1}/${v.sizeBytes}`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
