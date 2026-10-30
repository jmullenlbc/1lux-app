import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ipHashOf } from '@/lib/salesDocs/share';
import { sendByToken, recordClick } from '@/lib/campaigns/tracking';
import { isWebUrl, appBaseUrl } from '@/lib/campaigns/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const gone = () => new Response('This link no longer works. Reply to the email and we will send it again.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

// GET /api/e/c/[token]/[blockId]  Campaign click (0147). The address comes
// from the saved block, never from the URL, so this cannot be used to send
// people somewhere else.
export async function GET(request, { params }) {
  const send = await sendByToken(params.token);
  if (!send) return gone();
  const block = await prisma.campaignBlock.findFirst({ where: { id: String(params.blockId || ''), campaignId: send.campaignId } });
  if (!block) return gone();

  let target = null;
  if (block.kind === 'BUTTON' && isWebUrl(block.url)) target = block.url.trim();
  if (block.kind === 'DOC' || block.kind === 'FOLDER') {
    const link = await prisma.salesDocLink.findFirst({
      where: { campaignSendId: send.id, revokedAt: null, ...(block.kind === 'DOC' ? { docId: block.salesDocId } : { spaceId: block.spaceId }) },
      select: { token: true },
    });
    if (link) target = `${appBaseUrl(request)}/share/docs/${link.token}`;
  }
  if (!target) return gone();
  await recordClick(send, block.id, ipHashOf(request)).catch(() => {});
  return NextResponse.redirect(target, 302);
}
