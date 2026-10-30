import { NextResponse } from 'next/server';
import { requireSalesDocsUser } from '@/lib/salesDocs/access';
import { activeBlocks } from '@/lib/campaigns/send';
import { renderEmail, getFooterAddress, appBaseUrl } from '@/lib/campaigns/render';
import { loadCampaign, notFound } from '@/lib/campaigns/staff';

// GET /api/campaigns/[id]/preview?firstName=  The email as one sample person sees it.
// Links in the preview do not count as clicks (the token is not a real send).
export async function GET(request, { params }) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const campaign = await loadCampaign(params.id);
  if (!campaign) return notFound('campaign', 'CAMPAIGN_NOT_FOUND');
  const q = new URL(request.url).searchParams;
  const email = renderEmail({
    campaign,
    blocks: await activeBlocks(campaign.id),
    baseUrl: appBaseUrl(request),
    person: { token: 'preview', email: user.email, firstName: q.get('firstName') || 'Alex' },
    address: (await getFooterAddress()) || '[Mailing address goes here]',
  });
  return NextResponse.json({ subject: email.subject, html: email.html, text: email.text });
}
