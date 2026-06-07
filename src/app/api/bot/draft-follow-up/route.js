import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateFollowUpDraft, getLastActivityDate } from '@/lib/bot/followUpDrafter';

// POST /api/bot/draft-follow-up
// Manually generate a follow-up draft for a specific deal.
// Body: { dealId }
export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { dealId } = await req.json();
  if (!dealId) return NextResponse.json({ error: 'dealId required' }, { status: 400 });

  const deal = await prisma.deal.findUnique({
    where:   { id: dealId },
    include: {
      client:     { select: { id: true, name: true } },
      owner:      { select: { id: true, name: true, email: true } },
      contacts:   { take: 3, include: { contact: { select: { id: true, name: true, email: true, title: true } } } },
      activities: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  // Use a generic DEAL_STALE rule or create an ad-hoc one
  const rule = await prisma.botRule.findFirst({
    where: { isActive: true, triggerType: 'DEAL_STALE' },
  }) || { name: 'Manual', triggerConfig: '{}', actionConfig: '{"reviewWindowMinutes":-1}' };

  const lastActive        = getLastActivityDate(deal);
  const daysSinceActivity = Math.floor((Date.now() - lastActive.getTime()) / 86400000);
  const result = await generateFollowUpDraft(deal, rule);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  let actionConfig = {};
  try { actionConfig = JSON.parse(rule.actionConfig || '{}'); } catch {}
  const reviewWindowMinutes = actionConfig.reviewWindowMinutes ?? -1;

  const draft = await prisma.botDraft.create({
    data: {
      userId:              user.id,
      dealId:              deal.id,
      type:                'FOLLOW_UP',
      status:              'PENDING_REVIEW',
      toEmail:             result.toEmail,
      toName:              result.toName   || null,
      subject:             result.subject,
      body:                result.body,
      reviewWindowMinutes: reviewWindowMinutes,
      reviewExpiresAt:     reviewWindowMinutes > 0
        ? new Date(Date.now() + reviewWindowMinutes * 60 * 1000)
        : null,
      draftModel:          'claude-haiku-4-5',
      classificationReason: `Manual draft — ${daysSinceActivity}d stale`,
    },
    include: { deal: { select: { id: true, title: true, pipeline: true, stage: true } } },
  });

  return NextResponse.json({ ok: true, draft }, { status: 201 });
}
