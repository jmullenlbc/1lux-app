import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { resolveAudience, RULE_FIELDS } from '@/lib/campaigns/audience';
import { loadList, notFound, cleanText, archivePatch } from '@/lib/campaigns/staff';

const MAX_RULES = 200;

// GET /api/campaign-lists/[id]  The list, its rules or picked people, and who it reaches.
export async function GET(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const list = await loadList(params.id);
  if (!list) return notFound('list', 'CAMPAIGN_LIST_NOT_FOUND');
  const [audience, members] = await Promise.all([
    resolveAudience(list),
    list.kind === 'FIXED' ? prisma.campaignListMember.findMany({
      where: { listId: list.id, archivedAt: null },
      include: { contact: { select: { id: true, name: true, email: true, archivedAt: true, client: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'asc' },
    }) : [],
  ]);
  const blocked = new Set(audience.skipped.map((s) => s.email));
  return NextResponse.json({
    list,
    members,
    counts: audience.counts,
    // Enough to check the rules look right, not the whole list.
    sample: [...audience.recipients.slice(0, 50), ...audience.skipped.slice(0, 20)].map((r) => ({ ...r, suppressed: blocked.has(r.email) })),
  });
}

// PATCH /api/campaign-lists/[id] { name, notes, kind, rules: [{ field, value }], archived }
// rules replaces the whole set; the old ones are archived.
export async function PATCH(request, { params }) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const list = await loadList(params.id);
  if (!list) return notFound('list', 'CAMPAIGN_LIST_NOT_FOUND');
  const body = await request.json().catch(() => ({}));
  const data = {};
  if ('name' in body) {
    data.name = cleanText(body.name);
    if (!data.name) return badRequest('A list needs a name. Nothing changed. (CAMPAIGN_LIST_NAME)');
  }
  if ('notes' in body) data.notes = cleanText(body.notes, 1000);
  if ('kind' in body) data.kind = body.kind === 'FILTER' ? 'FILTER' : 'FIXED';
  if ('archived' in body) Object.assign(data, archivePatch(!!body.archived, user));

  let rules = null;
  if ('rules' in body) {
    if (!Array.isArray(body.rules) || body.rules.length > MAX_RULES) return badRequest(`A list can hold up to ${MAX_RULES} rules. Nothing changed. (CAMPAIGN_LIST_RULES)`);
    rules = body.rules
      .map((r) => ({ field: String(r?.field || ''), value: String(r?.value || '').trim().slice(0, 200) }))
      .filter((r) => RULE_FIELDS[r.field] && r.value);
  }
  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.campaignList.update({ where: { id: list.id }, data });
    if (rules) {
      await tx.campaignListRule.updateMany({ where: { listId: list.id, archivedAt: null }, data: { archivedAt: new Date() } });
      if (rules.length) await tx.campaignListRule.createMany({ data: rules.map((r) => ({ ...r, listId: list.id })) });
    }
  });
  return NextResponse.json({ list: await loadList(list.id) });
}
