export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SHIP_BOARD_SELECT, shipBoardRows } from '@/lib/shipBoard';
import { SPACES_SELECT, spaceKeys } from '@/lib/companySpaces';
import { H1, HELPER } from '@/components/ui/tokens';
import ShipBoard from './ShipBoard';

// Ship Schedules across every job (Mike 10-31). Staff only, the same as each
// job's own Ship Schedule tab. Changes still happen on the job.
export default async function ShipSchedulesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!canSeeAllData(session)) redirect('/dashboard');

  const [projects, me] = await Promise.all([
    prisma.project.findMany({
      where:  { shipments: { some: {} } },
      select: {
        id: true, name: true, businessUnitId: true,
        assignees: { where: { userId: session.id, isPm: true }, select: { id: true } },
        shipments: { select: SHIP_BOARD_SELECT },
      },
    }),
    prisma.user.findUnique({ where: { id: session.id }, select: { businessUnits: SPACES_SELECT } }),
  ]);

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className={H1}>Ship Schedules</h1>
      <p className={`${HELPER} mt-1 mb-4`}>Every job, soonest ship date first. Tap a row to open that job's Ship Schedule.</p>
      <ShipBoard rows={shipBoardRows(projects)} mySpaces={spaceKeys(me)} />
    </div>
  );
}
