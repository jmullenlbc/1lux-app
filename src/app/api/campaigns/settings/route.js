import { NextResponse } from 'next/server';
import { isSalesAdmin } from '@/lib/auth';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { getFooterAddress, setFooterAddress } from '@/lib/campaigns/render';
import { senderStatus, fromAddress } from '@/lib/campaigns/sender';

// GET /api/campaigns/settings  Footer address and sending service status.
export async function GET() {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  return NextResponse.json({ footerAddress: await getFooterAddress(), sender: { ...senderStatus(), from: fromAddress() }, canEdit: isSalesAdmin(user) });
}

// PATCH /api/campaigns/settings { footerAddress }  Sales admins only.
export async function PATCH(request) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  if (!isSalesAdmin(user)) return badRequest('Only a sales admin can change the footer address. Nothing changed. (CAMPAIGN_SETTINGS_ROLE)', 403);
  const body = await request.json().catch(() => ({}));
  await setFooterAddress(body.footerAddress, user.id);
  return NextResponse.json({ footerAddress: await getFooterAddress() });
}
