import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { findStaleDeals, generateFollowUpDraft, hasDraftNote } from '@/lib/bot/followUpDrafter';

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
    if (!['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const log = { checked: 0, stale: 0, drafted: 0, skipped: 0, errors: [] };

  try {
    // Load all active DEAL_STALE BotRules
    const rules = await prisma.botRule.findMany({
      where: { isActive: true, triggerType: 'DEAL_STALE' },
    });

    if (!rules.length) {
      return NextResponse.json({ ok: true, log: { ...log, message: 'No active DEAL_STALE rules configured' } });
    }

    // Find stale deals matching the rules
    const staleDeals = await findStaleDeals(rules);
    log.checked = staleDeals.length;
    log.stale   = staleDeals.length;

    // Generate a draft for each stale deal
    for (const { deal, rule, daysSinceActivity } of staleDeals) {
      try {
        // Skip if any contact on this deal has an unpublished (draft) Sales Note
        // — the human is still filling in details, don't automate yet
        const contactIds = deal.contacts?.map(dc => dc.contactId || dc.contact?.id).filter(Boolean);
        const draftPending = await hasDraftNote(contactIds);
        if (draftPending) {
          log.skipped++;
          log.errors.push({ deal: deal.title, reason: 'Contact has unpublished Sales Note — waiting for human to publish' });
          continue;
        }

        const result = await generateFollowUpDraft(deal, rule);

        if (result.error) {
          log.skipped++;
          log.errors.push({ deal: deal.title, reason: result.error });
          continue;
        }

        // Review window from rule's actionConfig (default: always manual = -1)
        let actionConfig = {};
        try { actionConfig = JSON.parse(rule.actionConfig); } catch {}
        const reviewWindowMinutes = actionConfig.reviewWindowMinutes ?? -1;

        // Recipient = deal owner or creator
        const recipientUserId = deal.ownerId || deal.createdById;

        // Create BotDraft
        await prisma.botDraft.create({
          data: {
            userId:              recipientUserId,
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
            classificationReason: `Deal stale ${daysSinceActivity}d — rule: ${rule.name}`,
          },
        });

        // Alert the deal owner
        await prisma.userAlert.create({
          data: {
            userId:    recipientUserId,
            type:      'BOT_DRAFT_READY',
            title:     `Follow-up draft ready — ${deal.title}`,
            message:   `Bot drafted a follow-up to ${result.toName || result.toEmail} (deal stale ${daysSinceActivity} days)`,
            link:      `/sales/bot-queue?tab=follow-ups`,
            dedupeKey: `bot-draft-${deal.id}-${new Date().toISOString().slice(0, 10)}`,
          },
        }).catch(() => {});

        log.drafted++;
      } catch (e) {
        log.errors.push({ deal: deal.title, reason: e.message });
      }
    }

    return NextResponse.json({ ok: true, log });
  } catch (e) {
    console.error('[check-followup] Fatal error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
