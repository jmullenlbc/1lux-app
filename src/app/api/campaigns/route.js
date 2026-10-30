import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { CAMPAIGN_INCLUDE, cleanText } from '@/lib/campaigns/staff';

// GET /api/campaigns?archived=1  Email campaigns (0147) with send counts.
export async function GET(request) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const archived = new URL(request.url).searchParams.get('archived') === '1';
  const rows = await prisma.campaign.findMany({
    where: { archivedAt: archived ? { not: null } : null },
    include: CAMPAIGN_INCLUDE,
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });
  const ids = rows.map((r) => r.id);
  const [byStatus, opened, clicked] = ids.length ? await Promise.all([
    prisma.campaignSend.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: ids } }, _count: { _all: true } }),
    prisma.campaignSend.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, openedAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignSend.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, firstClickAt: { not: null } }, _count: { _all: true } }),
  ]) : [[], [], []];
  const tally = (list, id) => list.find((x) => x.campaignId === id)?._count._all || 0;
  const campaigns = rows.map((c) => {
    const counts = {};
    for (const s of byStatus.filter((x) => x.campaignId === c.id)) counts[s.status] = s._count._all;
    return { ...c, counts: { ...counts, opened: tally(opened, c.id), clicked: tally(clicked, c.id) } };
  });
  return NextResponse.json({ campaigns });
}

// POST /api/campaigns { name }
export async function POST(request) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const name = cleanText(body.name);
  if (!name) return badRequest('Give the campaign a name. Nothing was saved. (CAMPAIGN_NAME)');
  const campaign = await prisma.campaign.create({ data: { name, createdById: user.id }, include: CAMPAIGN_INCLUDE });
  return NextResponse.json({ campaign }, { status: 201 });
}
