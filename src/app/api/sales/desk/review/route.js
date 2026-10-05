import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { pendingReviews } from '@/lib/intake/webReviews';

export const dynamic = 'force-dynamic';

// GET ?clientId=X  the open look-alike questions about one company and its people
// GET ?kind=contact  every open "Same person?" (the Contacts list)
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const q = new URL(request.url).searchParams;
  const clientId = q.get('clientId');
  const kind = q.get('kind');
  const where = {};
  if (clientId) where.OR = [{ existingClientId: clientId }, { existingContact: { clientId } }];
  if (kind) where.kind = kind;
  const reviews = await pendingReviews(prisma, where);
  return NextResponse.json({ reviews });
}
