import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/**
 * GET /api/notifications/opened/[token]
 * Read-receipt pixel, called when email client loads the tracking image.
 * Records first-open timestamp on the NotificationLog record.
 * Returns a 1×1 transparent GIF (always, regardless of token validity).
 */
export async function GET(req, { params }) {
  try {
    const log = await prisma.notificationLog.findUnique({
      where: { openToken: params.token },
    });
    if (log && !log.openedAt) {
      await prisma.notificationLog.update({
        where: { openToken: params.token },
        data:  { openedAt: new Date() },
      });
    }
  } catch {}

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type':  'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma':        'no-cache',
    },
  });
}
