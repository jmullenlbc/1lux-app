'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Fixture type grouping ──────────────────────────────────────────────────────
function isExterior(code) { return code.startsWith('E') && code.length > 1; }

function groupTypes(masterTypes) {
  const interior = [], exterior = [], other = [];
  for (const mt of masterTypes) {
    if (!mt.is_active) continue;
    if (isExterior(mt.code)) exterior.push(mt);
    else if (mt.is_unit_type) interior.push(mt);
    else other.push(mt);
  }
  return { interior, exterior, other };
}

// ── SVG Symbol renderer ────────────────────────────────────────────────────────
function FixtureSymbolSvg({ code, family, symbolSvg, size = 28, selected = false, color = '#64748b' }) {
  if (symbolSvg) {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" dangerouslySetInnerHTML={{ __html: symbolSvg }} />
    );
  }

  const s = size;
  const cx = s / 2, cy = s / 2, r = s * 0.38;
  const fam = (family || '').toUpperCase();
  const fontSize = code.length > 2 ? Math.floor(s * 0.22) : Math.floor(s * 0.28);

  let shape = null;
  if (fam.includes('RECESSED DOWNLIGHT') || code === 'D' || code === 'ED') {
    shape = (
      <>
        <circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth="1.5" fill="white" />
        <line x1={cx - r * 0.6} y1={cy} x2={cx + r * 0.6} y2={cy} stroke={color} strokeWidth="1" />
        <line x1={cx} y1={cy - r * 0.6} x2={cx} y2={cy + r * 0.6} stroke={color} strokeWidth="1" />
      </>
    );
  } else if (fam.includes('CEILING SURFACE') || code === 'C' || code === 'EC') {
    shape = <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.5" />;
  } else if (fam.includes('LINEAR') || fam.includes('STRIP') || code === 'S' || code === 'EL' || code === 'ES' || code === 'A' || code === 'R' || code === 'ER') {
    shape = <rect x={s * 0.1} y={cy - s * 0.1} width={s * 0.8} height={s * 0.2} rx="2" stroke={color} strokeWidth="1.5" fill="white" />;
  } else if (fam.includes('FAN') || code === 'F') {
    const blades = [0, 90, 180, 270].map(angle => {
      const rad = (angle * Math.PI) / 180;
      const x1 = cx + Math.cos(rad) * r * 0.25, y1 = cy + Math.sin(rad) * r * 0.25;
      const x2 = cx + Math.cos(rad) * r, y2 = cy + Math.sin(rad) * r;
      return <ellipse key={angle} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={r * 0.3} ry={r * 0.12}
        transform={`rotate(${angle}, ${(x1 + x2) / 2}, ${(y1 + y2) / 2})`}
        fill={color} fillOpacity="0.4" stroke={color} strokeWidth="0.75" />;
    });
    shape = <>{blades}<circle cx={cx} cy={cy} r={s * 0.07} fill={color} /></>;
  } else if (fam.includes('VANITY') || code === 'V') {
    shape = (
      <>
        <rect x={s * 0.08} y={cy - s * 0.06} width={s * 0.84} height={s * 0.12} rx="2" stroke={color} strokeWidth="1.5" fill="white" />
        <circle cx={cx * 0.55} cy={cy} r={s * 0.05} fill={color} />
        <circle cx={cx} cy={cy} r={s * 0.05} fill={color} />
        <circle cx={cx * 1.45} cy={cy} r={s * 0.05} fill={color} />
      </>
    );
  } else if (fam.includes('WALL') || code === 'W' || code === 'EW') {
    shape = (
      <>
        <rect x={s * 0.08} y={s * 0.15} width={s * 0.3} height={s * 0.7} rx="2" stroke={color} strokeWidth="1.5" fill="white" />
        <path d={`M ${s * 0.38} ${s * 0.2} A ${s * 0.32} ${s * 0.32} 0 0 1 ${s * 0.38} ${s * 0.8}`}
          stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.15" />
      </>
    );
  } else if (fam.includes('PENDANT') || code === 'P') {
    shape = (
      <>
        <line x1={cx} y1={s * 0.05} x2={cx} y2={cy - r * 0.7} stroke={color} strokeWidth="1.25" />
        <circle cx={cx} cy={cy + r * 0.1} r={r * 0.7} stroke={color} strokeWidth="1.5" fill="white" />
      </>
    );
  } else if (fam.includes('UNDERCABINET') || code === 'UC') {
    const dash = s * 0.08;
    shape = (
      <>
        <rect x={s * 0.08} y={cy - s * 0.07} width={s * 0.84} height={s * 0.14} rx="2"
          stroke={color} strokeWidth="1.5" strokeDasharray={`${dash} ${dash * 0.5}`} fill="none" />
      </>
    );
  } else if (fam.includes('EMERGENCY') || code === 'X') {
    shape = (
      <>
        <rect x={s * 0.1} y={s * 0.1} width={s * 0.8} height={s * 0.8} rx="3" stroke="#ef4444" strokeWidth="1.5" fill="white" />
        <text x={cx} y={cy + s * 0.12} textAnchor="middle" fontSize={s * 0.35} fontWeight="700" fill="#ef4444">X</text>
      </>
    );
  } else if (fam.includes('BOLLARD') || code === 'EB') {
    shape = (
      <>
        <rect x={cx - s * 0.1} y={s * 0.35} width={s * 0.2} height={s * 0.5} rx="2" stroke={color} strokeWidth="1.5" fill="white" />
        <circle cx={cx} cy={s * 0.28} r={s * 0.16} stroke={color} strokeWidth="1.5" fill="white" />
      </>
    );
  } else if (fam.includes('LOW BAY') || fam.includes('GARAGE') || code === 'G') {
    const pts = [0, 60, 120, 180, 240, 300].map(a => {
      const rad = (a * Math.PI) / 180;
      return `${cx + r * Math.cos(rad)},${cy + r * Math.sin(rad)}`;
    }).join(' ');
    shape = <polygon points={pts} stroke={color} strokeWidth="1.5" fill="white" />;
  } else if (fam.includes('TRACK') || code === 'T') {
    shape = (
      <>
        <rect x={s * 0.08} y={cy - s * 0.04} width={s * 0.84} height={s * 0.08} rx="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.3" />
        {[0.25, 0.5, 0.75].map(p => (
          <circle key={p} cx={s * p} cy={cy + s * 0.18} r={s * 0.06} stroke={color} strokeWidth="1" fill="white" />
        ))}
      </>
    );
  } else {
    shape = <circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth="1.5" fill="white" />;
  }

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      {shape}
      {!['X'].includes(code) && (
        <text x={cx} y={cy + fontSize * 0.38} textAnchor="middle" fontSize={fontSize}
          fontWeight="600" fontFamily="monospace" fill={color} style={{ pointerEvents: 'none' }}>
          {code}
        </text>
      )}
    </svg>
  );
}

