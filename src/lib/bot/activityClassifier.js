/**
 * activityClassifier.js
 *
 * Four-layer activity classification for calendar events:
 *   1. User-defined rules (ActivityClassificationRule) — checked first, highest priority wins
 *   2. Title and location keywords — free, instant, and works with no API key
 *   3. Claude Haiku AI — for events the first two layers can't call
 *   4. Fallback — returns null (event stays unclassified for manual review)
 *
 * Mike, 2026-09-07: "when we sync with Microsoft the system should know it's in
 * person through a title or location." Layer 2 is that promise — it is the layer
 * that always runs, so the answer never depends on an API key being present.
 *
 * Used by:
 *   - Calendar .ics import (current)
 *   - M365 calendar sync, through ingestCalendarEvent in src/lib/bot/intake.js
 */

import { prisma }          from '@/lib/db';
import { modelParams, textFrom } from '@/lib/aiModels';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient }      from '@/lib/agent/client';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import {
  IN_PERSON_TYPES, ALWAYS_IN_PERSON_TYPES, classifyByTitleAndLocation,
  activityTypeFromTitle, normalizeActivityType,
} from '@/lib/calendar/inPerson';
import { excludeFromNotes } from '@/lib/calendar/personal';

// Re-exported so the older importers of this file keep working. The set itself
// now lives in src/lib/calendar/inPerson.js, which is the one home for it.
export { IN_PERSON_TYPES };

/**
 * How sure the keyword layer has to be to answer without asking the AI.
 * 85+ means the TITLE named the activity outright ("Lunch with Dave", "Golf at
 * Brookhaven"). Below that the keywords are only reading the location box, which
 * is worth a second opinion when one is available.
 */
const KEYWORD_TRUST_THRESHOLD = 85;

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

const VALID_TYPES = ['COFFEE','MEAL','GOLF','HAPPY_HOUR','SITE_VISIT','TRAVEL','CALL','TEXT','EVENT','OTHER','SKIP',
  'LUNCH'];  // LUNCH kept so an older answer still parses; normalized to MEAL below

