/**
 * followUpDrafter.js
 * Core logic for Phase B — generates a follow-up email draft for a stale PROJECT.
 * (A project IS the pipeline entity — Deal merged into Project.)
 * Called by /api/bot/check-followup (cron) and /api/bot/draft-follow-up (manual).
 */

import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { inDesignPipeline, STAGE_LABEL } from '@/lib/pipeline';
import { knowledgeContextBlock } from '@/lib/botKnowledge/retrieve';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}
function fmtDate(d) {
  if (!d) return 'unknown';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Most recent activity date for a project (ProjectActivity, else updatedAt).
export function getLastActivityDate(project) {
  if (project.activities?.length) {
    const sorted = [...project.activities].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return new Date(sorted[0].createdAt);
  }
  return new Date(project.updatedAt);
}

// The project's stage in its "primary" board (Design for design-fee types, else Procurement).
function primaryStage(project) {
  return inDesignPipeline(project) ? project.designStage : project.procurementStage;
}

// Skip automation while a human is still drafting a Sales Note for these contacts.
export async function hasDraftNote(contactIds) {
  if (!contactIds?.length) return false;
  const draftNote = await prisma.note.findFirst({
    where: { noteType: 'SALES', isPublished: false, contacts: { some: { contactId: { in: contactIds } } } },
    select: { id: true },
  });
  return !!draftNote;
}

// ── Template + Knowledge ──────────────────────────────────────────────────────

async function findTemplate(project) {
  const candidates = await prisma.messageTemplate.findMany({
    where: { channel: 'EMAIL', isActive: true, scenario: 'follow_up' },
    orderBy: { createdAt: 'asc' },
  });
  const stage = primaryStage(project);
  return candidates.find(t => t.dealStage === stage)
      || candidates.find(t => !t.dealStage)
      || await prisma.messageTemplate.findFirst({ where: { channel: 'EMAIL', isActive: true } });
}

// What the bot is handed out of the knowledge library: ALL of it.
//
// Two rounds of narrowing lived here and both were wrong. It began as `take: 5,
// orderBy: createdAt asc` with no matching, so the bot saw the five OLDEST Q&A
// pairs and no document at all. Then it took the top five matches as short
// excerpts from two categories, which still meant a 40-page PDF contributed a
// paragraph and anything filed elsewhere contributed nothing.
//
// Mike, 2026-09-08: "We need every character or everything we upload to do that."
//
// So no category list and no limit — the whole library, whole documents. The
// project is still passed as the query, but only to ORDER the library; nothing
// is dropped for failing to match. See src/lib/botKnowledge/retrieve.js.
async function findKnowledge(project) {
  const query = [
    project.name,
    project.client?.name,
    project.serviceType,
    project.buildingType,
    STAGE_LABEL[primaryStage(project)] || primaryStage(project),
  ].filter(Boolean).join(' ');

  return knowledgeContextBlock({ query });
}

// Resolve the recipient contact for a project via its client's contacts.
function pickContact(project) {
  const contacts = project.client?.contacts || [];
  return contacts[0] || null;
}

// ── Draft Generation ──────────────────────────────────────────────────────────

export async function generateFollowUpDraft(project, rule) {
  const lastActivityDate  = getLastActivityDate(project);
  const daysSinceActivity = daysSince(lastActivityDate);

  const contact = pickContact(project);
  const owner   = project.salesOwner;
  const toEmail = contact?.email || owner?.email || null;
  const toName  = contact?.preferredName || contact?.name?.split(' ')[0] || contact?.name || null;

  if (!toEmail) {
    return { error: 'No contact email found for project — skipping', project: project.name };
  }

  const [template, knowledgeText] = await Promise.all([findTemplate(project), findKnowledge(project)]);

  const recentActivities = (project.activities || [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 3)
    .map(a => `- ${a.description || a.body || a.type} (${fmtDate(a.createdAt)})`)
    .join('\n');

  const knowledgeBlock = knowledgeText
    ? `\nILC's knowledge library — everything we have taught the bot, in full. Use whatever
is genuinely relevant to this project and ignore the rest. Never mention the library
itself, and never force a fact in just because it is here:\n${knowledgeText}`
    : '';
  const templateBody = template?.body || '';

  const prompt = `You are drafting a follow-up email on behalf of ${owner?.name || 'ILC Studios'} at ILC Studios, a professional lighting design firm.

Project context:
- Project: ${project.name}
- Client: ${project.client?.name || 'Unknown'}
- Service type: ${project.serviceType || 'not set'}
- Stage: ${STAGE_LABEL[primaryStage(project)] || primaryStage(project)}
- Last activity: ${daysSinceActivity} days ago (${fmtDate(lastActivityDate)})
- Recent activities:
${recentActivities || '  (no activity logged)'}
- Key contact: ${toName || 'unknown'} (${toEmail})
${knowledgeBlock}
${templateBody ? `\nUse this template as a skeleton (fill in project-specific details, don't use it verbatim):\n${templateBody}` : ''}

Write a brief, natural follow-up email. Reference the actual project by name. Do not use generic filler. Match the tone of a trusted consultant checking in — not a salesperson chasing. Keep it under 5 sentences. Address it to ${toName || 'the contact'}.

Respond with JSON only: { "subject": "...", "body": "..." }`;

  let subject = `Following up — ${project.name}`;
  let body = '';
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    // Recorded: see src/lib/agent/ledger.js. Scheduled work, so no userId.
    const anthropic = wrapClient(
      new Anthropic({ apiKey: getAnthropicKey() }),
      'bot.followUp.draft',
      { projectId: project.id },
    );
    const msg = await anthropic.messages.create({
      ...modelParams('bot.followUp'), max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = textFrom(msg)?.trim() || '';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    subject = parsed.subject || subject;
    body    = parsed.body   || raw;
  } catch (e) {
    console.error('[followUpDrafter] Claude call failed:', e.message);
    body = `Hi ${toName || 'there'},\n\nJust checking in on ${project.name} — happy to connect whenever you have a moment.\n\nBest,\n${owner?.name || 'ILC Studios'}`;
  }

  return { toEmail, toName, subject, body, daysSinceActivity, projectId: project.id, projectName: project.name };
}

// ── Staleness Check ───────────────────────────────────────────────────────────

/**
 * Given active PROJECT_STALE (or legacy DEAL_STALE) BotRules, find open projects
 * that are stale and don't already have a pending follow-up draft.
 */
export async function findStaleProjects(rules) {
  if (!rules.length) return [];

  const projects = await prisma.project.findMany({
    where: { procurementStatus: 'OPEN' },
    select: {
      id: true, name: true, serviceType: true, procurementStage: true, designStage: true, updatedAt: true,
      salesOwner: { select: { id: true, name: true, email: true } },
      client:     { select: { id: true, name: true, contacts: { take: 3, select: { id: true, name: true, email: true, title: true, preferredName: true } } } },
      activities: { orderBy: { createdAt: 'desc' }, take: 5 },
      botDrafts:  { where: { status: 'PENDING_REVIEW', type: 'FOLLOW_UP' }, select: { id: true } },
    },
  });

  const stale = [];
  for (const project of projects) {
    if (project.botDrafts.length > 0) continue;

    for (const rule of rules) {
      let config = {};
      try { config = JSON.parse(rule.triggerConfig); } catch {}

      const rulePipeline = (config.pipeline || '').toUpperCase();
      const ruleStages   = (config.stages || config.dealStages || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const staleDays    = parseInt(config.staleDays || config.stale_days || 14);

      // Pipeline membership: DESIGN rules only apply to design-fee projects.
      if (rulePipeline === 'DESIGN' && !inDesignPipeline(project)) continue;
      if (ruleStages.length && !ruleStages.includes((primaryStage(project) || '').toUpperCase())) continue;

      const daysSinceAct = daysSince(getLastActivityDate(project));
      if (daysSinceAct < staleDays) continue;

      stale.push({ project, rule, daysSinceActivity: daysSinceAct });
      break;
    }
  }
  return stale;
}

// Back-compat alias (some callers import findStaleDeals).
export const findStaleDeals = findStaleProjects;
