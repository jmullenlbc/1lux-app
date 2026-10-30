import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { BLOCK_KINDS } from '@/lib/campaigns/render';
import { activeBlocks } from '@/lib/campaigns/send';
import { loadCampaign, notFound, cleanText } from '@/lib/campaigns/staff';

const MAX_BLOCKS = 40;

// PUT /api/campaigns/[id]/blocks { blocks: [{ id?, kind, text, url, salesDocId, spaceId }] }
// The whole email body in order. Blocks left out are archived, never deleted.
export async function PUT(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const campaign = await loadCampaign(params.id);
  if (!campaign) return notFound('campaign', 'CAMPAIGN_NOT_FOUND');
  if (campaign.status !== 'DRAFT') return badRequest('This campaign was already sent, so its email is locked. Nothing changed. (CAMPAIGN_LOCKED)', 409);
  const body = await request.json().catch(() => ({}));
  const incoming = Array.isArray(body.blocks) ? body.blocks : null;
  if (!incoming) return badRequest('The email body did not come through. Nothing changed. Reload and try again. (CAMPAIGN_BLOCKS)');
  if (incoming.length > MAX_BLOCKS) return badRequest(`An email can hold up to ${MAX_BLOCKS} pieces. Nothing changed. (CAMPAIGN_BLOCKS_MAX)`);
  if (incoming.some((b) => !BLOCK_KINDS.includes(b?.kind))) return badRequest('One piece of the email is a kind we do not know. Nothing changed. (CAMPAIGN_BLOCK_KIND)');

  const existing = await prisma.campaignBlock.findMany({ where: { campaignId: campaign.id, archivedAt: null }, select: { id: true } });
  const mine = new Set(existing.map((b) => b.id));
  const kept = new Set();
  await prisma.$transaction(async (tx) => {
    for (const [i, b] of incoming.entries()) {
      const data = {
        sortOrder: i,
        kind: b.kind,
        text: cleanText(b.text, 5000),
        url: cleanText(b.url, 1000),
        salesDocId: b.kind === 'DOC' && b.salesDocId ? String(b.salesDocId) : null,
        spaceId: b.kind === 'FOLDER' && b.spaceId ? String(b.spaceId) : null,
      };
      if (b.id && mine.has(b.id)) {
        await tx.campaignBlock.update({ where: { id: b.id }, data });
        kept.add(b.id);
      } else {
        await tx.campaignBlock.create({ data: { ...data, campaignId: campaign.id } });
      }
    }
    const gone = [...mine].filter((id) => !kept.has(id));
    if (gone.length) await tx.campaignBlock.updateMany({ where: { id: { in: gone } }, data: { archivedAt: new Date() } });
    await tx.campaign.update({ where: { id: campaign.id }, data: { updatedAt: new Date() } });
  });
  return NextResponse.json({ blocks: await activeBlocks(campaign.id) });
}
