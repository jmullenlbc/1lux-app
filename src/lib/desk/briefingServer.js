/**
 * Morning briefing, the server half. Server only. Reads the desk we already
 * load, adds today's meetings and the viewer's own overdue check-ins, and asks
 * the QUICK model for a few lines. Kept in memory per person per day, so the
 * page asks once a morning; ?refresh=1 writes it again.
 */
import { prisma } from '@/lib/db';
import { agentClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import { loadDesk } from '@/lib/desk/deskServer';
import { ownedBy } from '@/lib/notes/owners';
import { cadenceDaysFor, isCheckInDue, checkInDueDay } from '@/lib/checkIns/checkIns';
import { briefingFacts, buildBriefingPrompt, parseBriefing, plainBriefing, briefingDay } from '@/lib/desk/briefing';

const JOB = 'bot.deskBriefing';
const DAY = 86_400_000;
const cache = new Map(); // `${userId}|${day}` -> briefing

/** Midnight Pacific for a YYYY-MM-DD, summer or winter time. */
function dayStart(day) {
  for (const off of ['-07:00', '-08:00']) {
    const t = new Date(`${day}T00:00:00${off}`);
    if (briefingDay(t) === day && briefingDay(new Date(t.getTime() - 1)) !== day) return t;
  }
  return new Date(`${day}T08:00:00Z`);
}

/** Calendar notes (drafts included) with a meeting time today, Pacific. */
async function todaysMeetings(userId, now) {
  const start = dayStart(briefingDay(now));
  return prisma.note.findMany({
    where: { ...ownedBy(userId), archivedAt: null, meetingDate: { gte: start, lt: new Date(start.getTime() + DAY) } },
    select: { id: true, title: true, meetingDate: true },
    orderBy: { meetingDate: 'asc' },
    take: 10,
  });
}

/** People this user looks after (theirs, or their company's) whose check-in is past due. */
async function myCheckIns(userId, now) {
  const [rules, contacts] = await Promise.all([
    prisma.relationshipCadenceRule.findMany({ where: { isActive: true } }),
    prisma.contact.findMany({
      where: {
        OR: [{ ownerId: userId }, { ownerId: null, client: { ownerId: userId } }],
        AND: [{ OR: [{ lastInPersonAt: { not: null } }, { lastTouchpointAt: { not: null } }] }],
      },
      select: {
        id: true, name: true, company: true, cadenceTier: true, cadenceDays: true,
        lastInPersonAt: true, lastTouchpointAt: true, nextCheckInAt: true,
        client: { select: { name: true, cadenceDays: true } },
      },
    }),
  ]);
  const ruleByTier = Object.fromEntries(rules.map(r => [r.tier, r.cadenceDays]));
  return contacts
    .map(c => ({ c, cadence: cadenceDaysFor(c, ruleByTier) }))
    .filter(({ c, cadence }) => isCheckInDue(c, cadence, now))
    .map(({ c, cadence }) => ({
      id: c.id, name: c.name, company: c.client?.name || c.company || '',
      daysOverdue: Math.max(0, Math.floor((now - checkInDueDay(c, cadence)) / DAY)),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

async function writeLines(facts, userId) {
  const params = modelParams(JOB);
  const sealed = buildUntrustedPrompt(buildBriefingPrompt(facts));
  warnOnInjection(JOB, null, sealed);
  const anthropic = await agentClient(JOB, { userId });
  const msg = await anthropic.messages.create({
    ...params, max_tokens: 700, system: sealed.system, messages: [{ role: 'user', content: sealed.content }],
  });
  const lines = parseBriefing(textFrom(msg), facts);
  if (!lines.length) throw new Error(`unreadable reply (stop: ${msg?.stop_reason || 'unknown'})`);
  return { lines, model: params.model };
}

/**
 * { day, lines: [{ text, refs, go }], facts, source: 'ai' | 'plain' | 'empty', note, writtenAt }
 * A failed model call never fails the desk: the plain lines stand in.
 */
export async function morningBriefing(userId, { now = new Date(), refresh = false } = {}) {
  const day = briefingDay(now);
  const key = `${userId}|${day}`;
  if (!refresh && cache.has(key)) return cache.get(key);

  const [desk, meetings, checkIns] = await Promise.all([
    loadDesk(userId, now, { full: true }),
    todaysMeetings(userId, now).catch(e => { console.error('[briefing] meetings failed (non-fatal):', e?.message || e); return []; }),
    myCheckIns(userId, now).catch(e => { console.error('[briefing] check-ins failed (non-fatal):', e?.message || e); return []; }),
  ]);
  const facts = briefingFacts(desk, { todaysMeetings: meetings, checkIns });
  let out = { day, facts, lines: [], source: 'empty', note: '', writtenAt: now.toISOString() };
  if (facts.length) {
    try {
      const { lines, model } = await writeLines(facts, userId);
      out = { ...out, lines, source: 'ai', note: model };
    } catch (e) {
      console.error('[briefing] writer failed, plain lines instead:', e?.message || e);
      out = { ...out, lines: plainBriefing(facts), source: 'plain', note: 'The writer could not be reached, so these are the plain counts.' };
    }
  }
  cache.set(key, out);
  for (const k of cache.keys()) if (!k.endsWith(`|${day}`)) cache.delete(k);
  return out;
}