async function classifyWithAI(event) {
  const apiKey = getAnthropicKey();
  if (!apiKey) return null;

  const externalCount = event.attendeeCount
    ? Math.max(0, event.attendeeCount - 1)
    : 'unknown';

  // Counts and the organizer address are structured fields we derived, so they
  // stay in the instructions. Title, location and description are free text an
  // outside party wrote when they sent the invite — those go in the fence.
  const eventText = [
    `Title: ${event.title || ''}`,
    `Location: ${event.location || 'not specified'}`,
    event.body ? `Description snippet: ${event.body.slice(0, 200)}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `You are classifying a calendar event to determine if it's an in-person client relationship activity.

Event:
- Attendees: ${event.attendeeCount || 'unknown'} total (${externalCount} external estimated)
- Duration: ${event.durationMinutes || 'unknown'} minutes
- Organizer: ${event.organizerEmail || 'unknown'}
- Title, location and description: in the marked block below.

Classify as exactly one:
COFFEE - coffee shop meeting, cafe, informal chat (typically 30-90 min, 2-4 people)
MEAL - a business breakfast, lunch or dinner at a restaurant
GOLF - golf outing, golf tournament, golf mixer, tee time
HAPPY_HOUR - drinks, happy hour, cocktail event, brewery/bar visit
SITE_VISIT - visiting a job site, project site, building tour
TRAVEL - a day spent travelling for work: a flight, a trip to another city to see clients
CALL - phone/video call that's still external relationship-building
TEXT - a text message (SMS) conversation with a client, never in person
EVENT - networking event, conference, awards, gala, mixer, tournament (not golf)
OTHER - in-person meeting that doesn't fit above categories
SKIP - internal-only meeting, all-hands, weekly standup, virtual meeting with no real relationship context

Rules:
- If location contains a URL or "Zoom"/"Teams"/"Meet" = virtual, likely SKIP unless clearly external relationship
- If 10+ attendees = probably SKIP unless it's a networking EVENT
- Short meetings (<20 min) with no location = probably SKIP
- Restaurant name + small group = MEAL

Respond with ONLY: CLASSIFICATION|CONFIDENCE (0-100)
Examples: MEAL|88  or  SKIP|95  or  GOLF|72`;

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    // Recorded: see src/lib/agent/ledger.js.
    const client = wrapClient(new Anthropic({ apiKey }), 'bot.activity.classify');

    const sealed = buildUntrustedPrompt({
      instructions: prompt,
      documents:    [{ text: eventText, descriptor: 'calendar event', maxChars: 2000 }],
    });
    warnOnInjection('bot.activity.classify', null, sealed);

    const msg = await client.messages.create({
      ...modelParams('bot.activityClassify'),
      max_tokens: 20,
      system:     sealed.system,
      messages:   [{ role: 'user', content: sealed.content }],
    });
    const raw = textFrom(msg)?.trim() || '';
    const [typeStr, confStr] = raw.split('|');
    const type = typeStr?.trim().toUpperCase();
    const conf = parseInt(confStr?.trim()) || 50;
    if (VALID_TYPES.includes(type)) {
      return {
        activityType: type === 'SKIP' ? 'SKIP' : normalizeActivityType(type),
        confidence: conf, source: 'ai',
      };
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
 *   source:       'rule' | 'keyword' | 'ai' | null
 *   ruleName?:    string         — which rule matched (if source=rule)
 *   confidence?:  number         — 0-100
 *   reason?:      string         — plain English, for the note and the log
 * }
 */
export async function classifyEvent(event) {
  // ── Layer 0: the personal stop-list ────────────────────────────────────────
  // Mike, 2026-09-07: "all personal events like soccer practice, tennis match,
  // doctors appts, therapy should be excluded." This runs ahead of everything —
  // ahead of his own rules, ahead of the AI — because a personal appointment
  // must never reach a shared CRM, and because there is no reason to spend an
  // API call reading his dentist's address.
  const excluded = excludeFromNotes(event);
  if (excluded.excluded) {
    return {
      activityType: null, isInPerson: false, source: 'keyword',
      confidence: 95, reason: excluded.reason,
    };
  }

  // ── Layer 1: User-defined rules ────────────────────────────────────────────
  // Mike's own rules beat everything else. If he wrote one, he meant it.
  const titleType = activityTypeFromTitle(event.title);
  const rules = await getActiveRules();
  for (const rule of rules) {
    if (evalCondition(rule, event)) {
      if (rule.resultType === 'SKIP') {
        // The one exception: golf, a meal, coffee and happy hour in the title are
        // in person "full stop" (Mike, 2026-09-07). A generic skip rule — the
        // seeded "Virtual — skip" is the one that bites — does not get to throw
        // away a lunch just because a Teams link was left on the invite.
        if (titleType && ALWAYS_IN_PERSON_TYPES.has(titleType)) continue;
        return {
          activityType: null, isInPerson: false, source: 'rule',
          ruleName: rule.name, reason: `your rule "${rule.name}" says to skip these`,
        };
      }
      const resultType = normalizeActivityType(rule.resultType);
      return {
        activityType: resultType,
        isInPerson:   IN_PERSON_TYPES.has(resultType),
        source:       'rule',
        ruleName:     rule.name,
        confidence:   100,
        reason:       `your rule "${rule.name}" matched`,
      };
    }
  }

  // ── Layer 2: Title and location keywords ───────────────────────────────────
  // A title that names the activity outright is answer enough. A weaker read —
  // location only — is kept aside and used if the AI has nothing to say.
  const keyword = classifyByTitleAndLocation(event);
  if (keyword && keyword.confidence >= KEYWORD_TRUST_THRESHOLD) {
    return keyword;
  }

  // ── Layer 3: Claude Haiku ──────────────────────────────────────────────────
  const aiResult = await classifyWithAI(event);
  if (aiResult) {
    if (aiResult.activityType === 'SKIP') {
      return {
        activityType: null, isInPerson: false, source: 'ai',
        confidence: aiResult.confidence, reason: 'read as an internal or routine meeting',
      };
    }
    return {
      activityType: aiResult.activityType,
      isInPerson:   IN_PERSON_TYPES.has(aiResult.activityType),
      source:       'ai',
      confidence:   aiResult.confidence,
      reason:       'read from the invite',
    };
  }

  // ── Layer 4: the weaker keyword read, if there was one ─────────────────────
  // No API key, or the AI failed. The location on its own still beats nothing.
  if (keyword) return keyword;

  // ── Layer 5: No classification ─────────────────────────────────────────────
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
