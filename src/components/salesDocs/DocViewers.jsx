'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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

const PT_TO_PX = 96 / 72; // 100% zoom = the page at its printed size
const MAX_CANVAS_PX = 16e6; // browsers refuse bigger canvases; CSS stretches past it
const LETTER = { w: 612, h: 792 };

/**
 * One PDF page. Without `scale` it fills its box's width; with `scale` (CSS px
 * per PDF point) it is drawn at that size. Draws when near view and lets the
 * drawing go when far away, so long decks at high zoom stay light.
 */
export function PdfPage({ pdf, pageNumber, eager = false, scale = null, root = null, fallback = LETTER }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const drawnRef = useRef('');
  const [near, setNear] = useState(eager);
  const [size, setSize] = useState(fallback);

  useEffect(() => {
    if (!boxRef.current) return undefined;
    const io = new IntersectionObserver((es) => {
      setNear(eager || es.some((e) => e.isIntersecting));
    }, { root, rootMargin: '1200px 600px' });
    io.observe(boxRef.current);
    return () => io.disconnect();
  }, [eager, root]);

  useEffect(() => {
    if (near || !canvasRef.current) return;
    canvasRef.current.width = 0; // let the drawing go
    canvasRef.current.height = 0;
    drawnRef.current = '';
  }, [near]);

  useEffect(() => {
    if (!pdf || !near) return undefined;
    let task = null;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setSize((s) => (s.w === base.width && s.h === base.height ? s : { w: base.width, h: base.height }));
        const cssWidth = scale ? base.width * scale : (boxRef.current?.clientWidth || base.width);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cap = Math.sqrt(MAX_CANVAS_PX / (base.width * base.height));
        const drawScale = Math.min((cssWidth / base.width) * dpr, cap);
        const key = drawScale.toFixed(3);
        const canvas = canvasRef.current;
        if (!canvas || drawnRef.current === key) return;
        const viewport = page.getViewport({ scale: drawScale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        drawnRef.current = key;
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await task.promise.catch(() => { drawnRef.current = ''; });
      } catch { /* the page did not load */ }
    }, drawnRef.current ? 150 : 0); // wait out zoom clicks; the first drawing is right away
    return () => { cancelled = true; clearTimeout(timer); try { task?.cancel(); } catch { /* already done */ } };
  }, [pdf, pageNumber, near, scale]);

  const style = scale
    ? { width: Math.round(size.w * scale), height: Math.round(size.h * scale) }
    : { aspectRatio: `1 / ${size.h / size.w}` };
  return (
    <div ref={boxRef} data-page={pageNumber} className={`relative bg-white shadow-sm border border-slate-200 shrink-0 ${scale ? '' : 'w-full'}`} style={style}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
const PAD = 12;
const TOOL = 'inline-flex items-center justify-center h-8 min-w-8 px-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent';
const TOOL_ON = 'bg-slate-200 text-slate-900';

/**
 * PDF viewer with Bluebeam style controls: page back and forward, type a page,
 * zoom in and out (buttons, Ctrl + wheel, + and - keys), fit width, fit page,
 * actual size and full screen. `jumpTo` = { page } moves to a page (pass a new
 * object each time). `onPage(n)` hears the page in view.
 */
export function PdfViewer({ pdf, height = '70vh', onPage, jumpTo, className = '' }) {
  const frameRef = useRef(null);
  const boxRef = useRef(null);
  const anchorRef = useRef(null);
  const [box, setBox] = useState(null); // the scroll box, root for the page observers
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  const [base, setBase] = useState(LETTER);
  const [mode, setMode] = useState('width'); // width | page | zoom
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [typed, setTyped] = useState('1');
  const [full, setFull] = useState(false);
  const [canFull, setCanFull] = useState(false);
  const [baseReady, setBaseReady] = useState(false);
  const pages = pdf?.numPages || 0;
  const setBoxRef = useCallback((el) => { boxRef.current = el; setBox(el); }, []);

  useEffect(() => {
    if (!pdf) return;
    pdf.getPage(1)
      .then((p) => { const v = p.getViewport({ scale: 1 }); setBase({ w: v.width, h: v.height }); })
      .catch(() => {})
      .finally(() => setBaseReady(true));
  }, [pdf]);

  useEffect(() => {
    if (!box) return undefined;
    const ro = new ResizeObserver(() => setBoxSize({ w: box.clientWidth, h: box.clientHeight }));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  const fitWidth = boxSize.w ? Math.max(0.05, (boxSize.w - PAD * 2) / base.w) : null;
  const fitPage = boxSize.w ? Math.max(0.05, Math.min((boxSize.w - PAD * 2) / base.w, (boxSize.h - PAD * 2) / base.h)) : null;
  const scale = mode === 'width' ? fitWidth : mode === 'page' ? fitPage : zoom * PT_TO_PX;
  const percent = scale ? Math.round((scale / PT_TO_PX) * 100) : 100;

  // Keep the same spot of the page in view when the zoom changes.
  const holdSpot = () => {
    const el = boxRef.current;
    if (!el || !el.scrollHeight) return;
    anchorRef.current = {
      y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
      x: el.scrollWidth > el.clientWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5,
    };
  };
  useLayoutEffect(() => {
    const el = boxRef.current;
    const a = anchorRef.current;
    if (!el || !a) return;
    anchorRef.current = null;
    el.scrollTop = a.y * el.scrollHeight - el.clientHeight / 2;
    el.scrollLeft = a.x * el.scrollWidth - el.clientWidth / 2;
  }, [scale]);

  const setPercent = (z) => { holdSpot(); setMode('zoom'); setZoom(Math.min(8, Math.max(0.1, z))); };
  const stepZoom = (dir) => {
    const now = percent / 100;
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > now + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < now - 0.001);
    if (next) setPercent(next);
  };
  const fit = (m) => { holdSpot(); setMode(m); };

  const goTo = useCallback((n) => {
    const el = boxRef.current;
    const target = el?.querySelector(`[data-page="${n}"]`);
    if (!el || !target) return;
    el.scrollTo({ top: target.offsetTop - PAD });
    setPage(n);
    setTyped(String(n));
  }, []);

  useEffect(() => { if (jumpTo?.page) goTo(jumpTo.page); }, [jumpTo, goTo]);

  // The page in view is the one crossing a line a third of the way down.
  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    const line = el.scrollTop + el.clientHeight / 3;
    let n = 1;
    for (const p of el.querySelectorAll('[data-page]')) {
      if (p.offsetTop <= line) n = Number(p.dataset.page); else break;
    }
    if (el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) n = pages || n; // at the end
    if (n !== page) { setPage(n); setTyped(String(n)); }
  };
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;
  useEffect(() => { if (pages) onPageRef.current?.(page); }, [page, pages]);

  // Ctrl + wheel zooms (needs a listener that may stop the browser's own zoom).
  const stepRef = useRef(stepZoom);
  stepRef.current = stepZoom;
  useEffect(() => {
    if (!box) return undefined;
    const wheel = (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); stepRef.current(e.deltaY < 0 ? 1 : -1); };
    box.addEventListener('wheel', wheel, { passive: false });
    return () => box.removeEventListener('wheel', wheel);
  }, [box]);

  const onKey = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(Math.min(pages, page + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(Math.max(1, page - 1)); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); stepZoom(1); }
    else if (e.key === '-') { e.preventDefault(); stepZoom(-1); }
  };

  useEffect(() => {
    setCanFull(!!document.fullscreenEnabled);
    const on = () => setFull(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else frameRef.current?.requestFullscreen().catch(() => {});
  };

  const submitPage = () => {
    const n = Math.round(Number(typed));
    if (n >= 1 && n <= pages) goTo(n); else setTyped(String(page));
  };

  return (
    <div ref={frameRef} className={`flex flex-col bg-slate-100 border border-slate-200 rounded-lg overflow-hidden ${className}`} style={{ height: full ? '100vh' : height }}>
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-white border-b border-slate-200 text-sm">
        <button type="button" className={TOOL} onClick={() => goTo(Math.max(1, page - 1))} disabled={page <= 1} title="Previous page (Left arrow)" aria-label="Previous page">‹</button>
        <span className="inline-flex items-center gap-1 text-slate-600">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPage(); }}
            onBlur={submitPage}
            inputMode="numeric"
            aria-label="Page number"
            className="w-10 h-8 rounded-md border border-slate-300 text-center tabular-nums text-slate-800"
          />
          <span className="tabular-nums">of {pages || '...'}</span>
        </span>
        <button type="button" className={TOOL} onClick={() => goTo(Math.min(pages, page + 1))} disabled={!pages || page >= pages} title="Next page (Right arrow)" aria-label="Next page">›</button>
        <span className="w-px h-5 bg-slate-200 mx-1" />
        <button type="button" className={TOOL} onClick={() => stepZoom(-1)} disabled={percent <= 10} title="Zoom out (-)" aria-label="Zoom out">−</button>
        <span className="w-12 text-center tabular-nums text-slate-700" aria-label="Zoom">{percent}%</span>
        <button type="button" className={TOOL} onClick={() => stepZoom(1)} disabled={percent >= 800} title="Zoom in (+)" aria-label="Zoom in">+</button>
        <span className="w-px h-5 bg-slate-200 mx-1" />
        <button type="button" className={`${TOOL} ${mode === 'width' ? TOOL_ON : ''}`} onClick={() => fit('width')} title="Fit the page width to the screen">Fit width</button>
        <button type="button" className={`${TOOL} ${mode === 'page' ? TOOL_ON : ''}`} onClick={() => fit('page')} title="Fit one whole page to the screen">Fit page</button>
        <button type="button" className={`${TOOL} ${mode === 'zoom' && percent === 100 ? TOOL_ON : ''}`} onClick={() => setPercent(1)} title="Actual size">100%</button>
        {canFull && (
          <button type="button" className={`${TOOL} ml-auto`} onClick={toggleFull} title={full ? 'Leave full screen (Esc)' : 'Full screen'}>
            {full ? 'Exit full screen' : 'Full screen'}
          </button>
        )}
      </div>
      <div
        ref={setBoxRef}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKey}
        className="relative flex-1 min-h-0 overflow-auto outline-none"
      >
        <div className="w-max min-w-full flex flex-col items-center" style={{ padding: PAD, gap: PAD }}>
          {pdf && baseReady && scale && box && Array.from({ length: pages }, (_, i) => (
            <PdfPage key={i} pdf={pdf} pageNumber={i + 1} scale={scale} root={box} fallback={base} eager={i === 0} />
          ))}
        </div>
      </div>
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
