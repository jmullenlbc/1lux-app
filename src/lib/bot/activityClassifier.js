/**
 * activityClassifier.js
 *
 * Three-layer activity classification for calendar events:
 *   1. User-defined rules (ActivityClassificationRule) — checked first, highest priority wins
 *   2. Claude Haiku AI — for events that don't match any rule
 *   3. Fallback — returns null (event stays unclassified for manual review)
 *
 * Used by:
 *   - Calendar .ics import (current)
 *   - M365 calendar webhook sync (Phase D)
 */

import { prisma }          from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';

// ── In-person activity types ───────────────────────────────────────────────────
export const IN_PERSON_TYPES = new Set([
  'COFFEE', 'LUNCH', 'GOLF', 'HAPPY_HOUR', 'SITE_VISIT',
]);

// ── Rule condition evaluators ──────────────────────────────────────────────────

function evalCondition(rule, event) {
  const val = rule.conditionValue.toLowerCase().trim();
  switch (rule.conditionType) {
    case 'TITLE_CONTAINS':
      return (event.title || '').toLowerCase().includes(val);
    case 'LOCATION_CONTAINS':
      return (event.location || '').toLowerCase().includes(val);
    case 'LOCATION_TYPE':
      if (val === 'virtual') {
        const loc = (event.location || '').toLowerCase();
        return loc.includes('http') || loc.includes('zoom') ||
               loc.includes('teams') || loc.includes('meet.google') ||
               loc.includes('webex') || !!event.onlineMeetingUrl;
      }
      if (val === 'in_person') {
        const loc = (event.location || '').toLowerCase();
        return !!loc && !loc.includes('http') && !loc.includes('zoom') &&
               !loc.includes('teams') && !loc.includes('meet.google');
      }
      return false;
    case 'ATTENDEE_MAX':
      return (event.attendeeCount || 0) <= parseInt(val);
    case 'ATTENDEE_MIN':
      return (event.attendeeCount || 0) >= parseInt(val);
    case 'ORGANIZER_DOMAIN':
      return (event.organizerEmail || '').toLowerCase().endsWith('@' + val) ||
             (event.organizerEmail || '').toLowerCase().includes(val);
    case 'DURATION_MIN':
      return (event.durationMinutes || 0) >= parseInt(val);
    case 'DURATION_MAX':
      return (event.durationMinutes || 0) <= parseInt(val);
    case 'BODY_CONTAINS':
      return (event.body || '').toLowerCase().includes(val);
    default:
      return false;
  }
}

// ── Load rules (cached for 15 min) ────────────────────────────────────────────

let rulesCache = null;
let rulesCachedAt = null;
const RULES_TTL = 15 * 60 * 1000;

async function getActiveRules() {
  if (rulesCache && rulesCachedAt && Date.now() - rulesCachedAt < RULES_TTL) {
    return rulesCache;
  }
  rulesCache = await prisma.activityClassificationRule.findMany({
    where:   { isActive: true },
    orderBy: { priority: 'desc' },  // highest priority first
  });
  rulesCachedAt = Date.now();
  return rulesCache;
}

export function invalidateRulesCache() {
  rulesCache    = null;
  rulesCachedAt = null;
}

// ── Claude Haiku classifier ────────────────────────────────────────────────────

const VALID_TYPES = ['COFFEE','LUNCH','GOLF','HAPPY_HOUR','SITE_VISIT','CALL','EVENT','OTHER','SKIP'];

