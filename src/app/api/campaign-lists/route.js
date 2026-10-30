import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { cleanText } from '@/lib/campaigns/staff';

// GET /api/campaign-lists?archived=1  Email lists (0147).
export async function GET(request) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const archived = new URL(request.url).searchParams.get('archived') === '1';
  const lists = await prisma.campaignList.findMany({
    where: { archivedAt: archived ? { not: null } : null },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { members: { where: { archivedAt: null } }, rules: { where: { archivedAt: null } }, campaigns: true } },
    },
    orderBy: { name: 'asc' },
    take: 500,
  });
  return NextResponse.json({ lists });
}

// POST /api/campaign-lists { name, kind: FIXED|FILTER, notes }
export async function POST(request) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const name = cleanText(body.name);
  if (!name) return badRequest('Give the list a name. Nothing was saved. (CAMPAIGN_LIST_NAME)');
  const kind = body.kind === 'FILTER' ? 'FILTER' : 'FIXED';
  const list = await prisma.campaignList.create({ data: { name, kind, notes: cleanText(body.notes, 1000), createdById: user.id } });
  return NextResponse.json({ list }, { status: 201 });
}
