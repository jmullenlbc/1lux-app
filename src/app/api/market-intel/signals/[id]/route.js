import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const data = {};

  if (body.reviewStatus !== undefined)  data.reviewStatus  = body.reviewStatus;
  if (body.matchStatus  !== undefined)  data.matchStatus   = body.matchStatus;
  if ('linkedClientId'  in body) {
    data.linkedClientId = body.linkedClientId || null;
    if (body.linkedClientId) data.matchStatus = 'CONFIRMED';
  }

  const signal = await prisma.marketSignal.update({
    where: { id: params.id },
    data,
    include: {
      source:       { select: { name: true } },
      linkedClient: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(signal);
}
