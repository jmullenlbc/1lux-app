/**
 * followUpDrafter.js
 * Core logic for Phase B — generates a follow-up email draft for a stale deal.
 * Called by /api/bot/check-followup (cron) and /api/bot/draft-follow-up (manual).
 */

import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function fmtDate(d) {
  if (!d) return 'unknown';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Get the most recent activity date for a deal (from DealActivity or deal.updatedAt)
export function getLastActivityDate(deal) {
  if (deal.activities?.length) {
    const sorted = [...deal.activities].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    return new Date(sorted[0].createdAt);
  }
  return new Date(deal.updatedAt);
}

// Check if any contact on this deal has an UNPUBLISHED (draft) SalesNote
// If yes — the human is still filling in the note. Don't automate yet.
export async function hasDraftNote(contactIds) {
  if (!contactIds?.length) return false;
  const draftNote = await prisma.salesNote.findFirst({
    where: {
      isPublished: false,
      contacts: { some: { contactId: { in: contactIds } } },
    },
    select: { id: true },
  });
  return !!draftNote;
}

// ── Template Selection ────────────────────────────────────────────────────────

async function findTemplate(deal) {
  // Try: follow_up template matching exact stage, then catch-all follow_up, then any email
  const candidates = await prisma.messageTemplate.findMany({
    where: { channel: 'EMAIL', isActive: true, scenario: 'follow_up' },
    orderBy: { createdAt: 'asc' },
  });

  // Prefer stage-specific match
  const stageMatch = candidates.find(t => t.dealStage === deal.stage);
  if (stageMatch) return stageMatch;

  // Fall back to catch-all follow_up
  const catchAll = candidates.find(t => !t.dealStage);
  if (catchAll) return catchAll;

  // Fall back to any email template
  return await prisma.messageTemplate.findFirst({
    where: { channel: 'EMAIL', isActive: true },
  });
}

// ── Knowledge Entry Retrieval ─────────────────────────────────────────────────

async function findKnowledgeEntries(deal) {
  // Default to GENERAL knowledge entries (clientType not stored on Client model)
  const preferredCategory = 'DEVELOPERS'; // most deals are with developers

  const entries = await prisma.botKnowledgeEntry.findMany({
    where: { isActive: true, category: { in: ['GENERAL', preferredCategory] } },
    take: 5,
    orderBy: { createdAt: 'asc' },
  });

  return entries;
}

// ── Draft Generation ──────────────────────────────────────────────────────────

export async function generateFollowUpDraft(deal, rule) {
  const lastActivityDate = getLastActivityDate(deal);
  const daysSinceActivity = daysSince(lastActivityDate);

  // Get recipient — primary contact (starred), or first contact as fallback
  const primaryDc      = deal.contacts?.find(dc => dc.isPrimary) || deal.contacts?.[0];
  const primaryContact = primaryDc?.contact;
  const toEmail = primaryContact?.email || deal.owner?.email || null;
  // Use preferredName ("Ryan") if set, otherwise first name from full name
  const toName  = primaryContact?.preferredName
               || primaryContact?.name?.split(' ')[0]
               || primaryContact?.name
               || null;

  if (!toEmail) {
    return { error: 'No contact email found for deal — skipping', deal: deal.title };
  }

  // Find template and knowledge entries in parallel
  const [template, knowledgeEntries] = await Promise.all([
    findTemplate(deal),
    findKnowledgeEntries(deal),
  ]);

  // Recent activity descriptions (last 3)
  const recentActivities = (deal.activities || [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 3)
    .map(a => `- ${a.body} (${fmtDate(a.createdAt)})`)
    .join('\n');

  // Template body as skeleton (fill in variables)
  const templateBody = template?.body || '';

  // Build knowledge context block
  const knowledgeBlock = knowledgeEntries.length
    ? `\nRelevant knowledge (use only if directly applicable — do not force it):\n` +
      knowledgeEntries.map(e => `Q: ${e.question}\nA: ${e.answer}`).join('\n\n')
    : '';

  const prompt = `You are drafting a follow-up email on behalf of ${deal.owner?.name || 'ILC Studios'} at ILC Studios, a professional lighting design firm.

Deal context:
- Project: ${deal.title}
- Client: ${deal.client?.name || 'Unknown'}
- Pipeline: ${deal.pipeline}
- Stage: ${deal.stage}
- Service type: ${deal.serviceType || 'not set'}
- Last activity: ${daysSinceActivity} days ago (${fmtDate(lastActivityDate)})
- Recent activities:
${recentActivities || '  (no activity logged)'}
- Next action on file: ${deal.nextActionText || 'none'}
- Key contact: ${toName || 'unknown'} (${toEmail})
${knowledgeBlock}
${templateBody ? `\nUse this template as a skeleton (fill in deal-specific details, don't use it verbatim):\n${templateBody}` : ''}

Write a brief, natural follow-up email. Reference the actual project by name. Do not use generic filler. Match the tone of a trusted consultant checking in — not a salesperson chasing. Keep it under 5 sentences. Address it to ${toName || 'the contact'}.

Respond with JSON only: { "subject": "...", "body": "..." }`;

  let subject = `Following up — ${deal.title}`;
  let body = '';

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: getAnthropicKey() });

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content?.[0]?.text?.trim() || '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    subject = parsed.subject || subject;
    body    = parsed.body   || raw;
  } catch (e) {
    console.error('[followUpDrafter] Claude call failed:', e.message);
    body = `Hi ${toName || 'there'},\n\nJust checking in on ${deal.title} — happy to connect whenever you have a moment.\n\nBest,\n${deal.owner?.name || 'ILC Studios'}`;
  }

  return {
    toEmail,
    toName,
    subject,
    body,
    daysSinceActivity,
    dealTitle: deal.title,
  };
}

// ── Staleness Check ───────────────────────────────────────────────────────────

/**
 * Given a list of active DEAL_STALE BotRules, find all open deals that are stale
 * and don't already have a pending draft.
 */
export async function findStaleDeals(rules) {
  if (!rules.length) return [];

  // Load all open deals with activities + owner + contacts
  // Only consider PUBLISHED SalesNotes for relationship context
  const deals = await prisma.deal.findMany({
    where: { dealStatus: 'OPEN' },
    include: {
      client:     { select: { id: true, name: true } },
      owner:      { select: { id: true, name: true, email: true } },
      contacts:   { take: 3, include: { contact: { select: { id: true, name: true, email: true, title: true } } } },
      activities: { orderBy: { createdAt: 'desc' }, take: 5 },
      botDrafts:  { where: { status: 'PENDING_REVIEW', type: 'FOLLOW_UP' }, select: { id: true } },
    },
  });

  const stale = [];

  for (const deal of deals) {
    // Skip if already has a pending follow-up draft
    if (deal.botDrafts.length > 0) continue;

    // Check each rule to see if this deal matches
    for (const rule of rules) {
      let config = {};
      try { config = JSON.parse(rule.triggerConfig); } catch {}

      const rulePipeline = (config.pipeline || '').toUpperCase();
      const ruleStages   = (config.stages || config.dealStages || '')
        .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const staleDays    = parseInt(config.staleDays || config.stale_days || 14);

      // Match pipeline (loose comparison)
      if (rulePipeline && deal.pipeline?.toUpperCase() !== rulePipeline) continue;

      // Match stage
      if (ruleStages.length && !ruleStages.includes(deal.stage?.toUpperCase())) continue;

      // Check staleness
      const lastActive    = getLastActivityDate(deal);
      const daysSinceAct  = daysSince(lastActive);
      if (daysSinceAct < staleDays) continue;

      stale.push({ deal, rule, daysSinceActivity: daysSinceAct });
      break; // one rule match per deal is enough
    }
  }

  return stale;
}
