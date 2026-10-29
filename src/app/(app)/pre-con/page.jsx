export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { projectScopeWhere } from '@/lib/projectScope';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import PreConBudgetsTable from './PreConBudgetsTable';
import GuessAccuracyCard from './GuessAccuracyCard';
import { conceptualAccuracy } from '@/lib/budgetAmounts';
import { CARD, H1, H2, HELPER, STAT_VALUE } from '@/components/ui/tokens';
import SectionTabs from '@/components/ui/SectionTabs';
import PreConRfqs from './PreConRfqs';

const TABS = [
  { key: 'budgets', href: '/pre-con', label: 'Budgets' },
  { key: 'rfqs', href: '/pre-con?tab=rfqs', label: 'RFQs' },
];

export default async function PreConPage({ searchParams }) {
  const { error, user } = await requireAuth();
  if (error) redirect('/login');
  const tab = searchParams?.tab === 'rfqs' ? 'rfqs' : 'budgets';

  if (tab === 'rfqs') {
    let rfqs = [];
    try {
      const rows = await prisma.rfq.findMany({
        where: { project: projectScopeWhere(user) },
        select: {
          id: true, number: true, status: true, toName: true, needBy: true, sentByName: true,
          receivedAt: true, createdAt: true, updatedAt: true,
          project: { select: { id: true, name: true } },
          lines: { select: { dnPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      rfqs = rows.map(({ lines, ...r }) => ({ ...r, total: lines.length, priced: lines.filter((l) => l.dnPrice != null).length }));
    } catch (err) {
      console.error('[/pre-con rfqs] DB query failed:', err?.message ?? err);
    }
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className={H1}>Pre-Construction</h1>
          <p className={`${HELPER} mt-1 mb-4`}>Every RFQ sent to reps, across your jobs.</p>
          <SectionTabs tabs={TABS} active="rfqs" />
          <PreConRfqs rfqs={rfqs} />
        </div>
      </div>
    );
  }

  let mfrCount = 0, productCount = 0, projects = [];
  try {
    [mfrCount, productCount, projects] = await Promise.all([
      prisma.manufacturer.count(),
      prisma.manufacturerProduct.count(),
      prisma.project.findMany({
        where: projectScopeWhere(user),
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

  // Conceptual number vs the real one, per building type (0116). Read only:
  // a person decides what, if anything, to change.
  let accuracy = { jobs: [], types: [] };
  try {
    const withNumbers = await prisma.project.findMany({
      where: { ...projectScopeWhere(user), budgetAmounts: { some: { tier: 'conceptual', archivedAt: null } } },
      select: {
        id: true, name: true, buildingType: true,
        budgetAmounts: { where: { archivedAt: null }, select: { tier: true, amount: true, createdAt: true, archivedAt: true } },
      },
    });
    accuracy = conceptualAccuracy(withNumbers.map(p => ({ ...p, amounts: p.budgetAmounts })));
  } catch (err) {
    console.error('[/pre-con] accuracy query failed:', err?.message ?? err);
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
          <h1 className={H1}>Pre-Construction</h1>
          <p className={`${HELPER} mt-1 mb-4`}>Manage your manufacturer catalog, products, and all budgets.</p>
          <SectionTabs tabs={TABS} active="budgets" className="-mt-1" />
        </div>

        {/* ── Catalog cards ── */}
        <div className="grid grid-cols-2 gap-6">

          <Link href="/manufacturers"
            className={`group ${CARD} p-5 hover:shadow-md hover:border-orange-300 transition-all`}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-orange-50 group-hover:bg-orange-100 flex items-center justify-center transition-colors shrink-0">
                <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className={`${H2} group-hover:text-orange-600 transition-colors`}>Manufacturers</h2>
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-orange-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500 mt-1">Account details, terms, credit limits, and contact info for all vendors.</p>
                <div className="mt-4 flex items-center gap-1.5">
                  <span className={STAT_VALUE}>{mfrCount.toLocaleString()}</span>
                  <span className={HELPER}>manufacturers</span>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/products"
            className={`group ${CARD} p-5 hover:shadow-md hover:border-orange-300 transition-all`}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-orange-50 group-hover:bg-orange-100 flex items-center justify-center transition-colors shrink-0">
                <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className={`${H2} group-hover:text-orange-600 transition-colors`}>Product Catalog</h2>
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-orange-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500 mt-1">All part numbers, specs, pricing, and fixture types across every manufacturer.</p>
                <div className="mt-4 flex items-center gap-1.5">
                  <span className={STAT_VALUE}>{productCount.toLocaleString()}</span>
                  <span className={HELPER}>part numbers</span>
                </div>
              </div>
            </div>
          </Link>

        </div>

        <GuessAccuracyCard accuracy={accuracy} />

        {/* ── Budgets table ── */}
        <PreConBudgetsTable projects={projectsWithTotals} />

      </div>
    </div>
  );
}
