export const dynamic = 'force-dynamic';

import { requireIntakeReviewer, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import IntakeClient from './IntakeClient';

// Admins and the Sales team work this queue (2026-09-12). `?id=` opens one
// request straight away — the link in the Sales alert, the pipeline card and
// the Things Needing a Look card all use it.
export default async function IntakePage({ searchParams }) {
  const { user, error } = await requireIntakeReviewer(cookies());
  if (error) {
    return (
      <div className="p-10 text-center text-sm text-slate-500">
        Web budget requests are for admins and the Sales team.
      </div>
    );
  }

  const submissions = await prisma.conceptualSubmission.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      reviewedBy: { select: { name: true } },
      client: { select: { id: true, name: true } },
      duplicateMatch: { select: { id: true, name: true } },
      suggestedProject: { select: { id: true, name: true, city: true, state: true, zip: true } },
      answers: { orderBy: { createdAt: 'asc' } },
    },
  });

  const clients = await prisma.client.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, city: true, state: true },
    orderBy: { name: 'asc' },
  });

  const openId = typeof searchParams?.id === 'string' ? searchParams.id : null;

  return (
    <IntakeClient
      submissions={submissions}
      clients={clients}
      projects={projects}
      currentUser={user}
      canInvite={isAnyAdmin(user.role)}
      initialSelectedId={submissions.some(s => s.id === openId) ? openId : null}
    />
  );
}
