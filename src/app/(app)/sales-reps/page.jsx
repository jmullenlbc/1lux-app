export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { prisma }      from '@/lib/db';
import { redirect }    from 'next/navigation';
import SalesRepsClient from './SalesRepsClient';

export const metadata = { title: 'Sales Reps: ILC Studios' };

export default async function SalesRepsPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  // Aggregate unique reps from PeerReviewItem data
  const rawReps = await prisma.peerReviewItem.findMany({
    where:  { repName: { not: null } },
    select: {
      repName:  true,
      repEmail: true,
      project: {
        select: {
          id: true, name: true, projectNumber: true,
          client: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Deduplicate by repName, collect all projects they appear on
  const repMap = new Map();
  for (const item of rawReps) {
    if (!item.repName) continue;
    const key = item.repName.trim().toLowerCase();
    if (!repMap.has(key)) {
      repMap.set(key, {
        name:     item.repName.trim(),
        email:    item.repEmail || null,
        projects: new Map(),
      });
    }
    const rep = repMap.get(key);
    // Deduplicate projects by ID
    if (item.project && !rep.projects.has(item.project.id)) {
      rep.projects.set(item.project.id, item.project);
    }
    // Use first found email if not set
    if (!rep.email && item.repEmail) rep.email = item.repEmail;
  }

  const reps = [...repMap.values()]
    .map(r => ({
      ...r,
      projects: [...r.projects.values()],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return <SalesRepsClient reps={reps} currentUser={{ id: user.id, name: user.name, role: user.role }} />;
}
