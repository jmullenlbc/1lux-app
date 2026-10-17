import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';

// POST, log a view when someone opens the standards share link
export async function POST(request, { params }) {
  const share = await prisma.clientStandardsShare.findUnique({ where: { token: params.token } });
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const headersList = headers();
  const ip        = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = headersList.get('user-agent') || '';

  let log = [];
  try {
    log = JSON.parse(share.viewLog || '[]');
  } catch {
    log = [];
  }
  log.push({ ip, userAgent: userAgent.slice(0, 120), at: new Date().toISOString() });

  await prisma.clientStandardsShare.update({
    where: { token: params.token },
    data: {
      viewCount:    { increment: 1 },
      lastViewedAt: new Date(),
      viewLog:      JSON.stringify(log.slice(-100)),
    },
  });

  return NextResponse.json({ ok: true });
}
