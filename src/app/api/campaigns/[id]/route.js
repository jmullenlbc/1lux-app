import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isSalesAdmin } from '@/lib/auth';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { resolveAudience } from '@/lib/campaigns/audience';
import { activeBlocks, sendProblems } from '@/lib/campaigns/send';
import { senderStatus, fromAddress } from '@/lib/campaigns/sender';
import { getFooterAddress } from '@/lib/campaigns/render';
import { loadCampaign, notFound, cleanText, archivePatch, CAMPAIGN_INCLUDE } from '@/lib/campaigns/staff';

// GET /api/campaigns/[id]  The campaign, its blocks, who it reaches and what would stop a send.
export async function GET(request, { params }) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const campaign = await loadCampaign(params.id);
  if (!campaign) return notFound('campaign', 'CAMPAIGN_NOT_FOUND');
  const blocks = await activeBlocks(campaign.id);
  const [audience, problems, address] = await Promise.all([
    campaign.listId ? resolveAudience(campaign.listId) : null,
    campaign.status === 'DRAFT' ? sendProblems(campaign, blocks) : [],
    getFooterAddress(),
  ]);
  return NextResponse.json({
    campaign,
    blocks,
    audience: audience?.counts || null,
    problems,
    sender: { ...senderStatus(), from: fromAddress() },
    footerAddress: address,
    canSend: isSalesAdmin(user),
  });
}

// PATCH /api/campaigns/[id] { name, subject, previewText, listId, archived }
// Wording and list change only while DRAFT; archive or restore any time.
export async function PATCH(request, { params }) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const campaign = await loadCampaign(params.id);
  if (!campaign) return notFound('campaign', 'CAMPAIGN_NOT_FOUND');
  const body = await request.json().catch(() => ({}));
  const data = {};
  const edits = ['name', 'subject', 'previewText', 'listId'].filter((k) => k in body);
  if (edits.length && campaign.status !== 'DRAFT') {
    return badRequest('This campaign was already sent, so its wording and list are locked. Nothing changed. (CAMPAIGN_LOCKED)', 409);
  }
  if ('name' in body) {
    data.name = cleanText(body.name);
    if (!data.name) return badRequest('A campaign needs a name. Nothing changed. (CAMPAIGN_NAME)');
  }
  if ('subject' in body) data.subject = cleanText(body.subject, 200);
  if ('previewText' in body) data.previewText = cleanText(body.previewText, 200);
  if ('listId' in body) {
    data.listId = body.listId ? String(body.listId) : null;
    if (data.listId) {
      const list = await prisma.campaignList.findUnique({ where: { id: data.listId }, select: { archivedAt: true } });
      if (!list || list.archivedAt) return badRequest('That list was not found, or it was archived. Nothing changed. (CAMPAIGN_LIST_NOT_FOUND)', 404);
    }
  }
  if ('archived' in body) Object.assign(data, archivePatch(!!body.archived, user));
  const updated = await prisma.campaign.update({ where: { id: campaign.id }, data, include: CAMPAIGN_INCLUDE });
  return NextResponse.json({ campaign: updated });
}
