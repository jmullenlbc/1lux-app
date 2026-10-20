'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

// Sales Docs viewers (0137), shared by the staff preview and the public link
// page. PDFs load in slices through our own route (never a storage address);
// workbooks show the table that was drawn when the file was read.

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

/** One PDF page drawn to fit its box. Draws when it scrolls near view. */
export function PdfPage({ pdf, pageNumber, eager = false }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const [near, setNear] = useState(eager);
  const [ratio, setRatio] = useState(1.294); // letter portrait until the page says

  useEffect(() => {
    if (eager || !boxRef.current) return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: '600px 0px' });
    io.observe(boxRef.current);
    return () => io.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!pdf || !near) return undefined;
    let task = null;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const width = boxRef.current?.clientWidth || base.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      await task.promise.catch(() => {});
    })().catch(() => {});
    return () => { cancelled = true; try { task?.cancel(); } catch { /* already done */ } };
  }, [pdf, pageNumber, near]);

  return (
    <div ref={boxRef} data-page={pageNumber} className="relative w-full bg-white shadow-sm border border-slate-200" style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

/** Load a ranged PDF once; returns { pdf, error }. */
export function useRangedPdf(url, size) {
  const [state, setState] = useState({ pdf: null, error: '' });
  useEffect(() => {
    if (!url || !size) return undefined;
    let cancelled = false;
    let doc = null;
    setState({ pdf: null, error: '' });
    openRangedPdf(url, size)
      .then((d) => { doc = d; if (!cancelled) setState({ pdf: d, error: '' }); })
      .catch((e) => { if (!cancelled) setState({ pdf: null, error: e.message || 'The file did not load.' }); });
    return () => { cancelled = true; try { doc?.destroy(); } catch { /* gone */ } };
  }, [url, size]);
  return state;
}

/** A drawn worksheet: column letters, row numbers, merged cells, numbers right aligned. */
export function SheetTable({ data, maxHeight = '70vh' }) {
  const layout = useMemo(() => {
    if (!data) return null;
    const span = new Map();
    const covered = new Set();
    for (const [r0, c0, rs, cs] of data.merges || []) {
      span.set(`${r0}:${c0}`, [rs, cs]);
      for (let r = r0; r < r0 + rs; r++) for (let c = c0; c < c0 + cs; c++) if (r !== r0 || c !== c0) covered.add(`${r}:${c}`);
    }
    return { span, covered };
  }, [data]);

  if (!data) return null;
  if (!data.rowCount) return <p className="text-sm text-slate-500 p-4">This sheet is empty.</p>;
  return (
    <div className="overflow-auto border border-slate-200 rounded-lg bg-white" style={{ maxHeight }}>
      <table className="border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 44 }} />
          {data.colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-20 bg-slate-100 border border-slate-200" />
            {data.colLabels.map((l) => (
              <th key={l} className="sticky top-0 z-10 bg-slate-100 border border-slate-200 px-1 py-0.5 font-medium text-slate-500">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.cells.map((row, r) => (
            <tr key={r}>
              <th className="sticky left-0 z-10 bg-slate-100 border border-slate-200 px-1 py-0.5 font-medium text-slate-500 text-right">{data.rowNums[r]}</th>
              {row.map((cell, c) => {
                const key = `${r}:${c}`;
                if (layout.covered.has(key)) return null;
                const [rs, cs] = layout.span.get(key) || [1, 1];
                const num = Array.isArray(cell);
                const text = num ? cell[0] : cell;
                return (
                  <td
                    key={c} rowSpan={rs > 1 ? rs : undefined} colSpan={cs > 1 ? cs : undefined}
                    className={`border border-slate-200 px-1.5 py-0.5 text-slate-800 align-top whitespace-pre-wrap break-words ${num ? 'text-right tabular-nums' : ''}`}
                  >
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.truncated && <p className="text-xs text-slate-500 px-3 py-2 border-t border-slate-200">Only the first 2,000 rows and 60 columns are shown.</p>}
    </div>
  );
}

/** Fetch one drawn sheet as JSON. */
export function useSheet(url) {
  const [state, setState] = useState({ data: null, error: '', loading: false });
  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    setState({ data: null, error: '', loading: true });
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('This sheet did not load.'))))
      .then((data) => { if (!cancelled) setState({ data, error: '', loading: false }); })
      .catch((e) => { if (!cancelled) setState({ data: null, error: e.message, loading: false }); });
    return () => { cancelled = true; };
  }, [url]);
  return state;
}
