'use client';
import { useState, useEffect, useCallback } from 'react';
import SaveToKBButton from './SaveToKBButton';

function buildRadarIssueContent(issue, radarType) {
  const parts = [`<p>${issue.message}</p>`];
  if (issue.items?.length) {
    parts.push('<ul>' + issue.items.map(it =>
      `<li><code>${it.type || it}</code>${it.detail ? ': ' + it.detail : ''}</li>`
    ).join('') + '</ul>');
  }
  parts.push(`<p><em>Source: Human Error Radar: ${radarType}</em></p>`);
  return parts.join('');
}

const STATUS_META = {
  PASS: { label: 'PASS', bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  border: 'border-green-200' },
  FLAG: { label: 'FLAG', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    border: 'border-red-200'   },
  WARN: { label: 'WARN', bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500',  border: 'border-amber-200' },
  SKIP: { label: 'N/A',  bg: 'bg-slate-100',  text: 'text-slate-400',  dot: 'bg-slate-300',  border: 'border-slate-200' },
};

function Badge({ status, small }) {
  const m = STATUS_META[status] ?? STATUS_META.SKIP;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${small ? 'text-[9px]' : 'text-[10px]'} ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

// ── Quantity Radar section ────────────────────────────────────────────────────

function QuantityRadarSection({ radar }) {
  const [open, setOpen] = useState(radar.status === 'FLAG');

  return (
    <div className={`rounded-xl border overflow-hidden ${radar.status === 'FLAG' ? 'border-red-200' : 'border-slate-200'}`}>
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors text-left">
        <Badge status={radar.status} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">{radar.title}</p>
          <p className="text-[10px] text-slate-400">{radar.subtitle}</p>
        </div>
        <svg viewBox="0 0 20 20" fill="currentColor"
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className={`border-t px-4 pb-4 ${radar.status === 'FLAG' ? 'border-red-100 bg-red-50/20' : 'border-slate-100'}`}>
          <p className="text-xs text-slate-500 mt-3 mb-3">{radar.summary}</p>

          {radar.missingFromTakeoff?.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1.5">
                In schedule, not in takeoff ({radar.missingFromTakeoff.length})
              </p>
              <div className="space-y-1">
                {radar.missingFromTakeoff.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-red-400 mt-0.5">▲</span>
                    <span><span className="font-semibold text-slate-700">{item.type}</span>
                      {item.description && <span className="text-slate-400">: {item.description}</span>}
                      {item.location && <span className="text-slate-300"> · {item.location}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {radar.orphanTakeoffKeys?.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">
                In takeoff, not in schedule ({radar.orphanTakeoffKeys.length})
              </p>
              <div className="space-y-1">
                {radar.orphanTakeoffKeys.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-amber-500 mt-0.5">◆</span>
                    <span>
                      <span className="font-semibold font-mono text-slate-700">{item.key}</span>
                      <span className="text-slate-400"> × {item.qty}</span>
                      {item.suggestedMatch && <span className="ml-2 text-slate-400 italic">{item.suggestedMatch}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {radar.matched?.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600">
                {radar.matched.length} matched types ▸
              </summary>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                {radar.matched.map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] bg-green-50 border border-green-100 rounded px-2 py-1">
                    <span className="font-semibold text-green-700 font-mono">{item.type}</span>
                    <span className="text-green-500">×{item.qty}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Spec Radar section ────────────────────────────────────────────────────────

function SpecRadarSection({ radar }) {
  const [open, setOpen] = useState(radar.status === 'FLAG');

  return (
    <div className={`rounded-xl border overflow-hidden ${radar.status === 'FLAG' ? 'border-red-200' : radar.status === 'WARN' ? 'border-amber-200' : 'border-slate-200'}`}>
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors text-left">
        <Badge status={radar.status} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">{radar.title}</p>
          <p className="text-[10px] text-slate-400">{radar.subtitle}</p>
        </div>
        <svg viewBox="0 0 20 20" fill="currentColor"
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className={`border-t px-4 pb-4 ${radar.status === 'FLAG' ? 'border-red-100 bg-red-50/20' : radar.status === 'WARN' ? 'border-amber-100 bg-amber-50/20' : 'border-slate-100'}`}>
          <p className="text-xs text-slate-500 mt-3 mb-3">{radar.summary}</p>
          {radar.issues?.length > 0 && (
            <div className="space-y-2">
              {radar.issues.map((issue, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2.5 ${issue.severity === 'FLAG' ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge status={issue.severity} small />
                    <span className="text-xs font-semibold text-slate-700">{issue.title}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{issue.message}</p>
                  <div className="mt-2 flex justify-end">
                    <SaveToKBButton
                      title={issue.title}
                      content={buildRadarIssueContent(issue, 'Specification')}
                      severity={issue.severity}
                      suggestedTags={['error-radar', 'spec']}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {radar.status === 'PASS' && (
            <p className="text-xs text-green-600 flex items-center gap-1.5">
              <span className="w-3.5 h-3.5">✓</span> No internal contradictions detected
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bid Radar section ─────────────────────────────────────────────────────────

function BidRadarSection({ radar }) {
  const [open, setOpen] = useState(radar.status === 'FLAG');

  return (
    <div className={`rounded-xl border overflow-hidden ${radar.status === 'FLAG' ? 'border-red-200' : radar.status === 'WARN' ? 'border-amber-200' : 'border-slate-200'}`}>
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors text-left">
        <Badge status={radar.status} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">{radar.title}</p>
          <p className="text-[10px] text-slate-400">
            {radar.status === 'SKIP' ? radar.subtitle : `v${radar.matrixVersion} · ${radar.subtitle}`}
          </p>
        </div>
        <svg viewBox="0 0 20 20" fill="currentColor"
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className={`border-t px-4 pb-4 ${radar.status === 'FLAG' ? 'border-red-100 bg-red-50/20' : radar.status === 'WARN' ? 'border-amber-100 bg-amber-50/20' : 'border-slate-100'}`}>
          <p className="text-xs text-slate-500 mt-3 mb-3">{radar.summary}</p>
          {radar.issues?.length > 0 && (
            <div className="space-y-3">
              {radar.issues.map((issue, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2.5 ${issue.severity === 'FLAG' ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge status={issue.severity} small />
                    <span className="text-xs font-semibold text-slate-700">{issue.title}</span>
                  </div>
                  <p className="text-xs text-slate-600 mb-2 leading-relaxed">{issue.message}</p>
                  {issue.items?.length > 0 && (
                    <div className="space-y-0.5">
                      {issue.items.map((it, j) => (
                        <div key={j} className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span className="font-semibold font-mono text-slate-700">{it.type}</span>
                          {it.detail && <span className="text-slate-400">· {it.detail}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 pt-2 border-t border-slate-200/60 flex justify-end">
                    <SaveToKBButton
                      title={issue.title}
                      content={buildRadarIssueContent(issue, 'Bid')}
                      severity={issue.severity}
                      suggestedTags={['error-radar', 'bid']}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {radar.status === 'PASS' && (
            <p className="text-xs text-green-600">✓ Bid matrix aligned with schedule and takeoff</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HumanErrorRadar({ projectId }) {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/error-radar`);
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { if (open && !data) load(); }, [open, data, load]);

  const overall = data?.overallStatus;
  const radars  = data?.radars ?? [];
  const flagCount = radars.filter(r => r.status === 'FLAG').length;
  const warnCount = radars.filter(r => r.status === 'WARN').length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            overall === 'FLAG' ? 'bg-red-100' : overall === 'WARN' ? 'bg-amber-100' : 'bg-slate-100'
          }`}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
              className={`w-4 h-4 ${overall === 'FLAG' ? 'text-red-600' : overall === 'WARN' ? 'text-amber-600' : 'text-slate-400'}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Human Error Radar</p>
            <p className="text-xs text-slate-400 mt-0.5">Quantity · Specification · Bid reconciliation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <div className="flex items-center gap-1.5 text-xs">
              {flagCount > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{flagCount} radar{flagCount !== 1 ? 's' : ''} flagged</span>}
              {warnCount > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{warnCount} warn</span>}
              {!flagCount && !warnCount && overall === 'PASS' && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">All clear</span>}
            </div>
          )}
          <svg viewBox="0 0 20 20" fill="currentColor"
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {loading && (
            <div className="flex items-center gap-2 px-6 py-8 text-slate-400 text-sm">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              Running radars…
            </div>
          )}

          {error && <div className="px-6 py-4 text-sm text-red-600">{error}</div>}

          {!loading && !error && data && (
            <>
              {/* Data sources status bar */}
              <div className="flex flex-wrap items-center gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs">
                <span className={`flex items-center gap-1 ${data.meta.hasSchedule ? 'text-green-600' : 'text-amber-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${data.meta.hasSchedule ? 'bg-green-500' : 'bg-amber-400'}`} />
                  {data.meta.hasSchedule ? `${data.meta.fixtureCount} fixture types` : 'No schedule'}
                </span>
                <span className={`flex items-center gap-1 ${data.meta.hasTakeoff ? 'text-green-600' : 'text-amber-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${data.meta.hasTakeoff ? 'bg-green-500' : 'bg-amber-400'}`} />
                  {data.meta.hasTakeoff ? `Takeoff: ${data.meta.takeoffFile?.name}` : 'No takeoff'}
                </span>
                <span className={`flex items-center gap-1 ${data.meta.hasBidMatrix ? 'text-green-600' : 'text-slate-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${data.meta.hasBidMatrix ? 'bg-green-500' : 'bg-slate-300'}`} />
                  {data.meta.hasBidMatrix ? `Bid matrix v${data.meta.bidMatrixVersion}` : 'No bid matrix'}
                </span>
                <button onClick={load} className="ml-auto text-slate-400 hover:text-slate-600 flex items-center gap-1 text-xs transition-colors">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H5.498a.75.75 0 00-.75.75v3.236a.75.75 0 001.5 0v-1.83l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.388zm-3.564-9.324a7 7 0 00-11.712 3.138.75.75 0 001.449.388 5.5 5.5 0 019.201-2.466l.312.311H8.564a.75.75 0 000 1.5h3.432a.75.75 0 00.75-.75V1.018a.75.75 0 00-1.5 0v1.83l-.498-.748z" clipRule="evenodd" />
                  </svg>
                  Refresh
                </button>
              </div>

              <div className="px-6 py-5 space-y-3">
                {radars.map(radar =>
                  radar.id === 'quantity-radar' ? <QuantityRadarSection key={radar.id} radar={radar} /> :
                  radar.id === 'spec-radar'     ? <SpecRadarSection     key={radar.id} radar={radar} /> :
                                                   <BidRadarSection      key={radar.id} radar={radar} />
                )}
              </div>

              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400">
                Human Error Radar catches cross-document inconsistencies, not code violations. FLAG = definite discrepancy. WARN = needs attention.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
