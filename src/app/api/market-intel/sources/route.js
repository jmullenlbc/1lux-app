import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sources = await prisma.marketSource.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(sources);
}

export async function POST(request) {
  const session = await getSession();
  if (!session || (session.role !== 'ILC_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const source = await prisma.marketSource.create({
    data: {
      name:             body.name,
      feedUrl:          body.feedUrl,
      siteUrl:          body.siteUrl,
      projectTypes:     JSON.stringify(body.projectTypes || []),
      pollingFrequency: body.pollingFrequency || 'DAILY',
      notes:            body.notes || null,
    },
  });
  return NextResponse.json(source, { status: 201 });
}
