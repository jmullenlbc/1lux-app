'use client';
import { useState, useEffect, useCallback } from 'react';
import SaveToKBButton from './SaveToKBButton';

function buildCheckContent(check) {
  const parts = [];
  if (check.summary) parts.push(`<p>${check.summary}</p>`);
  if (check.items?.length) {
    parts.push('<ul>' + check.items.map(it =>
      `<li><strong>${it.type || ''}</strong>${it.message ? ' — ' + it.message : ''}${it.detail ? ' (' + it.detail + ')' : ''}</li>`
    ).join('') + '</ul>');
  }
  if (check.code) parts.push(`<p><em>Reference: ${check.code}</em></p>`);
  return parts.join('') || check.title;
}

function buildAIIssueContent(issue) {
  const parts = [];
  if (issue.items?.length) {
    parts.push('<ul>' + issue.items.map(it => `<li>${it}</li>`).join('') + '</ul>');
  }
  if (issue.recommendation) {
    parts.push(`<p><strong>Recommendation:</strong> ${issue.recommendation}</p>`);
  }
  if (issue.code) parts.push(`<p><em>Reference: ${issue.code}</em></p>`);
  return parts.join('') || issue.title;
}

const STATUS_META = {
  PASS:   { label: 'PASS',   bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  FLAG:   { label: 'FLAG',   bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  VERIFY: { label: 'VERIFY', bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  WARN:   { label: 'WARN',   bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  SKIP:   { label: 'N/A',    bg: 'bg-slate-100',  text: 'text-slate-400',  dot: 'bg-slate-300'  },
};

function StatusBadge({ status, small }) {
  const m = STATUS_META[status] ?? STATUS_META.SKIP;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${small ? 'text-[9px]' : 'text-[10px]'} ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function CheckCard({ check, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen || check.status === 'FLAG');
  const m = STATUS_META[check.status] ?? STATUS_META.SKIP;

  return (
    <div className={`rounded-xl border overflow-hidden ${check.status === 'FLAG' ? 'border-red-200' : check.status === 'VERIFY' ? 'border-blue-200' : 'border-slate-200'}`}>
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 transition-colors"
      >
        <StatusBadge status={check.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{check.title}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{check.code}</p>
        </div>
        <svg
          viewBox="0 0 20 20" fill="currentColor"
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className={`px-4 pb-4 border-t ${check.status === 'FLAG' ? 'border-red-100 bg-red-50/30' : check.status === 'VERIFY' ? 'border-blue-100 bg-blue-50/20' : 'border-slate-100 bg-slate-50/30'}`}>
          <p className="text-xs text-slate-600 mt-3 mb-2">{check.summary}</p>
          {check.items?.length > 0 && (
            <div className="space-y-1.5">
              {check.items.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs">
                  <span className="shrink-0 mt-0.5">
                    {item.level === 'FLAG' || check.status === 'FLAG'
                      ? <span className="text-red-500">▲</span>
                      : item.level === 'VERIFY' || check.status === 'VERIFY'
                        ? <span className="text-blue-500">◆</span>
                        : <span className="text-amber-500">●</span>}
                  </span>
                  <div>
                    <span className="font-semibold text-slate-700">{item.type}</span>
                    {item.detail && <span className="text-slate-400 ml-1">— {item.detail}</span>}
                    <p className="text-slate-500 mt-0.5 leading-relaxed">{item.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(check.status === 'FLAG' || check.status === 'VERIFY') && (
            <div className="mt-3 pt-3 border-t border-slate-200/60 flex justify-end">
              <SaveToKBButton
                title={check.title}
                content={buildCheckContent(check)}
                severity={check.status}
                suggestedTags={['code-check', 'deterministic']}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// AI review result card
function AIIssueCard({ issue }) {
  const [open, setOpen] = useState(issue.severity === 'FLAG');
  const m = STATUS_META[issue.severity] ?? STATUS_META.SKIP;

  return (
    <div className={`rounded-xl border overflow-hidden ${issue.severity === 'FLAG' ? 'border-red-200' : issue.severity === 'VERIFY' ? 'border-blue-200' : 'border-slate-200'}`}>
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 transition-colors">
        <StatusBadge status={issue.severity} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{issue.title}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{issue.code}</p>
        </div>
        <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className={`px-4 pb-4 border-t ${issue.severity === 'FLAG' ? 'border-red-100 bg-red-50/30' : issue.severity === 'VERIFY' ? 'border-blue-100 bg-blue-50/20' : 'border-slate-100 bg-slate-50/30'}`}>
          {issue.items?.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {issue.items.map((it, i) => <li key={i} className="flex gap-2"><span className="shrink-0 mt-0.5 text-slate-400">•</span>{it}</li>)}
            </ul>
          )}
          {issue.recommendation && (
            <p className="mt-3 text-xs text-slate-500 border-t border-slate-200 pt-3 leading-relaxed">
              <span className="font-semibold text-slate-700">Recommendation: </span>{issue.recommendation}
            </p>
          )}
          <div className="mt-3 pt-3 border-t border-slate-200/60 flex justify-end">
            <SaveToKBButton
              title={issue.title}
              content={buildAIIssueContent(issue)}
              severity={issue.severity}
              suggestedTags={['code-check', 'ai-review', issue.code ? issue.code.toLowerCase().replace(/[\s.§]/g, '-').replace(/-+/g, '-') : null].filter(Boolean)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CodeCheckPanel({ projectId }) {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [aiReview,  setAiReview]  = useState(null);   // { summary, issues, overallStatus }
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/code-check`);
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { if (open && !data) load(); }, [open, data, load]);

  async function runAiReview() {
    setAiLoading(true);
    setAiError(null);
    setAiReview(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/code-check`, { method: 'POST' });
      const text = await res.text();
      const parsed = JSON.parse(text);
      if (parsed.error) throw new Error(parsed.error);
      setAiReview(parsed);
    } catch (e) {
      setAiError(e.message || 'AI review failed');
    } finally {
      setAiLoading(false);
    }
  }

  // Summary counts for header
  const flags    = data?.meta?.flags   ?? 0;
  const verifies = data?.meta?.verifies ?? 0;
  const passes   = data?.meta?.passes   ?? 0;
  const overall  = data?.meta?.overallStatus;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            overall === 'FLAG' ? 'bg-red-100' : overall === 'VERIFY' ? 'bg-blue-100' : 'bg-green-100'
          }`}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
              className={`w-4 h-4 ${overall === 'FLAG' ? 'text-red-600' : overall === 'VERIFY' ? 'text-blue-600' : 'text-green-600'}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Code Check — Fixture Schedule</p>
            <p className="text-xs text-slate-400 mt-0.5">ASHRAE 90.1 · IFC · NEC · IECC</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <div className="flex items-center gap-1.5 text-xs">
              {flags   > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{flags} flag{flags !== 1 ? 's' : ''}</span>}
              {verifies> 0 && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{verifies} verify</span>}
              {passes  > 0 && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{passes} pass</span>}
            </div>
          )}
          <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
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
              Running checks…
            </div>
          )}

          {error && <div className="px-6 py-4 text-sm text-red-600">{error}</div>}

          {!loading && !error && data && (
            <>
              {/* Status bar */}
              <div className="flex flex-wrap items-center gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
                <span className={`flex items-center gap-1 ${data.hasSchedule ? 'text-green-600' : 'text-amber-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${data.hasSchedule ? 'bg-green-500' : 'bg-amber-400'}`} />
                  {data.hasSchedule ? `${data.meta.fixtureCount} fixture type${data.meta.fixtureCount !== 1 ? 's' : ''}` : 'No fixture schedule'}
                </span>
                <span className={`flex items-center gap-1 ${data.hasTakeoff ? 'text-green-600' : 'text-amber-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${data.hasTakeoff ? 'bg-green-500' : 'bg-amber-400'}`} />
                  {data.hasTakeoff ? `Takeoff: ${data.takeoffFile?.name}` : 'No takeoff — LPD checks partial'}
                </span>
                <button onClick={load} className="ml-auto text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H5.498a.75.75 0 00-.75.75v3.236a.75.75 0 001.5 0v-1.83l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.388zm-3.564-9.324a7 7 0 00-11.712 3.138.75.75 0 001.449.388 5.5 5.5 0 019.201-2.466l.312.311H8.564a.75.75 0 000 1.5h3.432a.75.75 0 00.75-.75V1.018a.75.75 0 00-1.5 0v1.83l-.498-.748z" clipRule="evenodd" />
                  </svg>
                  Refresh
                </button>
              </div>

              {!data.hasSchedule ? (
                <div className="px-6 py-8 text-center text-sm text-slate-400">
                  No fixture schedule yet. Add fixture types with descriptions, wattage, and locations to run code checks.
                </div>
              ) : (
                <div className="px-6 py-5 space-y-3">
                  {/* Deterministic checks */}
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Automatic Checks</p>
                  {data.checks.map(check => (
                    <CheckCard key={check.id} check={check} />
                  ))}

                  {/* AI Review section */}
                  <div className="pt-3">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">AI Deep Review</p>
                      {!aiReview && (
                        <button
                          onClick={runAiReview}
                          disabled={aiLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
                        >
                          {aiLoading ? (
                            <>
                              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                              </svg>
                              Reviewing…
                            </>
                          ) : (
                            <>
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M10 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 1zM5.05 3.05a.75.75 0 011.06 0l1.062 1.06A.75.75 0 116.11 5.173L5.05 4.11a.75.75 0 010-1.06zM14.95 3.05a.75.75 0 010 1.06l-1.06 1.062a.75.75 0 01-1.062-1.061l1.06-1.062a.75.75 0 011.062 0z" />
                                <path fillRule="evenodd" d="M10 6a4 4 0 100 8 4 4 0 000-8zm-5.5 4a5.5 5.5 0 1111 0 5.5 5.5 0 01-11 0z" clipRule="evenodd" />
                              </svg>
                              Review with AI
                            </>
                          )}
                        </button>
                      )}
                      {aiReview && (
                        <button onClick={() => { setAiReview(null); setAiError(null); }}
                          className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                          Clear
                        </button>
                      )}
                    </div>

                    {aiError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{aiError}</div>
                    )}

                    {aiReview && !aiError && (
                      <div className="space-y-3">
                        {/* AI summary */}
                        {aiReview.summary && (
                          <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3">
                            <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-1">AI Assessment</p>
                            <p className="text-sm text-violet-800 leading-relaxed">{aiReview.summary}</p>
                          </div>
                        )}
                        {aiReview.issues?.map((issue, i) => (
                          <AIIssueCard key={i} issue={issue} />
                        ))}
                        <p className="text-[10px] text-slate-400 text-center pt-1">
                          AI review powered by Claude · Always verify with EOR for life safety items
                        </p>
                      </div>
                    )}

                    {!aiReview && !aiLoading && !aiError && (
                      <div className="rounded-xl border border-dashed border-slate-200 px-5 py-5 text-center">
                        <p className="text-sm text-slate-400 mb-1">Deeper analysis using the full code corpus</p>
                        <p className="text-xs text-slate-300">Reads descriptions, mounting types, and catalog numbers to catch issues the automatic rules miss</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="px-6 py-3 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50">
                Checks reference ASHRAE 90.1-2022, IFC 2021, NEC 2020, IECC 2021. FLAG = confirmed issue. VERIFY = confirm with EOR or AHJ. WARN = best practice gap.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