async function classifyWithAI(event) {
  const apiKey = getAnthropicKey();
  if (!apiKey) return null;

  const externalCount = event.attendeeCount
    ? Math.max(0, event.attendeeCount - 1)
    : 'unknown';

  const prompt = `You are classifying a calendar event to determine if it's an in-person client relationship activity.

Event:
- Title: "${event.title || ''}"
- Location: "${event.location || 'not specified'}"
- Attendees: ${event.attendeeCount || 'unknown'} total (${externalCount} external estimated)
- Duration: ${event.durationMinutes || 'unknown'} minutes
- Organizer: ${event.organizerEmail || 'unknown'}
${event.body ? `- Description snippet: "${event.body.slice(0, 200)}"` : ''}

Classify as exactly one:
COFFEE - coffee shop meeting, cafe, informal chat (typically 30-90 min, 2-4 people)
LUNCH - lunch, dinner, breakfast meeting at a restaurant
GOLF - golf outing, golf tournament, golf mixer, tee time
HAPPY_HOUR - drinks, happy hour, cocktail event, brewery/bar visit
SITE_VISIT - visiting a job site, project site, building tour
CALL - phone/video call that's still external relationship-building
EVENT - networking event, conference, awards, gala, tournament (not golf)
OTHER - in-person meeting that doesn't fit above categories
SKIP - internal-only meeting, all-hands, weekly standup, virtual meeting with no real relationship context

Rules:
- If location contains a URL or "Zoom"/"Teams"/"Meet" = virtual, likely SKIP unless clearly external relationship
- If 10+ attendees = probably SKIP unless it's a networking EVENT
- Short meetings (<20 min) with no location = probably SKIP
- Restaurant name + small group = LUNCH

Respond with ONLY: CLASSIFICATION|CONFIDENCE (0-100)
Examples: LUNCH|88  or  SKIP|95  or  GOLF|72`;

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 20,
      messages:   [{ role: 'user', content: prompt }],
    });
    const raw = msg.content?.[0]?.text?.trim() || '';
    const [typeStr, confStr] = raw.split('|');
    const type = typeStr?.trim().toUpperCase();
    const conf = parseInt(confStr?.trim()) || 50;
    if (VALID_TYPES.includes(type)) {
      return { activityType: type, confidence: conf, source: 'ai' };
    }
  } catch (e) {
    console.error('[activityClassifier] Haiku error:', e.message);
  }
  return null;
}

// ── Main classifier ────────────────────────────────────────────────────────────

/**
 * Classify a calendar event into an activity type.
 *
 * @param event {
 *   title:          string
 *   location?:      string
 *   body?:          string
 *   attendeeCount?: number
 *   organizerEmail?: string
 *   durationMinutes?: number
 *   onlineMeetingUrl?: string
 * }
 * @returns {
 *   activityType: string | null  — null means unclassifiable
 *   isInPerson:   boolean
 *   source:       'rule' | 'ai' | 'keyword' | null
 *   ruleName?:    string         — which rule matched (if source=rule)
 *   confidence?:  number         — AI confidence 0-100 (if source=ai)
 * }
 */
export async function classifyEvent(event) {
  // ── Layer 1: User-defined rules ────────────────────────────────────────────
  const rules = await getActiveRules();
  for (const rule of rules) {
    if (evalCondition(rule, event)) {
      if (rule.resultType === 'SKIP') {
        return { activityType: null, isInPerson: false, source: 'rule', ruleName: rule.name };
      }
      return {
        activityType: rule.resultType,
        isInPerson:   IN_PERSON_TYPES.has(rule.resultType),
        source:       'rule',
        ruleName:     rule.name,
        confidence:   100,
      };
    }
  }

  // ── Layer 2: Claude Haiku ──────────────────────────────────────────────────
  const aiResult = await classifyWithAI(event);
  if (aiResult) {
    if (aiResult.activityType === 'SKIP') {
      return { activityType: null, isInPerson: false, source: 'ai', confidence: aiResult.confidence };
    }
    return {
      activityType: aiResult.activityType,
      isInPerson:   IN_PERSON_TYPES.has(aiResult.activityType),
      source:       'ai',
      confidence:   aiResult.confidence,
    };
  }

  // ── Layer 3: No classification ─────────────────────────────────────────────
  return { activityType: null, isInPerson: false, source: null };
}

/**
 * Batch classify a list of events — respects API rate limits with small delay
 * between batches.
 */
export async function classifyEvents(events, { batchSize = 10, delayMs = 300 } = {}) {
  const results = [];
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    const classified = await Promise.all(batch.map(ev => classifyEvent(ev)));
    results.push(...classified);
    if (i + batchSize < events.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}
