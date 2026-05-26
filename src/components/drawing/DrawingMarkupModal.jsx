'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SYMBOLS, SYMBOL_MAP, TOOLSETS, TOOLSET_SYMBOLS,
  SymbolIcon, CanvasSymbol, CanvasLinearSymbol,
} from '@/lib/symbolLibrary';
import {
  SCALE_PRESETS, SCALE_PRESET_CATEGORIES,
  DEFAULT_SCALE, PDF_RENDER_SCALE,
  toRealWorld, formatDimension,
} from '@/lib/scaleSystem';

// ── Toolbar: symbol grid within a toolset ─────────────────────────────────────
function SymbolGrid({ toolsetId, selectedSymbol, onSelect }) {
  const symbols = TOOLSET_SYMBOLS[toolsetId] || [];
  return (
    <div className="grid grid-cols-3 gap-1.5 p-2">
      {symbols.map(sym => {
        const isSel = selectedSymbol?.id === sym.id;
        return (
          <button key={sym.id}
            title={sym.desc}
            onClick={() => onSelect(isSel ? null : sym)}
            className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg border transition-all ${
              isSel
                ? 'bg-red-900 border-red-600'
                : 'bg-zinc-700 border-zinc-600 hover:bg-zinc-600 hover:border-zinc-500'
            }`}>
            <SymbolIcon id={sym.id} size={28} selected={isSel}/>
            <span className={`text-[8px] leading-none font-mono font-bold text-center line-clamp-1 ${
              isSel ? 'text-white' : 'text-zinc-400'
            }`}>{sym.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Scale selector dropdown ───────────────────────────────────────────────────
function ScaleSelector({ value, onChange, disabled }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
      disabled={disabled}
      className="text-[10px] font-mono bg-zinc-700 border border-zinc-600 rounded-md px-1.5 py-1
        text-zinc-200 focus:outline-none focus:border-red-500 cursor-pointer min-w-[120px]"
      title="Drawing scale">
      {SCALE_PRESET_CATEGORIES.map(cat => {
        const catPresets = SCALE_PRESETS.filter(p => p.category === cat.id && p.ratio !== null);
        if (!catPresets.length) return null;
        return (
          <optgroup key={cat.id} label={cat.label}>
            {catPresets.map(p => (
              <option key={p.label} value={p.ratio}>{p.label}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

// ── Takeoff panel ─────────────────────────────────────────────────────────────
function TakeoffPanel({ fixtures }) {
  const bySymbol = {};
  for (const f of fixtures) {
    if (f.status === 'DELETED') continue;
    const key = f.symbol_id || f.master_type_id || '?';
    if (!bySymbol[key]) bySymbol[key] = { suggested: 0, confirmed: 0 };
    if (f.status === 'CONFIRMED') bySymbol[key].confirmed++;
    else bySymbol[key].suggested++;
  }
  const entries    = Object.entries(bySymbol).sort(([a], [b]) => a.localeCompare(b));
  const totalQty   = entries.reduce((s, [, c]) => s + c.suggested + c.confirmed, 0);
  const totalConf  = entries.reduce((s, [, c]) => s + c.confirmed, 0);

  return (
    <div className="w-52 shrink-0 bg-zinc-800 border-l border-zinc-700 flex flex-col">
      <div className="px-3 py-2.5 border-b border-zinc-700">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Takeoff</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="text-xs text-zinc-500 italic px-3 py-4">No fixtures placed yet</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left px-3 py-1.5 text-zinc-400 font-medium">Symbol</th>
                <th className="text-right px-2 py-1.5 text-zinc-400 font-medium">Qty</th>
                <th className="text-right px-3 py-1.5 text-zinc-400 font-medium">✓</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, counts]) => {
                const sym = SYMBOL_MAP[key];
                const displayKey = sym ? (sym.family || sym.label) : key;
                return (
                  <tr key={key} className="border-b border-zinc-700/50">
                    <td className="px-3 py-1.5">
                      {sym
                        ? <SymbolIcon id={sym.id} size={16}/>
                        : <span className="font-mono font-bold text-white">{displayKey}</span>
                      }
                    </td>
                    <td className="px-2 py-1.5 text-right text-zinc-300">
                      {counts.suggested + counts.confirmed}
                    </td>
                    <td className="px-3 py-1.5 text-right text-green-400">
                      {counts.confirmed || ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-600">
                <td className="px-3 py-1.5 text-zinc-400 font-medium">Total</td>
                <td className="px-2 py-1.5 text-right text-white font-semibold">{totalQty}</td>
                <td className="px-3 py-1.5 text-right text-green-400 font-semibold">{totalConf}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function DrawingMarkupModal({ file, projectId, pdfUrl, onClose }) {
  const canvasRef    = useRef(null);
  const pdfDocRef    = useRef(null);
  const [totalPages,  setTotalPages]  = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [canvasSize,  setCanvasSize]  = useState({ w: 0, h: 0 });
  const [pdfReady,    setPdfReady]    = useState(false);
  const [pdfError,    setPdfError]    = useState(null);

  const [fixtures,        setFixtures]        = useState([]);
  const [selectedSymbol,  setSelectedSymbol]  = useState(null);
  const [selectedFixture, setSelectedFixture] = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [activeToolset,   setActiveToolset]   = useState('INTERIOR');

  // ── Scale system ──
  const [scaleRatio,    setScaleRatio]   = useState(file.scale_ratio ?? DEFAULT_SCALE);
  const [scaleSaving,   setScaleSaving]  = useState(false);

  // ── Linear two-click placement ──
  // linearDraft: { symbolId, x1Frac, y1Frac, x1px, y1px }
  const [linearDraft, setLinearDraft] = useState(null);
  // mousePos: { x, y } in canvas pixels (for live preview line)
  const [mousePos,    setMousePos]    = useState(null);

  // ── Polygon area measurement ──
  // polyDraft: { points: [{xFrac, yFrac, xPx, yPx}, ...] }
  const [polyDraft,       setPolyDraft]       = useState(null);
  const [areaAnnotations, setAreaAnnotations] = useState([]);

  // ── Load PDF ──
  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const url = pdfUrl || `/api/projects/${projectId}/files/${file.id}`;
        const doc  = await pdfjs.getDocument(url).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setPdfReady(true);
      } catch (err) {
        if (!cancelled) setPdfError(err.message || 'Failed to load PDF');
      }
    }
    loadPdf();
    return () => { cancelled = true; };
  }, [file.id, projectId, pdfUrl]);

  // ── Render PDF page ──
  useEffect(() => {
    if (!pdfReady || !pdfDocRef.current || !canvasRef.current) return;
    let cancelled  = false;
    let renderTask = null;
    async function render() {
      const page     = await pdfDocRef.current.getPage(currentPage);
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      const canvas   = canvasRef.current;
      if (cancelled) { page.cleanup(); return; }
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      setCanvasSize({ w: viewport.width, h: viewport.height });
      renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      await renderTask.promise;
      if (cancelled) { page.cleanup(); return; }
      renderTask = null;
    }
    render().catch(() => {});
    return () => {
      cancelled = true;
      if (renderTask) { try { renderTask.cancel(); } catch {} }
    };
  }, [pdfReady, currentPage]);

  // ── Load placed fixtures ──
  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/projects/${projectId}/placed-fixtures?drawingId=${file.id}`);
      if (res.ok) setFixtures(await res.json());
    }
    load();
  }, [file.id, projectId]);

  // ── Load area annotations (reload when page changes) ──
  useEffect(() => {
    async function load() {
      const res = await fetch(
        `/api/projects/${projectId}/annotations?drawingId=${file.id}&page=${currentPage}`
      );
      if (res.ok) {
        const data = await res.json();
        setAreaAnnotations(data.filter(a => a.annotation_type === 'AREA'));
      }
    }
    load();
  }, [file.id, projectId, currentPage]);

  // ── Polygon area helpers ──
  function shoelaceAreaSqPx(pts) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].xPx * pts[j].yPx;
      area -= pts[j].xPx * pts[i].yPx;
    }
    return Math.abs(area) / 2;
  }

  function formatArea(areaSqPx, ratio, pdfScale) {
    const pxPerInch = ratio * 72 * pdfScale;
    const sqFt = areaSqPx / (pxPerInch * pxPerInch) / 144;
    if (sqFt < 0.01) {
      const sqIn = areaSqPx / (pxPerInch * pxPerInch);
      return `${sqIn.toFixed(2)} in²`;
    }
    return `${sqFt.toFixed(2)} sq ft`;
  }

  async function closePoly(points) {
    if (points.length < 3) { setPolyDraft(null); return; }
    const areaSqPx  = shoelaceAreaSqPx(points);
    const areaLabel = formatArea(areaSqPx, scaleRatio, PDF_RENDER_SCALE);
    const pxPerInch = scaleRatio * 72 * PDF_RENDER_SCALE;
    const areaSqFt  = areaSqPx / (pxPerInch * pxPerInch) / 144;
    // Centroid (average of vertices)
    const cx = points.reduce((s, p) => s + p.xFrac, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.yFrac, 0) / points.length;

    const res = await fetch(`/api/projects/${projectId}/annotations`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        drawing_id:      file.id,
        page_number:     currentPage,
        annotation_type: 'AREA',
        tool_id:         'TOOL_POLY_AREA',
        x:               cx,
        y:               cy,
        scale_factor:    scaleRatio,
        text_content:    areaLabel,
        metadata: {
          points:     points.map(p => ({ x: p.xFrac, y: p.yFrac })),
          areaSqFt,
          scaleRatio,
        },
      }),
    });
    if (res.ok) {
      const ann = await res.json();
      setAreaAnnotations(prev => [...prev, ann]);
    }
    setPolyDraft(null);
  }

  async function deleteAreaAnnotation(ann) {
    const res = await fetch(`/api/annotations/${ann.id}`, { method: 'DELETE' });
    if (res.ok) setAreaAnnotations(prev => prev.filter(a => a.id !== ann.id));
  }

  // ── Save scale to DrawingFile ──
  async function saveScale(ratio) {
    setScaleRatio(ratio);
    setScaleSaving(true);
    try {
      await fetch(`/api/drawing-files/${file.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scale_ratio: ratio }),
      });
    } finally {
      setScaleSaving(false);
    }
  }

  // ── Escape key ──
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (polyDraft)       { setPolyDraft(null);       return; }
        if (linearDraft)     { setLinearDraft(null);     return; }
        if (selectedFixture) { setSelectedFixture(null); return; }
        if (selectedSymbol)  { setSelectedSymbol(null);  return; }
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, polyDraft, linearDraft, selectedFixture, selectedSymbol]);

  // ── Convert canvas event → fractions and canvas pixels ──
  function eventToCoords(e) {
    const rect  = canvasRef.current.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left)  / rect.width;
    const yFrac = (e.clientY - rect.top)   / rect.height;
    const xPx   = xFrac * canvasSize.w;
    const yPx   = yFrac * canvasSize.h;
    return { xFrac, yFrac, xPx, yPx };
  }

  // ── Mouse move — update cursor position for ghost preview & linear draft ──
  const handleMouseMove = useCallback((e) => {
    if (!canvasRef.current || !canvasSize.w || !selectedSymbol) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left) / rect.width  * canvasSize.w,
      y: (e.clientY - rect.top)  / rect.height * canvasSize.h,
    });
  }, [selectedSymbol, canvasSize]);

  // ── Canvas double-click — close polygon ──
  const handleCanvasDblClick = useCallback(async (e) => {
    if (selectedSymbol?.id !== 'TOOL_POLY_AREA' || !polyDraft) return;
    e.stopPropagation();
    await closePoly(polyDraft.points);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, polyDraft, scaleRatio, projectId, file.id, currentPage]);

  // ── Canvas click ──
  const handleCanvasClick = useCallback(async (e) => {
    if (!selectedSymbol || !canvasRef.current || saving) return;
    const { xFrac, yFrac, xPx, yPx } = eventToCoords(e);

    // ── Polygon area: multi-click flow ──
    if (selectedSymbol.id === 'TOOL_POLY_AREA') {
      const CLOSE_THRESH = 14; // px — clicking this close to first point closes the polygon
      if (!polyDraft) {
        // First click: start polygon
        setPolyDraft({ points: [{ xFrac, yFrac, xPx, yPx }] });
        return;
      }
      // Check if clicking near the first vertex to close
      const first = polyDraft.points[0];
      const dist  = Math.hypot(xPx - first.xPx, yPx - first.yPx);
      if (dist < CLOSE_THRESH && polyDraft.points.length >= 3) {
        await closePoly(polyDraft.points);
        return;
      }
      // Add vertex
      setPolyDraft(prev => ({ points: [...prev.points, { xFrac, yFrac, xPx, yPx }] }));
      return;
    }

    // ── Linear: two-click flow ──
    if (selectedSymbol.isLinear) {
      if (!linearDraft) {
        // First click: anchor the start point
        setLinearDraft({ symbolId: selectedSymbol.id, x1Frac: xFrac, y1Frac: yFrac, x1px: xPx, y1px: yPx });
        return;
      }

      // Second click: complete placement
      const dx       = xPx - linearDraft.x1px;
      const dy       = yPx - linearDraft.y1px;
      const lenPx    = Math.sqrt(dx * dx + dy * dy);
      if (lenPx < 5) { setLinearDraft(null); return; } // too short — cancel

      const lenInches = toRealWorld(lenPx, scaleRatio, PDF_RENDER_SCALE);

      setSaving(true);
      const res = await fetch(`/api/projects/${projectId}/placed-fixtures`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          drawing_id:     file.id,
          page_number:    currentPage,
          x:              linearDraft.x1Frac,
          y:              linearDraft.y1Frac,
          x2:             xFrac,
          y2:             yFrac,
          master_type_id: selectedSymbol.family || selectedSymbol.id,
          symbol_id:      selectedSymbol.id,
          toolset:        selectedSymbol.toolset,
          length_inches:  lenInches,
          scale_ratio:    scaleRatio,
        }),
      });
      if (res.ok) {
        const fixture = await res.json();
        setFixtures(prev => [...prev, fixture]);
      }
      setLinearDraft(null);
      setSaving(false);
      return;
    }

    // ── Point symbol ──
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/placed-fixtures`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        drawing_id:     file.id,
        page_number:    currentPage,
        x: xFrac, y: yFrac,
        master_type_id: selectedSymbol.family || selectedSymbol.id,
        symbol_id:      selectedSymbol.id,
        toolset:        selectedSymbol.toolset,
        scale_ratio:    scaleRatio,
      }),
    });
    if (res.ok) {
      const fixture = await res.json();
      setFixtures(prev => [...prev, fixture]);
    }
    setSaving(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, polyDraft, linearDraft, saving, scaleRatio, projectId, file.id, currentPage, canvasSize]);

  // ── Confirm fixture ──
  async function confirmFixture(fixture) {
    const res = await fetch(`/api/placed-fixtures/${fixture.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'CONFIRMED' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFixtures(prev => prev.map(f => f.id === fixture.id ? updated : f));
      setSelectedFixture(null);
    }
  }

  // ── Delete fixture ──
  async function deleteFixture(fixture) {
    const res = await fetch(`/api/placed-fixtures/${fixture.id}`, { method: 'DELETE' });
    if (res.ok) {
      setFixtures(prev => prev.filter(f => f.id !== fixture.id));
      setSelectedFixture(null);
    }
  }

  const pageFixtures   = fixtures.filter(f => f.page_number === currentPage && f.status !== 'DELETED');
  const totalCount     = fixtures.filter(f => f.status !== 'DELETED').length;
  const confirmedCount = fixtures.filter(f => f.status === 'CONFIRMED').length;

  // Live length readout while drawing a linear fixture
  const liveLength = (() => {
    if (!linearDraft || !mousePos) return null;
    const dx = mousePos.x - linearDraft.x1px;
    const dy = mousePos.y - linearDraft.y1px;
    const lenPx = Math.sqrt(dx * dx + dy * dy);
    return formatDimension(toRealWorld(lenPx, scaleRatio, PDF_RENDER_SCALE));
  })();

  // Cursor label
  const statusMsg = (() => {
    if (polyDraft) {
      const n = polyDraft.points.length;
      return n < 3
        ? `${n} point${n !== 1 ? 's' : ''} — keep clicking to add vertices`
        : `${n} points — click start point or double-click to close polygon`;
    }
    if (selectedSymbol?.id === 'TOOL_POLY_AREA') return 'Click to place first vertex of area polygon';
    if (linearDraft) return `Click end point to place linear fixture — ${liveLength || '…'} so far`;
    if (selectedSymbol?.isLinear) return `Click start point of ${selectedSymbol.label}`;
    if (selectedSymbol)           return `Click drawing to place ${selectedSymbol.label} — ${selectedSymbol.desc}`;
    return 'Select a symbol from the toolbar, then click the drawing to place it';
  })();

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900 flex flex-col" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800 border-b border-zinc-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"/>
          </svg>
          <span className="text-sm font-semibold text-white truncate max-w-[200px]">{file.fileName || file.originalName}</span>

          {/* Scale selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-zinc-500 font-medium">Scale</span>
            <ScaleSelector value={scaleRatio} onChange={saveScale} disabled={scaleSaving}/>
            {scaleSaving && <span className="text-[9px] text-zinc-500">saving…</span>}
          </div>

          {selectedSymbol && (
            <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-red-900/70 text-red-200 font-medium shrink-0">
              <SymbolIcon id={selectedSymbol.id} size={14} selected/>
              {linearDraft ? `→ end point` : `Placing: ${selectedSymbol.label}`}
            </span>
          )}
          {liveLength && (
            <span className="text-xs text-yellow-400 font-mono font-semibold shrink-0">{liveLength}</span>
          )}
          {saving && <span className="text-xs text-zinc-500 shrink-0">Saving…</span>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-400 disabled:opacity-30">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <span className="text-xs text-zinc-400 min-w-[64px] text-center">
                Page {currentPage} / {totalPages}
              </span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-400 disabled:opacity-30">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          )}
          <button onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-medium transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Close
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Toolbar ── */}
        <div className="w-[210px] shrink-0 bg-zinc-800 border-r border-zinc-700 flex flex-col">

          {/* Toolset tabs */}
          <div className="flex border-b border-zinc-700 shrink-0">
            {TOOLSETS.map(ts => (
              <button key={ts.id}
                onClick={() => setActiveToolset(ts.id)}
                className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wide transition-colors ${
                  activeToolset === ts.id
                    ? 'bg-zinc-700 text-white border-b-2 border-red-500'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}>
                {ts.shortLabel}
              </button>
            ))}
          </div>

          {/* Active symbol badge */}
          {selectedSymbol && (
            <div className="mx-2 mt-2 px-2 py-1.5 rounded-lg bg-red-900/40 border border-red-700/50 shrink-0">
              <div className="flex items-center gap-2">
                <SymbolIcon id={selectedSymbol.id} size={20} selected/>
                <div className="min-w-0">
                  <p className="text-[10px] text-white font-bold font-mono leading-none">{selectedSymbol.label}</p>
                  <p className="text-[8px] text-red-300 mt-0.5 leading-tight truncate">{selectedSymbol.desc}</p>
                  {selectedSymbol.isLinear && (
                    <p className="text-[8px] text-yellow-400 mt-0.5">Two-click placement</p>
                  )}
                </div>
              </div>
              <button onClick={() => { setSelectedSymbol(null); setLinearDraft(null); }}
                className="text-[8px] text-red-400 hover:text-red-200 mt-1">
                Press Esc to deselect ×
              </button>
            </div>
          )}

          {/* Linear draft indicator */}
          {linearDraft && (
            <div className="mx-2 mt-1 px-2 py-1.5 rounded-lg bg-yellow-900/30 border border-yellow-600/40 shrink-0">
              <p className="text-[9px] text-yellow-400 font-semibold">Start point set</p>
              <p className="text-[8px] text-zinc-400 mt-0.5">Click end point to complete</p>
              <button onClick={() => setLinearDraft(null)}
                className="text-[8px] text-yellow-500 hover:text-yellow-200 mt-0.5">
                Esc to cancel ×
              </button>
            </div>
          )}

          {/* Polygon draft indicator */}
          {polyDraft && (
            <div className="mx-2 mt-1 px-2 py-1.5 rounded-lg bg-amber-900/30 border border-amber-600/40 shrink-0">
              <p className="text-[9px] text-amber-400 font-semibold">
                {polyDraft.points.length} {polyDraft.points.length === 1 ? 'point' : 'points'}
              </p>
              <p className="text-[8px] text-zinc-400 mt-0.5">
                {polyDraft.points.length < 3
                  ? 'Keep clicking to add vertices'
                  : 'Click start point or dbl-click to close'}
              </p>
              <button onClick={() => setPolyDraft(null)}
                className="text-[8px] text-amber-500 hover:text-amber-200 mt-0.5">
                Esc to cancel ×
              </button>
            </div>
          )}

          {/* Symbol grid (scrollable) */}
          <div className="flex-1 overflow-y-auto">
            <SymbolGrid
              toolsetId={activeToolset}
              selectedSymbol={selectedSymbol}
              onSelect={(sym) => {
                setSelectedSymbol(sym);
                setLinearDraft(null);
                setPolyDraft(null);
              }}
            />
          </div>
        </div>

        {/* ── Drawing Canvas Area ── */}
        <div
          className="flex-1 overflow-auto bg-zinc-700 flex items-start justify-center p-6"
          onClick={selectedFixture ? () => setSelectedFixture(null) : undefined}
          style={{ cursor: selectedSymbol ? 'crosshair' : 'default' }}>

          {pdfError ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-xl bg-red-900/30 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"/>
                </svg>
              </div>
              <p className="text-sm text-zinc-300 font-medium">Failed to load PDF</p>
              <p className="text-xs text-zinc-500 mt-1">{pdfError}</p>
            </div>
          ) : !pdfReady ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin"/>
              <p className="text-sm text-zinc-400">Loading drawing…</p>
            </div>
          ) : (
            <div className="relative shadow-2xl"
              style={{ width: canvasSize.w, height: canvasSize.h, minWidth: canvasSize.w }}>
              <canvas
                ref={canvasRef}
                className="block"
                onClick={handleCanvasClick}
                onDoubleClick={handleCanvasDblClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setMousePos(null)}
              />

              {/* ── Symbol overlay ── */}
              <svg className="absolute inset-0" width={canvasSize.w} height={canvasSize.h}
                style={{ pointerEvents: 'none' }}>

                {/* Placed fixtures */}
                {pageFixtures.map(f => {
                  const symId    = f.symbol_id || 'INT_D_CIRCLE';
                  const sym      = SYMBOL_MAP[symId];
                  const isLinear = sym?.isLinear && f.x2 != null && f.y2 != null;
                  const isSelected = selectedFixture?.id === f.id;
                  const isConfirmed = f.status === 'CONFIRMED';

                  if (isLinear) {
                    const x1px = f.x  * canvasSize.w;
                    const y1px = f.y  * canvasSize.h;
                    const x2px = f.x2 * canvasSize.w;
                    const y2px = f.y2 * canvasSize.h;
                    const lenIn = f.length_inches;
                    const label = lenIn ? formatDimension(lenIn) : undefined;
                    return (
                      <g key={f.id} style={{ pointerEvents: 'all' }}
                        onClick={e => { e.stopPropagation(); setSelectedFixture(prev => prev?.id === f.id ? null : f); }}>
                        <CanvasLinearSymbol
                          symbolId={symId}
                          x1={x1px} y1={y1px}
                          x2={x2px} y2={y2px}
                          typeCode={f.master_type_id}
                          confirmed={isConfirmed}
                          selected={isSelected}
                          scaleRatio={scaleRatio}
                          pdfScale={PDF_RENDER_SCALE}
                          lengthLabel={label}
                        />
                      </g>
                    );
                  }

                  const cx = f.x * canvasSize.w;
                  const cy = f.y * canvasSize.h;
                  return (
                    <g key={f.id} style={{ pointerEvents: 'all' }}
                      onClick={e => { e.stopPropagation(); setSelectedFixture(prev => prev?.id === f.id ? null : f); }}>
                      <CanvasSymbol
                        symbolId={symId}
                        cx={cx} cy={cy}
                        typeCode={f.master_type_id}
                        confirmed={isConfirmed}
                        selected={isSelected}
                        scaleRatio={scaleRatio}
                        pdfScale={PDF_RENDER_SCALE}
                      />
                    </g>
                  );
                })}

                {/* Linear draft: start anchor dot */}
                {linearDraft && (
                  <circle cx={linearDraft.x1px} cy={linearDraft.y1px}
                    r={5} fill="#f59e0b" fillOpacity="0.8"/>
                )}

                {/* Linear draft: live preview line to mouse */}
                {linearDraft && mousePos && selectedSymbol && (
                  <CanvasLinearSymbol
                    symbolId={selectedSymbol.id}
                    x1={linearDraft.x1px} y1={linearDraft.y1px}
                    x2={mousePos.x} y2={mousePos.y}
                    scaleRatio={scaleRatio}
                    pdfScale={PDF_RENDER_SCALE}
                    lengthLabel={liveLength}
                  />
                )}

                {/* Point symbol ghost preview on hover (non-linear, non-poly) */}
                {selectedSymbol && !selectedSymbol.isLinear
                  && selectedSymbol.id !== 'TOOL_POLY_AREA'
                  && mousePos && !linearDraft && (
                  <CanvasSymbol
                    symbolId={selectedSymbol.id}
                    cx={mousePos.x} cy={mousePos.y}
                    scaleRatio={scaleRatio}
                    pdfScale={PDF_RENDER_SCALE}
                  />
                )}

                {/* ── Polygon area: draft in progress ── */}
                {polyDraft && canvasSize.w > 0 && (() => {
                  const pts = polyDraft.points;
                  const ptStr = pts.map(p => `${p.xPx},${p.yPx}`).join(' ');
                  // Live area (include cursor as temporary vertex)
                  const livePts = mousePos
                    ? [...pts, { xPx: mousePos.x, yPx: mousePos.y }]
                    : pts;
                  const liveArea = livePts.length >= 3
                    ? formatArea(shoelaceAreaSqPx(livePts), scaleRatio, PDF_RENDER_SCALE)
                    : null;
                  return <>
                    {/* Filled preview area (3+ points) */}
                    {pts.length >= 3 && (
                      <polygon points={ptStr}
                        fill="#f59e0b" fillOpacity="0.15" stroke="none"/>
                    )}
                    {/* Edges drawn so far */}
                    {pts.length >= 2 && (
                      <polyline points={ptStr}
                        stroke="#f59e0b" strokeWidth="1.5" fill="none" strokeDasharray="5 2"/>
                    )}
                    {/* Live edge from last point to cursor */}
                    {mousePos && pts.length >= 1 && (
                      <line
                        x1={pts[pts.length - 1].xPx} y1={pts[pts.length - 1].yPx}
                        x2={mousePos.x} y2={mousePos.y}
                        stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 2" opacity="0.7"/>
                    )}
                    {/* Vertex dots — first is larger and acts as close target */}
                    {pts.map((p, i) => (
                      <circle key={i}
                        cx={p.xPx} cy={p.yPx}
                        r={i === 0 ? 7 : 4}
                        fill={i === 0 ? '#f59e0b' : '#fff'}
                        stroke="#f59e0b" strokeWidth="1.5"/>
                    ))}
                    {/* First-point close indicator ring */}
                    {pts.length >= 3 && (
                      <circle cx={pts[0].xPx} cy={pts[0].yPx} r={14}
                        fill="none" stroke="#f59e0b" strokeWidth="1"
                        strokeDasharray="3 2" opacity="0.5"/>
                    )}
                    {/* Live area label near cursor */}
                    {liveArea && mousePos && (
                      <g>
                        <rect x={mousePos.x + 10} y={mousePos.y - 22}
                          width={liveArea.length * 6.5 + 10} height={18}
                          rx={4} fill="rgba(0,0,0,0.65)"/>
                        <text x={mousePos.x + 15} y={mousePos.y - 9}
                          fontSize="11" fontWeight="700" fontFamily="Arial, sans-serif"
                          fill="#f59e0b">
                          {liveArea}
                        </text>
                      </g>
                    )}
                  </>;
                })()}

                {/* ── Saved area annotations ── */}
                {areaAnnotations.map(ann => {
                  let meta = null;
                  try { meta = ann.metadata ? JSON.parse(ann.metadata) : null; } catch {}
                  if (!meta?.points) return null;
                  const ptStr = meta.points
                    .map(p => `${p.x * canvasSize.w},${p.y * canvasSize.h}`)
                    .join(' ');
                  const lx = ann.x * canvasSize.w;
                  const ly = ann.y * canvasSize.h;
                  const label = ann.text_content || '';
                  return (
                    <g key={ann.id} style={{ pointerEvents: 'all' }}
                      onDoubleClick={() => deleteAreaAnnotation(ann)}
                      title="Double-click to delete">
                      <polygon points={ptStr}
                        fill="#f59e0b" fillOpacity="0.12"
                        stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 2"/>
                      {/* Label background */}
                      <rect x={lx - label.length * 3.5} y={ly - 11}
                        width={label.length * 7 + 8} height={17}
                        rx={4} fill="rgba(0,0,0,0.6)"/>
                      <text x={lx} y={ly + 3}
                        textAnchor="middle"
                        fontSize="11" fontWeight="700" fontFamily="Arial, sans-serif"
                        fill="#f59e0b">
                        {label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* ── Fixture action popover ── */}
              {selectedFixture && canvasSize.w > 0 && (() => {
                const px  = selectedFixture.x * canvasSize.w;
                const py  = selectedFixture.y * canvasSize.h;
                const flipY = py > canvasSize.h * 0.8;
                const flipX = px > canvasSize.w * 0.75;
                const sym   = SYMBOL_MAP[selectedFixture.symbol_id];
                return (
                  <div className="absolute z-10 bg-zinc-800 border border-zinc-600 rounded-xl shadow-2xl p-3 w-56"
                    style={{
                      left: flipX ? px - 224 : px + 24,
                      top:  flipY ? py - 144 : py + 24,
                    }}
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 mb-2">
                      {sym && <SymbolIcon id={sym.id} size={22}/>}
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-white text-sm">
                          {selectedFixture.master_type_id}
                        </p>
                        {sym && <p className="text-[10px] text-zinc-400 truncate">{sym.desc}</p>}
                        {selectedFixture.length_inches && (
                          <p className="text-[10px] text-yellow-400 font-mono">
                            {formatDimension(selectedFixture.length_inches)}
                          </p>
                        )}
                      </div>
                      <span className={`ml-auto shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium ${
                        selectedFixture.status === 'CONFIRMED'
                          ? 'bg-green-900/60 text-green-400'
                          : 'bg-red-900/40 text-red-400'
                      }`}>
                        {selectedFixture.status}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {selectedFixture.status === 'SUGGESTED' && (
                        <button onClick={() => confirmFixture(selectedFixture)}
                          className="w-full py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-semibold transition-colors">
                          Confirm
                        </button>
                      )}
                      <button onClick={() => deleteFixture(selectedFixture)}
                        className="w-full py-1.5 rounded-lg bg-zinc-700 hover:bg-red-900/50 hover:text-red-300 text-zinc-300 text-xs font-medium transition-colors">
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── Takeoff Panel ── */}
        <TakeoffPanel fixtures={fixtures}/>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-zinc-800 border-t border-zinc-700">
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span><span className="text-white font-semibold">{totalCount}</span> placed</span>
          <span><span className="text-green-400 font-semibold">{confirmedCount}</span> confirmed</span>
          <span><span className="text-red-400 font-semibold">{totalCount - confirmedCount}</span> suggested</span>
        </div>
        <p className="text-xs text-zinc-500 truncate max-w-[420px]">{statusMsg}</p>
      </div>
    </div>
  );
}
