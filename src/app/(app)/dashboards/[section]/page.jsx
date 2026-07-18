export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardView from './DashboardView';
import MeetingDashboard from './MeetingDashboard';
import { SECTION_LABEL } from '@/lib/dashboards/fieldCatalog';

const VALID = { main: 'MAIN', sales: 'SALES', budget: 'BUDGET' };

export default async function DashboardSectionPage({ params }) {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const raw = (params.section || '').toLowerCase();

  // The weekly sales meeting is a curated run-of-show, not the field-picker builder.
  if (raw === 'meeting') return <MeetingDashboard />;

  const section = VALID[raw];
  if (!section) redirect('/dashboards/main');

  return <DashboardView section={section} sectionLabel={SECTION_LABEL[section] || section} />;
}
