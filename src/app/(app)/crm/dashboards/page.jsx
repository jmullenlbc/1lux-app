export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const metadata = { title: 'CRM Dashboards — ILC Studios' };

export default async function CRMDashboardsPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">ILC Studios</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Dashboards</h1>
        <p className="text-xs text-slate-500 mt-0.5">Customizable sales reports &amp; analytics</p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-2xl mx-auto text-center">
          {/* Coming Soon card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-10 py-12">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-slate-900 mb-2">Sales Dashboards</h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Customizable sales reports with drag-and-drop widgets. Track win rates, pipeline velocity, revenue by service type, and more — tailored to your workflow.
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              <span className="text-xs font-semibold text-violet-700">Planned feature</span>
            </div>
          </div>

          {/* Widget preview hints */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { label: 'Win Rate',        icon: '🏆', desc: 'Won vs Lost deals over time' },
              { label: 'Pipeline Value',  icon: '💰', desc: 'Revenue by stage & pipeline' },
              { label: 'Service Mix',     icon: '📊', desc: 'Breakdown by service type' },
              { label: 'Velocity',        icon: '⚡', desc: 'Avg days to close by stage' },
              { label: 'Owner Leaderboard', icon: '👤', desc: 'Revenue & deals by rep' },
              { label: 'Forecast',        icon: '📈', desc: 'Weighted pipeline forecast' },
            ].map(w => (
              <div key={w.label} className="bg-white rounded-xl border border-dashed border-slate-200 px-4 py-4 text-left opacity-60">
                <div className="text-xl mb-1.5">{w.icon}</div>
                <p className="text-xs font-semibold text-slate-700">{w.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
