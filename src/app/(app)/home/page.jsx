export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { prisma }      from '@/lib/db';
import { redirect }    from 'next/navigation';
import HomeClient      from './HomeClient';

export const metadata = { title: 'Home — ILC Studios' };

// Safe runner: returns value on success, fallback on any error (logs to CloudWatch)
async function safe(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[/home] ${label} failed:`, err?.message ?? err);
    return fallback;
  }
}

export default async function HomePage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const isAdmin      = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(user.role);
  const projectWhere = isAdmin ? {} : { createdById: user.id };
  const now          = new Date();
  const yearStart    = new Date(now.getFullYear(), 0, 1);
  const in7days      = new Date(now.getTime() + 7 * 86_400_000);

  // Load the user's saved dashboard config
  const userRow = await safe('userRow', () =>
    prisma.user.findUnique({ where: { id: user.id }, select: { dashboardConfig: true } }),
    null,
  );

  // Fetch all widget data in parallel — each query is independently safe-wrapped
  const [
    projectCount,
    recentProjects,
    clientCount,
    recentClients,
    manufacturerCount,
    productCount,
    openDeals,
    recentOpenDeals,
    wonThisYear,
    upcomingActions,
    pipelineDeals,
    salesReps,
  ] = await Promise.all([

    safe('projectCount', () =>
      prisma.project.count({ where: projectWhere }), 0),

    safe('recentProjects', () =>
      prisma.project.findMany({
        where: projectWhere, take: 6, orderBy: { updatedAt: 'desc' },
        select: {
          id: true, projectNumber: true, name: true,
          phase: true, serviceType: true, status: true,
          city: true, state: true, updatedAt: true,
          client: { select: { id: true, name: true } },
        },
      }), []),

    safe('clientCount', () => prisma.client.count(), 0),

    safe('recentClients', () =>
      prisma.client.findMany({
        take: 6, orderBy: { updatedAt: 'desc' },
        select: {
          id: true, clientNumber: true, name: true, type: true,
          city: true, state: true, updatedAt: true,
          _count: { select: { projects: true } },
        },
      }), []),

    safe('manufacturerCount', () => prisma.manufacturer.count(), 0),

    safe('productCount', () => prisma.manufacturerProduct.count(), 0),

    // Total open deal count
    safe('openDeals', () =>
      prisma.deal.count({ where: { dealStatus: 'OPEN' } }), 0),

    // Recent open deals for pipeline widget
    safe('recentOpenDeals', () =>
      prisma.deal.findMany({
        where: { dealStatus: 'OPEN' }, take: 5, orderBy: { updatedAt: 'desc' },
        select: {
          id: true, dealNumber: true, title: true,
          pipeline: true, stage: true, totalRevenue: true, probability: true,
          client: { select: { id: true, name: true } },
          updatedAt: true,
        },
      }), []),

    // Won deals this calendar year
    safe('wonThisYear', () =>
      prisma.deal.findMany({
        where: { dealStatus: 'WON', wonAt: { gte: yearStart } },
        select: {
          id: true, dealNumber: true, title: true,
          pipeline: true, totalRevenue: true, wonAt: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: { wonAt: 'desc' },
      }), []),

    // Deals with action due in the next 7 days OR overdue
    // Use AND array — combining `not: null` with `lte` in a single object is unreliable on PostgreSQL
    safe('upcomingActions', () =>
      prisma.deal.findMany({
        where: {
          dealStatus: 'OPEN',
          AND: [
            { nextActionDue: { not: null } },
            { nextActionDue: { lte: in7days } },
          ],
        },
        orderBy: { nextActionDue: 'asc' },
        take: 10,
        select: {
          id: true, dealNumber: true, title: true,
          nextActionText: true, nextActionDue: true,
          pipeline: true,
          client: { select: { id: true, name: true } },
          owner:  { select: { id: true, name: true } },
        },
      }), []),

    // All open deals for pipeline calculations
    safe('pipelineDeals', () =>
      prisma.deal.findMany({
        where: { dealStatus: 'OPEN' },
        select: { totalRevenue: true, probability: true, pipeline: true, stage: true },
      }), []),

    // Unique sales reps — orderBy required for DISTINCT ON in PostgreSQL
    safe('salesReps', () =>
      prisma.peerReviewItem.findMany({
        where:    { repName: { not: null } },
        select:   { repName: true, repEmail: true },
        distinct: ['repName'],
        orderBy:  { repName: 'asc' },
      }), []),
  ]);

  // Derived aggregates
  const pipelineValue    = pipelineDeals.reduce((s, d) => s + (d.totalRevenue || 0), 0);
  const weightedPipeline = pipelineDeals.reduce((s, d) => s + ((d.totalRevenue || 0) * (d.probability || 50) / 100), 0);
  const wonValue         = wonThisYear.reduce((s, d) => s + (d.totalRevenue || 0), 0);

  // Pipeline by stage breakdown
  const stageMap = {};
  for (const d of pipelineDeals) {
    if (!stageMap[d.stage]) stageMap[d.stage] = { count: 0, value: 0, pipeline: d.pipeline };
    stageMap[d.stage].count++;
    stageMap[d.stage].value += d.totalRevenue || 0;
  }
  const pipelineByStage = Object.entries(stageMap)
    .map(([stage, v]) => ({ stage, ...v }))
    .sort((a, b) => b.value - a.value);

  return (
    <HomeClient
      initialConfig={userRow?.dashboardConfig || null}
      user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
      stats={{
        projects:     { total: projectCount,   recent: recentProjects },
        clients:      { total: clientCount,    recent: recentClients  },
        manufacturers:{ total: manufacturerCount                       },
        products:     { total: productCount                            },
        deals: {
          open:            openDeals,
          recent:          recentOpenDeals,
          pipeline:        pipelineValue,
          weighted:        weightedPipeline,
          wonThisYear:     wonThisYear,
          wonValue:        wonValue,
          upcomingActions: upcomingActions,
          byStage:         pipelineByStage,
        },
        salesReps: { total: salesReps.filter(r => r.repName).length },
      }}
    />
  );
}
