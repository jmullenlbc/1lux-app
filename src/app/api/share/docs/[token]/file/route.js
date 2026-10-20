import { NextResponse } from 'next/server';
import { loadLink, requirePass, docOnLink, parseRange } from '@/lib/salesDocs/share';
import { getSalesDocRange } from '@/lib/salesDocs/storage';

export const runtime = 'nodejs';

// GET /api/share/docs/[token]/file?docId=  (Range: bytes=a-b)
// Slices of the shared PDF, 3 MB at most each, for the viewer. Never the
// whole file in one go and never a storage address.
export async function GET(request, { params }) {
  const link = await loadLink(params.token);
  const pass = await requirePass(link);
  if (!pass) return new NextResponse(null, { status: 401 });
  const doc = docOnLink(link, new URL(request.url).searchParams.get('docId') || '');
  if (!doc || doc.kind !== 'PDF') return new NextResponse(null, { status: 404 });

  const v = doc.currentVersion;
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
