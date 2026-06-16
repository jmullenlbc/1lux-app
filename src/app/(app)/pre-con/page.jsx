export const dynamic = 'force-dynamic';

import { requireAuth, isSuperAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import PreConBudgetsTable from './PreConBudgetsTable';

export default async function PreConPage() {
  const { error, user } = await requireAuth();
  if (error) redirect('/login');

  let mfrCount = 0, productCount = 0, projects = [];
  try {
    [mfrCount, productCount, projects] = await Promise.all([
      prisma.manufacturer.count(),
      prisma.manufacturerProduct.count(),
      prisma.project.findMany({
        where: isSuperAdmin(user.role) ? {} : { createdById: user.id },
        include: {
          projectData: { select: { clientInitialBudget: true, freightPct: true, warehousingPct: true, salesTaxPct: true } },
          peerReviewItems: { select: { totalSavings: true } },
          shares: { orderBy: { sentAt: 'desc' }, take: 1, select: { sentAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
  } catch (err) {
    console.error('[/pre-con] DB query failed:', err?.message ?? err);
  }

  // Compute grand total for each project from peer review items
  const projectsWithTotals = projects.map(p => {
    const pd = p.projectData;
    const freightPct    = pd?.freightPct    ?? 0.06;
    const warehousingPct = pd?.warehousingPct ?? 0.03;
    const salesTaxPct   = pd?.salesTaxPct   ?? 0;
    const adderMult     = 1 + freightPct + warehousingPct + salesTaxPct;
    const rawTotal      = p.peerReviewItems.reduce((s, i) => s + (i.totalSavings || 0), 0);
    const grandTotal    = rawTotal > 0 ? rawTotal * adderMult : null;
    return {
      id: p.id,
      name: p.name,
      budgetType: p.budgetType,
      budgetNumber: p.budgetNumber,
      budgetSentDate: p.budgetSentDate?.toISOString() ?? null,
      phase: p.phase,
      createdAt: p.createdAt.toISOString(),
      sentAt: p.shares[0]?.sentAt?.toISOString() ?? null,
      grandTotal,
    };
  });

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pre-Construction</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your manufacturer catalog, products, and all budgets.</p>
        </div>

        {/* ── Catalog cards ── */}
        <div className="grid grid-cols-2 gap-6">

          <Link href="/manufacturers"
            className="group bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:shadow-md hover:border-blue-200 transition-all">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors shrink-0">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">Manufacturers</h2>
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500 mt-1">Account details, terms, credit limits, and contact info for all vendors.</p>
                <div className="mt-4 flex items-center gap-1.5">
                  <span className="text-2xl font-bold text-slate-800">{mfrCount.toLocaleString()}</span>
                  <span className="text-sm text-slate-400">manufacturers</span>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/products"
            className="group bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:shadow-md hover:border-violet-200 transition-all">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-50 group-hover:bg-violet-100 flex items-center justify-center transition-colors shrink-0">
                <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900 group-hover:text-violet-700 transition-colors">Product Catalog</h2>
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-violet-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500 mt-1">All part numbers, specs, pricing, and fixture types across every manufacturer.</p>
                <div className="mt-4 flex items-center gap-1.5">
                  <span className="text-2xl font-bold text-slate-800">{productCount.toLocaleString()}</span>
                  <span className="text-sm text-slate-400">part numbers</span>
                </div>
              </div>
            </div>
          </Link>

        </div>

        {/* ── Budgets table ── */}
        <PreConBudgetsTable projects={projectsWithTotals} />

      </div>
    </div>
  );
}
