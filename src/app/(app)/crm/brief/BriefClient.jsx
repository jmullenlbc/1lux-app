'use client';

import { useState } from 'react';
import { PIPELINE_STAGES, STAGE_LABEL } from '@/lib/pipeline';
import { CARD, H1, H2, LABEL, TH, TD, NUM, CARD_TITLE } from '@/components/ui/tokens';

function fmtDate(str) {
  if (!str) return null;
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  catch { return null; }
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

// embedded: rendered inside the Sales dashboard's Brief tab (Mike 10-6), so no
// full-page frame or back link of its own.
export default function BriefClient({ stale, procSnapshot, designSnapshot, recentWins, embedded = false }) {
  const TODAY = new Date().toISOString().slice(0, 10);
  const LS_KEY = `brief-checked-${TODAY}`;
  const [checkedIds, setCheckedIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(LS_KEY)) || []);
    } catch { return new Set(); }
  });

  function toggle(id) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <div className={embedded ? '' : 'flex flex-col h-screen bg-slate-50 overflow-hidden'}>
      {/* Header */}
      <div className={embedded ? 'mb-5' : 'bg-white border-b border-slate-200 px-6 py-4 shrink-0'}>
        <div className="flex items-center justify-between gap-4">
          <div>
            {!embedded && <span className={`${LABEL} text-orange-500`}>1LUX</span>}
            <h1 className={H1}>Morning Brief</h1>
            {embedded && <p className="text-sm text-slate-500 mt-0.5">Stale open projects, the pipeline by stage, and what was won in the last 30 days.</p>}
          </div>
          {!embedded && (
            <a href="/crm" className="text-sm text-slate-500 hover:text-slate-700 underline">
              ← Back to Pipeline
            </a>
          )}
        </div>
      </div>

      {/* Body */}
      <div className={embedded ? '' : 'flex-1 overflow-y-auto px-6 py-4'}>
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Section 1: Needs Attention */}
          <section>
            <h2 className={`${H2} mb-3`}>Needs Attention (30+ days untouched)</h2>
            {stale.length === 0 ? (
              <div className="p-6 bg-green-50 border border-green-200 rounded-xl shadow-sm text-center text-green-700 font-semibold">
                ✓ All caught up, no stale open projects.
              </div>
            ) : (
              <div className={`${CARD} overflow-hidden`}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className={`${TH} w-4`}></th>
                      <th className={TH}>Project</th>
                      <th className={TH}>Client</th>
                      <th className={TH}>Stage</th>
                      <th className={TH}>Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stale.map(p => {
                      const procOpen = p.procurementStatus === 'OPEN';
                      const designOpen = p.designStatus === 'OPEN';
                      const stage = procOpen ? STAGE_LABEL[p.procurementStage] : STAGE_LABEL[p.designStage];
                      const isChecked = checkedIds.has(p.id);
                      return (
                        <tr key={p.id} className={`hover:bg-slate-50 ${isChecked ? 'opacity-40 line-through' : ''}`}>
                          <td className="px-2 py-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggle(p.id)}
                              className="shrink-0 accent-orange-500 w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className={`${TD} font-semibold text-slate-900`}>
                            <a
                              href={`/project/${p.id}`}
                              className="text-slate-900 hover:text-orange-600 underline"
                            >
                              {p.name}
                            </a>
                          </td>
                          <td className={TD}>{p.client?.name || '—'}</td>
                          <td className={TD}>{stage || '—'}</td>
                          <td className={`${TD} ${NUM} text-amber-600 font-semibold`}>{daysSince(p.updatedAt)}d</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 2: Pipeline Snapshot */}
          <section>
            <h2 className={`${H2} mb-3`}>Pipeline Snapshot (Open projects by stage)</h2>
            <div className="grid grid-cols-2 gap-4">
              {/* Procurement */}
              <div className={`${CARD} overflow-hidden`}>
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
                  <h3 className={CARD_TITLE}>📦 Procurement</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className={TH}>Stage</th>
                      <th className={`${TH} text-right`}>Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PIPELINE_STAGES.PROCUREMENT.map(s => {
                      const count = procSnapshot.find(x => x.procurementStage === s.key)?._count.id || 0;
                      return (
                        <tr key={s.key} className={count > 0 ? 'hover:bg-slate-50' : ''}>
                          <td className={TD}>{s.label}</td>
                          <td className={`${TD} ${NUM} text-right font-bold text-slate-900`}>{count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Design */}
              <div className={`${CARD} overflow-hidden`}>
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
                  <h3 className={CARD_TITLE}>✏️ Design</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className={TH}>Stage</th>
                      <th className={`${TH} text-right`}>Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PIPELINE_STAGES.DESIGN.map(s => {
                      const count = designSnapshot.find(x => x.designStage === s.key)?._count.id || 0;
                      return (
                        <tr key={s.key} className={count > 0 ? 'hover:bg-slate-50' : ''}>
                          <td className={TD}>{s.label}</td>
                          <td className={`${TD} ${NUM} text-right font-bold text-slate-900`}>{count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Section 3: Recent Wins */}
          <section>
            <h2 className={`${H2} mb-3`}>Won (Last 30 days)</h2>
            {recentWins.length === 0 ? (
              <div className={`${CARD} p-6 text-center text-sm text-slate-500`}>
                No recent wins in the last 30 days.
              </div>
            ) : (
              <div className={`${CARD} overflow-hidden`}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className={TH}>Project</th>
                      <th className={TH}>Client</th>
                      <th className={TH}>Pipeline</th>
                      <th className={TH}>Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentWins.map(p => {
                      const pipelines = [];
                      if (p.procurementStatus === 'WON') pipelines.push('Procurement');
                      if (p.designStatus === 'WON') pipelines.push('Design');
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className={`${TD} font-semibold text-slate-900`}>
                            <a
                              href={`/project/${p.id}`}
                              className="text-slate-900 hover:text-orange-600 underline"
                            >
                              {p.name}
                            </a>
                          </td>
                          <td className={TD}>{p.client?.name || '—'}</td>
                          <td className={TD}>{pipelines.join(', ')}</td>
                          <td className={`${TD} ${NUM}`}>{fmtDate(p.updatedAt) || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
