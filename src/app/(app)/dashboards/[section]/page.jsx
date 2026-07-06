export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardView from './DashboardView';
import { SECTION_LABEL } from '@/lib/dashboards/fieldCatalog';

const VALID = { main: 'MAIN', sales: 'SALES', budget: 'BUDGET' };

export default async function DashboardSectionPage({ params }) {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const section = VALID[(params.section || '').toLowerCase()];
  if (!section) redirect('/dashboards/main');

  return <DashboardView section={section} sectionLabel={SECTION_LABEL[section] || section} />;
}
