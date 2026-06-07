import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const proposal = await prisma.proposal.findUnique({ where: { id: params.id } });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (proposal.status === 'ACCEPTED' || proposal.status === 'DECLINED') {
    return NextResponse.json({ error: 'Cannot decline an accepted or already-declined proposal' }, { status: 409 });
  }

  const updated = await prisma.proposal.update({
    where: { id: params.id },
    data: { status: 'DECLINED', declinedAt: new Date() },
    include: {
      lineItems: { orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] },
      sends:     { include: { sentBy: { select: { id: true, name: true } } }, orderBy: { sentAt: 'desc' } },
    },
  });

  return NextResponse.json(updated);
}
