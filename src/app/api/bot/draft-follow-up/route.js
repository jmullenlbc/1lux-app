import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateFollowUpDraft, getLastActivityDate } from '@/lib/bot/followUpDrafter';
import { modelFor } from '@/lib/aiModels';

// POST /api/bot/draft-follow-up
// Manually generate a follow-up draft for a specific project.
// Body: { projectId }  (dealId accepted as a legacy alias)
export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const projectId = body.projectId || body.dealId;
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const project = await prisma.project.findUnique({
    where:   { id: projectId },
    select: {
      id: true, name: true, serviceType: true, procurementStage: true, designStage: true, updatedAt: true,
      salesOwner: { select: { id: true, name: true, email: true } },
      client:     { select: { id: true, name: true, contacts: { take: 3, select: { id: true, name: true, email: true, title: true, preferredName: true } } } },
      activities: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const rule = await prisma.botRule.findFirst({
    where: { isActive: true, triggerType: { in: ['PROJECT_STALE', 'DEAL_STALE'] } },
  }) || { name: 'Manual', triggerConfig: '{}', actionConfig: '{"reviewWindowMinutes":-1}' };

  const daysSinceActivity = Math.floor((Date.now() - getLastActivityDate(project).getTime()) / 86400000);
  const result = await generateFollowUpDraft(project, rule);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  let actionConfig = {};
  try { actionConfig = JSON.parse(rule.actionConfig || '{}'); } catch {}
  const reviewWindowMinutes = actionConfig.reviewWindowMinutes ?? -1;

  const draft = await prisma.botDraft.create({
    data: {
      userId:              user.id,
      projectId:           project.id,
      type:                'FOLLOW_UP',
      status:              'PENDING_REVIEW',
      toEmail:             result.toEmail,
      toName:              result.toName || null,
      subject:             result.subject,
      body:                result.body,
      reviewWindowMinutes,
      reviewExpiresAt:     reviewWindowMinutes > 0 ? new Date(Date.now() + reviewWindowMinutes * 60 * 1000) : null,
      draftModel:          modelFor('bot.followUp'),
      classificationReason: `Manual draft — ${daysSinceActivity}d stale`,
    },
    include: { project: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ ok: true, draft }, { status: 201 });
}
