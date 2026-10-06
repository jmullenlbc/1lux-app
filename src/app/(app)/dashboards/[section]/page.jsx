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

  // The weekly meeting is a tab on the Sales dashboard now (Mike 10-6).
  if (raw === 'meeting') redirect('/dashboards/sales?tab=meeting');

  const section = VALID[raw];
  if (!section) redirect('/dashboards/main');

  // Sales dashboard tabs (Mike 10-6): Dashboard / Weekly Meeting / Budget page visitors / Morning Brief.
  if (section === 'SALES') {
    const tab = salesDashboardTab(searchParams?.tab);
    if (tab !== 'dashboard') {
      return (
        <div className="p-6">
          <SalesDashboardTabs active={tab} />
          {tab === 'meeting'  && <MeetingDashboard embedded />}
          {tab === 'visitors' && <VisitorsPanel days={searchParams?.days} />}
          {tab === 'brief'    && <BriefPanel />}
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
