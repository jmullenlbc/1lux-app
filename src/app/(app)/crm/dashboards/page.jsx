export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma as db } from '@/lib/db';
import { DEFAULT_WIDGETS } from '@/lib/defaultDashboard';
import DashboardsClient from './DashboardsClient';

export const metadata = { title: 'CRM Dashboards: 1LUX' };

export default async function CRMDashboardsPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  let dashboards = await db.dashboard.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: { widgets: { orderBy: { position: 'asc' } } },
  });

  if (dashboards.length === 0) {
    const def = await db.dashboard.create({
      data: {
        name: 'Main Dashboard',
        isDefault: true,
        createdById: user.id,
        widgets: { create: DEFAULT_WIDGETS },
      },
      include: { widgets: { orderBy: { position: 'asc' } } },
    });
    dashboards = [def];
  }

  return <DashboardsClient dashboards={dashboards} user={user} />;
}
