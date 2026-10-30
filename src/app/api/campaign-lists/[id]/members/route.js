import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { readBulkIds } from '@/lib/bulkEdit';
import { loadList, notFound } from '@/lib/campaigns/staff';

// POST /api/campaign-lists/[id]/members { ids: [contactId], remove: true|false }
// Adds people to a picked list, or takes them off (archived, never deleted).
export async function POST(request, { params }) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const list = await loadList(params.id);
  if (!list || list.archivedAt) return notFound('list', 'CAMPAIGN_LIST_NOT_FOUND');
  if (list.kind !== 'FIXED') return badRequest('This list picks people by its rules, so people cannot be added by hand. Nothing changed. (CAMPAIGN_LIST_FILTER)', 409);
  const body = await request.json().catch(() => ({}));
  const read = readBulkIds(body, 'person', 'CAMPAIGN_LIST_MEMBERS');
  if (read.error) return read.error;
  const ids = read.ids;

  if (body.remove) {
    const res = await prisma.campaignListMember.updateMany({ where: { listId: list.id, contactId: { in: ids }, archivedAt: null }, data: { archivedAt: new Date() } });
    return NextResponse.json({ removed: res.count });
  }
  const found = await prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true } });
  let added = 0;
  for (const { id } of found) {
    await prisma.campaignListMember.upsert({
      where: { listId_contactId: { listId: list.id, contactId: id } },
      create: { listId: list.id, contactId: id, addedById: user.id },
      update: { archivedAt: null },
    });
    added += 1;
  }
  return NextResponse.json({ added, notFound: ids.length - found.length });
}
