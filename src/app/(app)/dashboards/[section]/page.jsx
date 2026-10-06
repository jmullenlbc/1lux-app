export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardView from './DashboardView';
import MeetingDashboard from './MeetingDashboard';
import VisitorsPanel from './VisitorsPanel';
import BriefPanel from './BriefPanel';
import SalesDashboardTabs, { salesDashboardTab } from '@/components/dashboards/SalesDashboardTabs';
import { SECTION_LABEL } from '@/lib/dashboards/fieldCatalog';

const VALID = { main: 'MAIN', sales: 'SALES', budget: 'BUDGET' };

export default async function DashboardSectionPage({ params, searchParams }) {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const raw = (params.section || '').toLowerCase();

  // The weekly sales meeting is a curated run-of-show, not the field-picker builder.
  if (raw === 'meeting') return <MeetingDashboard />;

  const section = VALID[raw];
  if (!section) redirect('/dashboards/main');

  // Sales dashboard tabs (Mike 10-6): Dashboard / Budget page visitors / Brief.
  if (section === 'SALES') {
    const tab = salesDashboardTab(searchParams?.tab);
    if (tab !== 'dashboard') {
      return (
        <div className="p-6">
          <SalesDashboardTabs active={tab} />
          {tab === 'visitors' ? <VisitorsPanel days={searchParams?.days} /> : <BriefPanel />}
        </div>
      );
    }
  }

  return (
    <DashboardView
      section={section}
      sectionLabel={SECTION_LABEL[section] || section}
      tabs={section === 'SALES' ? <SalesDashboardTabs active="dashboard" /> : null}
    />
  );
}