// ── Canvas overlay marker ──────────────────────────────────────────────────────
function FixtureMarker({ fixture, canvasW, canvasH, isSelected, onClick }) {
  const px = fixture.x * canvasW;
  const py = fixture.y * canvasH;
  const r = 14;
  const isConfirmed = fixture.status === 'CONFIRMED';
  const stroke = isSelected ? '#f59e0b' : isConfirmed ? '#22c55e' : '#f59e0b';
  const fill = isSelected ? '#fef3c7' : isConfirmed ? '#dcfce7' : 'white';
  const strokeDash = isConfirmed ? 'none' : '3 2';
  const code = fixture.masterType?.code || '?';
  const fontSize = code.length > 2 ? 7 : code.length > 1 ? 8 : 9;

  return (
    <g transform={`translate(${px}, ${py})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <circle r={r + 3} fill="transparent" />
      <circle r={r} stroke={stroke} strokeWidth={isSelected ? 2.5 : 2}
        strokeDasharray={isConfirmed ? 'none' : strokeDash} fill={fill} fillOpacity="0.92" />
      <text x={0} y={fontSize * 0.38} textAnchor="middle"
        fontSize={fontSize} fontWeight="700" fontFamily="monospace" fill={isConfirmed ? '#15803d' : '#92400e'}>
        {code}
      </text>
    </g>
  );
}

// ── Toolbar Section ────────────────────────────────────────────────────────────
function ToolbarSection({ label, types, selectedType, onSelect, open, onToggle, accentColor }) {
  const answeredCount = 0;
  return (
    <div>
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors">
        <span>{label}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="grid grid-cols-4 gap-1 px-2 pb-2">
          {types.map(mt => {
            const isSel = selectedType?.code === mt.code;
            return (
              <button key={mt.code}
                onClick={() => onSelect(isSel ? null : mt)}
                title={mt.fixture_family}
                className={`flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all ${
                  isSel
                    ? 'bg-amber-500 border-amber-400 text-white'
                    : 'bg-zinc-700 border-zinc-600 text-zinc-300 hover:bg-zinc-600 hover:border-zinc-500'
                }`}>
                <div className={isSel ? 'opacity-100' : 'opacity-80'}>
                  <FixtureSymbolSvg
                    code={mt.code}
                    family={mt.fixture_family}
                    symbolSvg={mt.symbol_svg}
                    size={26}
                    color={isSel ? 'white' : accentColor}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Takeoff Summary ────────────────────────────────────────────────────────────
function TakeoffSummary({ fixtures, masterTypes }) {
  const byType = {};
  for (const f of fixtures) {
    if (f.status === 'DELETED') continue;
    const code = f.master_type_id;
    if (!byType[code]) byType[code] = { suggested: 0, confirmed: 0 };
    if (f.status === 'CONFIRMED') byType[code].confirmed++;
    else byType[code].suggested++;
  }
  const entries = Object.entries(byType).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="w-52 bg-zinc-800 border-l border-zinc-700 flex flex-col">
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
                <th className="text-left px-3 py-1.5 text-zinc-400 font-medium">Type</th>
                <th className="text-right px-2 py-1.5 text-zinc-400 font-medium">Qty</th>
                <th className="text-right px-3 py-1.5 text-zinc-400 font-medium">✓</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([code, counts]) => {
                const mt = masterTypes.find(m => m.code === code);
                return (
                  <tr key={code} className="border-b border-zinc-700/50">
                    <td className="px-3 py-1.5">
                      <span className="font-mono font-bold text-white">{code}</span>
                      {mt && <span className="text-zinc-500 ml-1 text-[10px] hidden"></span>}
                    </td>
                    <td className="px-2 py-1.5 text-right text-zinc-300">{counts.suggested + counts.confirmed}</td>
                    <td className="px-3 py-1.5 text-right text-green-400">{counts.confirmed || ''}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-600">
                <td className="px-3 py-1.5 text-zinc-400 font-medium">Total</td>
                <td className="px-2 py-1.5 text-right text-white font-semibold">
                  {entries.reduce((s, [, c]) => s + c.suggested + c.confirmed, 0)}
                </td>
                <td className="px-3 py-1.5 text-right text-green-400 font-semibold">
                  {entries.reduce((s, [, c]) => s + c.confirmed, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export default function DrawingMarkupModal({ file, projectId, masterTypes = [], onClose }) {
  const canvasRef     = useRef(null);
  const pdfDocRef     = useRef(null);
  const [totalPages,  setTotalPages]  = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [canvasSize,  setCanvasSize]  = useState({ w: 0, h: 0 });
  const [pdfReady,    setPdfReady]    = useState(false);
  const [pdfError,    setPdfError]    = useState(null);

  const [fixtures,        setFixtures]        = useState([]);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [selectedType,    setSelectedType]    = useState(null);
  const [selectedFixture, setSelectedFixture] = useState(null);
  const [saving,          setSaving]          = useState(false);

  const [sections, setSections] = useState({ interior: true, exterior: false, other: false });

  const { interior, exterior, other } = groupTypes(masterTypes);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const url = `/api/projects/${projectId}/files/${file.id}`;
        const doc = await pdfjs.getDocument(url).promise;
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
  }, [file.id, projectId]);

  // Render page
  useEffect(() => {
    if (!pdfReady || !pdfDocRef.current || !canvasRef.current) return;
    let cancelled = false;
    let renderTask = null;
    async function render() {
      const page     = await pdfDocRef.current.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.5 });
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

  // Load fixtures
  useEffect(() => {
    async function load() {
      setLoadingFixtures(true);
      const res = await fetch(`/api/projects/${projectId}/placed-fixtures?drawingId=${file.id}`);
      if (res.ok) setFixtures(await res.json());
      setLoadingFixtures(false);
    }
    load();
  }, [file.id, projectId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleCanvasClick = useCallback(async (e) => {
    if (!selectedType || !canvasRef.current || saving) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/placed-fixtures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drawing_id: file.id, page_number: currentPage, x, y, master_type_id: selectedType.code }),
    });
    if (res.ok) {
      const fixture = await res.json();
      setFixtures(prev => [...prev, fixture]);
    }
    setSaving(false);
  }, [selectedType, saving, projectId, file.id, currentPage]);

  async function confirmFixture(fixture) {
    const res = await fetch(`/api/placed-fixtures/${fixture.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFixtures(prev => prev.map(f => f.id === fixture.id ? updated : f));
      setSelectedFixture(null);
    }
  }

  async function deleteFixture(fixture) {
    const res = await fetch(`/api/placed-fixtures/${fixture.id}`, { method: 'DELETE' });
    if (res.ok) {
      setFixtures(prev => prev.filter(f => f.id !== fixture.id));
      setSelectedFixture(null);
    }
  }

  const pageFixtures = fixtures.filter(f => f.page_number === currentPage && f.status !== 'DELETED');
  const totalCount   = fixtures.filter(f => f.status !== 'DELETED').length;
  const confirmedCount = fixtures.filter(f => f.status === 'CONFIRMED').length;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900 flex flex-col" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800 border-b border-zinc-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20.25l-5.25-5.25M9 20.25l1.5-4.5m-1.5 4.5H3.75M14.25 3.75l5.25 5.25M14.25 3.75l-1.5 4.5m1.5-4.5H19.5M3.75 8.25L9 3M3.75 8.25H9M15 21l-6-6M9 9l6 6" />
          </svg>
          <span className="text-sm font-semibold text-white truncate">{file.originalName}</span>
          {selectedType && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white font-medium shrink-0">
              Placing: {selectedType.code}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Page nav */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-400 disabled:opacity-30 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xs text-zinc-400 min-w-[60px] text-center">
                Page {currentPage} / {totalPages}
              </span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-400 disabled:opacity-30 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          <button onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white text-xs font-medium transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Toolbar ── */}
        <div className="w-[220px] shrink-0 bg-zinc-800 border-r border-zinc-700 overflow-y-auto flex flex-col">
          <div className="px-3 py-2 border-b border-zinc-700">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Tool Chest</p>
          </div>

          {selectedType && (
            <div className="mx-2 mt-2 px-2 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40">
              <p className="text-[10px] text-amber-300 font-medium">Active tool</p>
              <p className="text-xs text-white font-semibold">{selectedType.code} — {selectedType.fixture_family}</p>
              <button onClick={() => setSelectedType(null)} className="text-[10px] text-amber-400 hover:text-amber-300 mt-0.5">
                Click to deselect
              </button>
            </div>
          )}

          <div className="flex-1 pt-1">
            <ToolbarSection
              label="ILC — Interior Lighting"
              types={interior}
              selectedType={selectedType}
              onSelect={setSelectedType}
              open={sections.interior}
              onToggle={() => setSections(s => ({ ...s, interior: !s.interior }))}
              accentColor="#94a3b8"
            />
            <ToolbarSection
              label="ILC — Exterior Lighting"
              types={exterior}
              selectedType={selectedType}
              onSelect={setSelectedType}
              open={sections.exterior}
              onToggle={() => setSections(s => ({ ...s, exterior: !s.exterior }))}
              accentColor="#86efac"
            />
            <ToolbarSection
              label="Other / Controls"
              types={other}
              selectedType={selectedType}
              onSelect={setSelectedType}
              open={sections.other}
              onToggle={() => setSections(s => ({ ...s, other: !s.other }))}
              accentColor="#fbbf24"
            />
          </div>
        </div>

        {/* ── Canvas Area ── */}
        <div className="flex-1 overflow-auto bg-zinc-700 flex items-start justify-center p-6"
          onClick={selectedFixture ? () => setSelectedFixture(null) : undefined}
          style={{ cursor: selectedType ? 'crosshair' : 'default' }}>

          {pdfError ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-xl bg-red-900/30 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-300 font-medium">Failed to load PDF</p>
              <p className="text-xs text-zinc-500 mt-1">{pdfError}</p>
            </div>
          ) : !pdfReady ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">Loading drawing…</p>
            </div>
          ) : (
            <div className="relative shadow-2xl" style={{ width: canvasSize.w, height: canvasSize.h, minWidth: canvasSize.w }}>
              <canvas ref={canvasRef} className="block" onClick={handleCanvasClick} />

              {/* Fixture overlay */}
              <svg className="absolute inset-0" width={canvasSize.w} height={canvasSize.h}
                style={{ pointerEvents: 'none' }}>
                {pageFixtures.map(f => (
                  <g key={f.id} style={{ pointerEvents: 'all' }}
                    onClick={(e) => { e.stopPropagation(); setSelectedFixture(prev => prev?.id === f.id ? null : f); }}>
                    <FixtureMarker
                      fixture={f}
                      canvasW={canvasSize.w}
                      canvasH={canvasSize.h}
                      isSelected={selectedFixture?.id === f.id}
                    />
                  </g>
                ))}
              </svg>

              {/* Fixture action popover */}
              {selectedFixture && canvasSize.w > 0 && (() => {
                const px = selectedFixture.x * canvasSize.w;
                const py = selectedFixture.y * canvasSize.h;
                const flipY = py > canvasSize.h * 0.8;
                const flipX = px > canvasSize.w * 0.75;
                return (
                  <div className="absolute z-10 bg-zinc-800 border border-zinc-600 rounded-xl shadow-xl p-3 w-44"
                    style={{
                      left: flipX ? px - 180 : px + 20,
                      top:  flipY ? py - 110 : py + 20,
                    }}
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono font-bold text-white text-sm">{selectedFixture.masterType?.code}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        selectedFixture.status === 'CONFIRMED' ? 'bg-green-900/50 text-green-400' : 'bg-amber-900/50 text-amber-400'
                      }`}>
                        {selectedFixture.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 mb-2 leading-tight">
                      {selectedFixture.masterType?.fixture_family}
                    </p>
                    <div className="flex flex-col gap-1">
                      {selectedFixture.status === 'SUGGESTED' && (
                        <button onClick={() => confirmFixture(selectedFixture)}
                          className="w-full py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-semibold transition-colors">
                          Confirm
                        </button>
                      )}
                      <button onClick={() => deleteFixture(selectedFixture)}
                        className="w-full py-1.5 rounded-lg bg-zinc-700 hover:bg-red-900/50 hover:text-red-400 text-zinc-300 text-xs font-medium transition-colors">
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
        <TakeoffSummary fixtures={fixtures} masterTypes={masterTypes} />
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-zinc-800 border-t border-zinc-700">
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>
            <span className="text-white font-semibold">{totalCount}</span> placed
          </span>
          <span>
            <span className="text-green-400 font-semibold">{confirmedCount}</span> confirmed
          </span>
          <span>
            <span className="text-amber-400 font-semibold">{totalCount - confirmedCount}</span> suggested
          </span>
        </div>
        <div className="text-xs text-zinc-500">
          {selectedType
            ? `Click on the drawing to place ${selectedType.code}`
            : 'Select a fixture type from the toolbar to place it'}
        </div>
      </div>
    </div>
  );
}
