import { notFound, redirect } from 'next/navigation';
import { getSession, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { teamMemberWhere, PROJECT_TEAM_ID_FIELDS } from '@/lib/projectTeam';
import ClientDetailClient from './ClientDetailClient';
import ArchivedBanner from '@/components/ArchivedBanner';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const sessionPerms = (() => { try { return JSON.parse(session.permissions || '{}'); } catch { return {}; } })();
  const canEditStandards = session.role === 'ILC_ADMIN' || session.role === 'SUPER_ADMIN' || sessionPerms.clientStandards === true;
  const canEditPlaybook  = session.role === 'ILC_ADMIN' || session.role === 'SUPER_ADMIN' || sessionPerms.clients === true;

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      projects: {
        where: { archivedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, projectNumber: true, name: true, location: true, city: true, state: true,
          buildingType: true, phase: true, budgetType: true, serviceType: true,
          status: true, createdAt: true, updatedAt: true,
        },
      },
      // The jobs each person is attached to. Without these the Open / Won / Lost
      // / Abandoned numbers beside a person were always blank on this screen —
      // there was nothing to count. Mike, 2026-09-09, wants those numbers to
      // open the list of jobs behind them without leaving the page.
      contacts: {
        where: { archivedAt: null },
        orderBy: { createdAt: 'asc' },
        include: {
          projectLinks: {
            where: { project: { archivedAt: null } },
            select: {
              id: true, isLead: true,
              project: {
                select: {
                  id: true, name: true, projectNumber: true, serviceType: true,
                  procurementStatus: true, designStatus: true,
                },
              },
            },
          },
        },
      },
      createdBy: { select: { name: true, email: true } },
      owner:     { select: { id: true, name: true, email: true } },
      archivedBy: { select: { name: true, email: true } },
    },
  });

  if (!client) notFound();
  if (!canSeeAllData(session) && client.createdById !== session.id) notFound();

  const standardsAnswers = (canEditStandards && prisma.clientStandardsAnswer)
    ? await prisma.clientStandardsAnswer.findMany({ where: { clientId: params.id }, orderBy: { question_key: 'asc' } })
    : [];

  const unlinkableProjects = await prisma.project.findMany({
    where: {
      clientId: null,
      ...(canSeeAllData(session) ? {} : { createdById: session.id }),
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, location: true, buildingType: true },
  });

  // Jobs this company sits on the TEAM of, but did not bring us themselves.
  // Maram, 2026-09-09: "CSI for example, they probably won't be bringing us a lot
  // of projects, but they might be connected to several others." Those are two
  // different lists and mixing them would make a busy engineering firm look like
  // a big client.
  const relatedProjects = await prisma.project.findMany({
    where: {
      AND: [
        teamMemberWhere(params.id),
        { NOT: { clientId: params.id } },
        ...(canSeeAllData(session) ? [] : [{ createdById: session.id }]),
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, projectNumber: true, name: true, city: true, state: true,
      serviceType: true, phase: true, status: true,
      // The six seat columns, so the screen can say WHICH hat they wore here.
      ...Object.fromEntries(PROJECT_TEAM_ID_FIELDS.map(field => [field, true])),
      client: { select: { id: true, name: true } },
    },
  });

  return (
    <>
    {client.archivedAt && (
      <ArchivedBanner kind="client" id={client.id} archivedAt={client.archivedAt.toISOString()}
        archivedBy={client.archivedBy?.name || client.archivedBy?.email || null} />
    )}
    <ClientDetailClient
      client={client}
      relatedProjects={relatedProjects}
      availableProjects={unlinkableProjects}
      user={session}
      canEditStandards={canEditStandards}
      canEditPlaybook={canEditPlaybook}
      initialStandardsAnswers={standardsAnswers}
    />
    </>
  );
}
