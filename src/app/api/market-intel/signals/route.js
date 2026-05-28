import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectType  = searchParams.get('projectType');
  const signalType   = searchParams.get('signalType');
  const reviewStatus = searchParams.get('reviewStatus');
  const clientId     = searchParams.get('clientId');
  const page         = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit        = 50;

  const where = {};
  if (projectType)  where.projectType  = projectType;
  if (signalType)   where.signalType   = signalType;
  if (reviewStatus) where.reviewStatus = reviewStatus;
  if (clientId)     where.linkedClientId = clientId;

  const [signals, total] = await Promise.all([
    prisma.marketSignal.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        source:       { select: { name: true, siteUrl: true } },
        linkedClient: { select: { id: true, name: true } },
      },
    }),
    prisma.marketSignal.count({ where }),
  ]);

  return NextResponse.json({ signals, total, page, limit });
}
