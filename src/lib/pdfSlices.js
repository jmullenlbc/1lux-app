// Open a PDF a slice at a time through one of our own Range routes. The bucket
// only allows cross-origin PUT, so the browser cannot read a storage address
// with fetch, and a whole big PDF will not fit through the server in one reply.

const CHUNK = 256 * 1024;
const MAX_SLICE = 3 * 1024 * 1024; // the file routes send 3 MB at most

/** Bytes [begin, end) of a PDF, asked for in slices the route will serve. */
async function fetchRange(url, begin, end) {
  const parts = [];
  let at = begin;
  while (at < end) {
    const to = Math.min(end, at + MAX_SLICE) - 1;
    const res = await fetch(url, { headers: { Range: `bytes=${at}-${to}` }, credentials: 'same-origin', cache: 'no-store' });
    if (res.status !== 206) throw new Error(`The file did not load (${res.status}).`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length) throw new Error('The file did not load.');
    parts.push(buf);
    at += buf.length;
  }
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** The file's full size, read off a one byte slice. */
export async function rangedSize(url) {
  const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, credentials: 'same-origin', cache: 'no-store' });
  const total = Number(/\/(\d+)$/.exec(res.headers.get('content-range') || '')?.[1]);
  if (res.status !== 206 || !total) throw new Error(`The file did not load (${res.status}).`);
  return total;
}

/** Open a PDF that lives behind one of our Range routes. */
export async function openRangedPdf(url, size) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  class Transport extends pdfjs.PDFDataRangeTransport {
    requestDataRange(begin, end) {
      fetchRange(url, begin, end).then((buf) => this.onDataRange(begin, buf)).catch(() => {});
    }
  }
  const first = await fetchRange(url, 0, Math.min(size, CHUNK));
  const transport = new Transport(size, first);
  return pdfjs.getDocument({ range: transport, rangeChunkSize: CHUNK, disableAutoFetch: true, disableStream: true }).promise;
}
