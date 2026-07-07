'use client';

import { PIPELINE_STAGES, STAGE_LABEL } from '@/lib/pipeline';

function fmtDate(str) {
  if (!str) return null;
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  catch { return null; }
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

export default function BriefClient({ stale, procSnapshot, designSnapshot, recentWins }) {
  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">ILC Studios</span>
            <h1 className="text-xl font-bold text-slate-900">Morning Brief</h1>
          </div>
          <a href="/crm" className="text-sm text-slate-500 hover:text-slate-700 underline">
            ← Back to Pipeline
          </a>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Section 1: Needs Attention */}
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Needs Attention (30+ days untouched)</h2>
            {stale.length === 0 ? (
              <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center text-green-700 font-semibold">
                ✓ All caught up — no stale open projects.
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Project</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Client</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Stage</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stale.map(p => {
                      const procOpen = p.procurementStatus === 'OPEN';
                      const designOpen = p.designStatus === 'OPEN';
                      const stage = procOpen ? STAGE_LABEL[p.procurementStage] : STAGE_LABEL[p.designStage];
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-semibold text-slate-900">{p.name}</td>
                          <td className="px-4 py-2.5 text-slate-600">{p.client?.name || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600">{stage || '—'}</td>
                          <td className="px-4 py-2.5 text-amber-600 font-semibold">{daysSince(p.updatedAt)}d</td>
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
            <h2 className="text-lg font-bold text-slate-900 mb-3">Pipeline Snapshot (Open projects by stage)</h2>
            <div className="grid grid-cols-2 gap-4">
              {/* Procurement */}
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
                  <h3 className="font-bold text-slate-900">📦 Procurement</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Stage</th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PIPELINE_STAGES.PROCUREMENT.map(s => {
                      const count = procSnapshot.find(x => x.procurementStage === s.key)?._count.id || 0;
                      return (
                        <tr key={s.key} className={count > 0 ? 'hover:bg-slate-50' : ''}>
                          <td className="px-4 py-2.5 text-slate-700">{s.label}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900">{count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Design */}
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
                  <h3 className="font-bold text-slate-900">✏️ Design</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Stage</th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PIPELINE_STAGES.DESIGN.map(s => {
                      const count = designSnapshot.find(x => x.designStage === s.key)?._count.id || 0;
                      return (
                        <tr key={s.key} className={count > 0 ? 'hover:bg-slate-50' : ''}>
                          <td className="px-4 py-2.5 text-slate-700">{s.label}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900">{count}</td>
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
            <h2 className="text-lg font-bold text-slate-900 mb-3">Won (Last 30 days)</h2>
            {recentWins.length === 0 ? (
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center text-slate-500">
                No recent wins in the last 30 days.
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Project</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Client</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Pipeline</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentWins.map(p => {
                      const pipelines = [];
                      if (p.procurementStatus === 'WON') pipelines.push('Procurement');
                      if (p.designStatus === 'WON') pipelines.push('Design');
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-semibold text-slate-900">{p.name}</td>
                          <td className="px-4 py-2.5 text-slate-600">{p.client?.name || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600">{pipelines.join(', ')}</td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(p.updatedAt) || '—'}</td>
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
