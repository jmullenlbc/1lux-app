import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { findStaleProjects, generateFollowUpDraft, hasDraftNote } from '@/lib/bot/followUpDrafter';
import { modelFor } from '@/lib/aiModels';

function verifyCronSecret(req) {
  return req.headers.get('x-cron-secret') === process.env.CRON_SECRET;
}

// POST /api/bot/check-followup
// Called daily by cron (Upstash QStash). Also callable by ILC admins directly.
export async function POST(req) {
  const isCron = verifyCronSecret(req);

  if (!isCron) {
    const { user, error } = await requireAuth();
    if (error) return error;
    if (!actsAsAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const log = { checked: 0, stale: 0, drafted: 0, skipped: 0, errors: [] };

  try {
    // Active staleness rules (PROJECT_STALE; legacy DEAL_STALE still honored)
    const rules = await prisma.botRule.findMany({
      where: { isActive: true, triggerType: { in: ['PROJECT_STALE', 'DEAL_STALE'] } },
    });

    if (!rules.length) {
      return NextResponse.json({ ok: true, log: { ...log, message: 'No active staleness rules configured' } });
    }

    const staleProjects = await findStaleProjects(rules);
    log.checked = staleProjects.length;
    log.stale   = staleProjects.length;

    for (const { project, rule, daysSinceActivity } of staleProjects) {
      try {
        // Skip if a contact still has an unpublished (draft) Sales Note — human is mid-note.
        const contactIds = (project.client?.contacts || []).map(c => c.id).filter(Boolean);
        if (await hasDraftNote(contactIds)) {
          log.skipped++;
          log.errors.push({ project: project.name, reason: 'Contact has unpublished Sales Note — waiting for human to publish' });
          continue;
        }

        const result = await generateFollowUpDraft(project, rule);
        if (result.error) {
          log.skipped++;
          log.errors.push({ project: project.name, reason: result.error });
          continue;
        }

        let actionConfig = {};
        try { actionConfig = JSON.parse(rule.actionConfig); } catch {}
        const reviewWindowMinutes = actionConfig.reviewWindowMinutes ?? -1;

        const recipientUserId = project.salesOwner?.id;
        if (!recipientUserId) {
          log.skipped++;
          log.errors.push({ project: project.name, reason: 'No Sales Owner assigned — cannot route draft' });
          continue;
        }

        await prisma.botDraft.create({
          data: {
            userId:              recipientUserId,
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
            classificationReason: `Project stale ${daysSinceActivity}d — rule: ${rule.name}`,
          },
        });

        await prisma.userAlert.create({
          data: {
            userId:    recipientUserId,
            type:      'BOT_DRAFT_READY',
            title:     `Follow-up draft ready — ${project.name}`,
            message:   `Bot drafted a follow-up to ${result.toName || result.toEmail} (project stale ${daysSinceActivity} days)`,
            link:      `/sales/bot-queue?tab=follow-ups`,
            dedupeKey: `bot-draft-${project.id}-${new Date().toISOString().slice(0, 10)}`,
          },
        }).catch(() => {});

        log.drafted++;
      } catch (e) {
        log.errors.push({ project: project.name, reason: e.message });
      }
    }

    return NextResponse.json({ ok: true, log });
  } catch (e) {
    console.error('[check-followup] Fatal error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
