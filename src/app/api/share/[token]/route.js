import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';

// POST — log a view event when someone opens the share link
export async function POST(request, { params }) {
  const share = await prisma.projectShare.findUnique({ where: { token: params.token } });
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const headersList = headers();
  const ip        = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = headersList.get('user-agent') || '';

  const log = JSON.parse(share.viewLog || '[]');
  log.push({ ip, userAgent: userAgent.slice(0, 120), at: new Date().toISOString() });

  await prisma.projectShare.update({
    where: { token: params.token },
    data: {
      viewCount:    { increment: 1 },
      lastViewedAt: new Date(),
      viewLog:      JSON.stringify(log.slice(-100)), // keep last 100 views
    },
  });

  return NextResponse.json({ ok: true });
}
