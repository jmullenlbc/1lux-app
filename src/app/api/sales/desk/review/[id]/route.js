import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decideReview } from '@/lib/intake/webReviews';

export const dynamic = 'force-dynamic';

// POST { answer: 'same' | 'different' }: answer a "Same person? Same company?
// Same job?" question on My Desk (0117).
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const out = await decideReview(prisma, params.id, body?.answer, user);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out);
}
