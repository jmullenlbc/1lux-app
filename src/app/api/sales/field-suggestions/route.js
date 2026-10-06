import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/sales/field-suggestions?status=PENDING
// "Email signatures say..." (0118): what a signature said that differs from
// the person's card. Newest first.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = new URL(request.url).searchParams.get('status') || 'PENDING';
  const rows = await prisma.contactFieldSuggestion.findMany({
    where:   { status },
    orderBy: { createdAt: 'desc' },
    take:    100,
    include: {
      contact:       { select: { id: true, name: true, clientId: true, client: { select: { name: true } } } },
      sourceMessage: { select: { id: true, subject: true, sentAt: true } },
    },
  });
  return NextResponse.json({ suggestions: rows });
}
