export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { projectScopeWhere } from '@/lib/projectScope';
import { SPACES_SELECT, spaceKeys, spaceWhere } from '@/lib/companySpaces';
import SpaceBadge from '@/components/ui/SpaceBadge';
import SpaceChips from '@/components/ui/SpaceChips';
import { CARD, H1, HELPER } from '@/components/ui/tokens';

// My Jobs (Mike 10-31): the jobs this person is a picked Project Manager on,
// the Construction phone tab. Everyone still sees every job under Projects.
// Company chips (0165) narrow the list to LOGIQ, SAGE or Shift.
export default async function MyJobsPage({ searchParams }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const space = typeof searchParams?.space === 'string' ? searchParams.space : '';
  const [jobs, me] = await Promise.all([
    prisma.project.findMany({
      where:   { ...projectScopeWhere(session), ...spaceWhere(space), assignees: { some: { userId: session.id, isPm: true } } },
      select:  { id: true, name: true, city: true, state: true, businessUnitId: true, client: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findUnique({ where: { id: session.id }, select: { businessUnits: SPACES_SELECT } }),
  ]);

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className={H1}>My Jobs</h1>
      <p className={`${HELPER} mt-1 mb-4`}>Jobs where you are a Project Manager.</p>
      <SpaceChips basePath="/my-jobs" current={space} mySpaces={spaceKeys(me)} />
      {jobs.length === 0 ? (
        <p className={HELPER}>
          {space
            ? 'None of your jobs are in this company.'
            : "You are not a Project Manager on any job yet. A job's PMs are picked at the top of that job."}
        </p>
      ) : (
        <div className={`${CARD} divide-y divide-slate-100 overflow-hidden`}>
          {jobs.map(j => (
            <Link key={j.id} href={`/project/${j.id}`} className="block min-h-[48px] px-4 py-3 hover:bg-amber-50">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{j.name}</p>
                <SpaceBadge businessUnitId={j.businessUnitId} />
              </div>
              <p className={`${HELPER} mt-0.5 truncate`}>
                {[j.client?.name, [j.city, j.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
