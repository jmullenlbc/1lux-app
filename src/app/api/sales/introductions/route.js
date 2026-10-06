import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/sales/introductions?status=NEW
// People we do not know who turned up on an email or an invite with someone
// we do know (0118). Newest first.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = new URL(request.url).searchParams.get('status') || 'NEW';
  const rows = await prisma.introduction.findMany({
    where:   { status, archivedAt: null },
    orderBy: { detectedAt: 'desc' },
    take:    100,
    include: {
      client:              { select: { id: true, name: true } },
      introducedContact:   { select: { id: true, name: true } },
      introducedByContact: { select: { id: true, name: true, client: { select: { name: true } } } },
      introducedByUser:    { select: { id: true, name: true } },
      sourceMessage:       { select: { id: true, subject: true, sentAt: true, fromName: true, fromEmail: true, projectId: true } },
    },
  });
  return NextResponse.json({ introductions: rows });
}
