import { NextResponse } from 'next/server';
import { sendByToken, unsubscribe } from '@/lib/campaigns/tracking';

export const runtime = 'nodejs';

// POST /api/e/u/[token]  Unsubscribe (0147). The button on /e/u/[token], and
// Gmail and Yahoo's one-click unsubscribe (List-Unsubscribe-Post), both land here.
export async function POST(request, { params }) {
  const send = await sendByToken(params.token);
  if (!send) return NextResponse.json({ error: 'This unsubscribe link is not one of ours, or it was cut short. Reply to the email and ask to be removed, and we will do it by hand. (CAMPAIGN_UNSUB_TOKEN)' }, { status: 404 });
  await unsubscribe(send);
  return NextResponse.json({ ok: true, email: send.email });
}
