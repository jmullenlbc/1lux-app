export const dynamic = 'force-dynamic';

import { requireIntakeReviewer, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import IntakeClient from './IntakeClient';
import { loadFigureNorms, loadAdoptedGuesses } from '@/lib/calibration/figureNormsLoad';

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

  // Budgets started on the public page but never sent (migration 0087) — leads.
  // Finished ones carry a submissionId and put-away ones an archivedAt; this
  // model is not on the automatic archive filter, so both are excluded by hand.
  const drafts = await prisma.conceptualDraft.findMany({
    where: { submissionId: null, archivedAt: null },
    orderBy: { lastSavedAt: 'desc' },
    take: 200,
    select: {
      id: true, firstName: true, lastName: true, email: true, company: true, projectName: true,
      city: true, state: true, stepId: true, completedSteps: true, buildingType: true,
      unitCount: true, grossSf: true, haveDrawings: true, saveCount: true, lastSavedAt: true, createdAt: true,
    },
  });

  // What our real jobs say each figure runs, by building type — the review
  // flags warn when a request is far off it — plus adopted stand-ins. Never fatal.
  const [norms, adopted] = await Promise.all([loadFigureNorms(), loadAdoptedGuesses()]);

  const openId = typeof searchParams?.id === 'string' ? searchParams.id : null;

  return (
    <IntakeClient
      submissions={submissions}
      drafts={drafts}
      clients={clients}
      projects={projects}
      currentUser={user}
      canInvite={actsAsAdmin(user)}
      figureNorms={norms}
      adoptedGuesses={adopted}
      initialSelectedId={submissions.some(s => s.id === openId) ? openId : null}
    />
  );
}
