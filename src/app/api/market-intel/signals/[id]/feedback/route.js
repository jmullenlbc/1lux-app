import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cleanFeedback, featuresOf, REASONS } from '@/lib/market-intel/feedbackRules';
import { refreshProposedRules } from '@/lib/market-intel/feedbackStore';

// "Not relevant" on a signal (migration 0130, Mike 10-9). One row per press
// with the reason and the row's features, so the system can learn which
// source, case type, company, city or zone keeps getting dismissed. The row is
// marked DISMISSED the same as before; the learning is on top.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const fb = cleanFeedback(body);
  if (!fb) {
    return NextResponse.json({ error: `Pick a reason (${REASONS.map(r => r.label).join(', ')}). "Other" needs one sentence.` }, { status: 400 });
  }

  const signal = await prisma.marketSignal.findUnique({
    where:   { id: params.id },
    include: { tags: { select: { role: true, tag: { select: { kind: true, normalized: true } } } } },
  });
  if (!signal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const f = featuresOf(signal);
  await prisma.$transaction([
    prisma.signalFeedback.create({ data: { signalId: signal.id, userId: user.id, reasonCode: fb.reasonCode, reasonText: fb.reasonText, ...f } }),
    prisma.marketSignal.update({ where: { id: signal.id }, data: { reviewStatus: 'DISMISSED' } }),
  ]);

  const proposed = await refreshProposedRules().catch(() => null);
  return NextResponse.json({ ok: true, proposed });
}
