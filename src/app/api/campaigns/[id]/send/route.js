import { NextResponse } from 'next/server';
import { isSalesAdmin } from '@/lib/auth';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { prepareSends, sendBatch } from '@/lib/campaigns/send';
import { appBaseUrl } from '@/lib/campaigns/render';
import { loadCampaign, notFound } from '@/lib/campaigns/staff';

export const runtime = 'nodejs';

// POST /api/campaigns/[id]/send  Sales admins only. The first press locks the
// campaign and queues everyone; every press after sends the next batch. The
// screen keeps pressing until done is true.
export async function POST(request, { params }) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  if (!isSalesAdmin(user)) return badRequest('Only a sales admin can send a campaign. Your campaign is saved. Ask a sales admin to press Send. (CAMPAIGN_SEND_ROLE)', 403);
  const campaign = await loadCampaign(params.id);
  if (!campaign || campaign.archivedAt) return notFound('campaign', 'CAMPAIGN_NOT_FOUND');

  let prepared = null;
  if (campaign.status === 'DRAFT') {
    prepared = await prepareSends(campaign.id, user);
    if (prepared.error) return NextResponse.json({ error: prepared.error, problems: prepared.problems || [] }, { status: prepared.status });
  }
  const batch = await sendBatch(campaign.id, appBaseUrl(request));
  if (batch.error) return badRequest(batch.error, batch.status);
  return NextResponse.json({ ...batch, queued: prepared?.queued, skippedAtStart: prepared?.skipped });
}
