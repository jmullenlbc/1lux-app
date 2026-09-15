export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, can } from '@/lib/auth';
import { loadPricing } from '@/lib/pricingLoader';
import { prisma } from '@/lib/db';
import PricingEditor from './PricingEditor';

export default async function AdminPricingPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Pre-construction, Operations and admins (src/lib/permissions.js).
  if (!can(session, 'editMasterPricing')) redirect('/dashboard');

  const [pricing, piConfigs] = await Promise.all([
    loadPricing(),
    prisma.systemConfig.findMany({
      where: { key: { in: ['pricing_alert_threshold', 'pricing_alert_window_months'] } },
    }),
  ]);
  const pricingIntel = Object.fromEntries(piConfigs.map(r => [r.key, r.value]));

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <span>ILC Admin</span>
          <span>/</span>
          <span className="text-slate-600">Pricing Configuration</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Pricing Configuration</h1>
        <p className="text-slate-500 text-sm mt-1">
          All rates, unit costs, and multipliers used in budget calculations. Changes apply
          immediately to all new calculations. Existing saved projects are not retroactively updated.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Pre-construction, Operations and admins only
        </div>
      </div>

      <PricingEditor initialPricing={pricing} initialPricingIntel={pricingIntel} />
    </div>
  );
}
