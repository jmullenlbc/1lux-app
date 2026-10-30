import { sendByToken, recordOpen } from '@/lib/campaigns/tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// GET /api/e/o/[token]  Campaign open pixel (0147). Always answers with the picture.
export async function GET(request, { params }) {
  try {
    const send = await sendByToken(params.token);
    if (send) await recordOpen(send);
  } catch { /* a missed open is not worth a broken picture */ }
  return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' } });
}
