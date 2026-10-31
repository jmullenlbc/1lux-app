// Send a stored project or drawing file to the browser.
//
// The server cannot answer with much more than 4 MB in prod, so a big file
// never comes back in one reply. Three shapes:
//   Range header   a slice, for the viewers that read a PDF in pieces
//   small file     the bytes
//   big S3 file    a redirect to a short-lived storage link; a browser
//                  navigation or iframe follows it, a fetch cannot (the bucket
//                  only allows cross-origin PUT), so fetch callers use Range
import { NextResponse } from 'next/server';
import { getProjectFileBuffer, getProjectFileRange, getProjectFileUrl } from '@/lib/projectFileStorage';
import { parseRange } from '@/lib/salesDocs/share';

const ONE_REPLY_BYTES = 4 * 1024 * 1024;

const missing = () => NextResponse.json({ error: 'File not found' }, { status: 404 });

export async function serveStoredFile(request, { storedPath, name, mimeType, size }) {
  const contentType = mimeType || 'application/octet-stream';
  const rangeHeader = request.headers.get('range');

  if (rangeHeader && size) {
    const range = parseRange(rangeHeader, size);
    if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const slice = await getProjectFileRange(storedPath, range.start, range.end);
    if (!slice) return missing();
    return new Response(slice, {
      status: 206,
      headers: {
        'Content-Type':   contentType,
        'Content-Range':  `bytes ${range.start}-${range.start + slice.length - 1}/${size}`,
        'Content-Length': String(slice.length),
        'Cache-Control':  'private, no-store',
      },
    });
  }

  if (size > ONE_REPLY_BYTES) {
    const url = await getProjectFileUrl(storedPath, { name, contentType });
    if (url) return NextResponse.redirect(url, 302);
  }

  const buffer = await getProjectFileBuffer(storedPath);
  if (!buffer) return missing();
  return new Response(buffer, {
    headers: {
      'Content-Type':        contentType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"`,
      'Content-Length':      String(buffer.length),
    },
  });
}
