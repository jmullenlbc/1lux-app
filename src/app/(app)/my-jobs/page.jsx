export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { projectScopeWhere } from '@/lib/projectScope';
import { CARD, H1, HELPER } from '@/components/ui/tokens';

// My Jobs (Mike 10-31): the jobs this person is a picked Project Manager on,
// the Construction phone tab. Everyone still sees every job under Projects.
export default async function MyJobsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const jobs = await prisma.project.findMany({
    where:   { ...projectScopeWhere(session), assignees: { some: { userId: session.id, isPm: true } } },
    select:  { id: true, name: true, city: true, state: true, client: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className={H1}>My Jobs</h1>
      <p className={`${HELPER} mt-1 mb-4`}>Jobs where you are a Project Manager.</p>
      {jobs.length === 0 ? (
        <p className={HELPER}>You are not a Project Manager on any job yet. A job's PMs are picked at the top of that job.</p>
      ) : (
        <div className={`${CARD} divide-y divide-slate-100 overflow-hidden`}>
          {jobs.map(j => (
            <Link key={j.id} href={`/project/${j.id}`} className="block min-h-[48px] px-4 py-3 hover:bg-amber-50">
              <p className="text-sm font-semibold text-slate-900 truncate">{j.name}</p>
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
