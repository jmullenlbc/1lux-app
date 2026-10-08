// Permit owner lookup (0126, Mike 10-8): "if the permit doesn't say a client,
// our system should be smart enough to quickly search the web because there
// is almost always something about that address."
//
// lookupOwner: one permit, one web research call (a few searches), one answer.
// applyOwnerLookup: write what came back as tags, match the developer against
// the CRM, remember the page it came from.
// runOwnerLookups: the next few permits never looked up, for the button and
// the cron. Found or not, every attempt sets ownerLookupAt so a permit is
// searched once; "Search again" on the card clears it.
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, answerBudget, textFrom } from '@/lib/aiModels';
import { matchCandidates } from './fuzzy-matcher.js';
import { saveSignalTags, attachSignalToClient } from './tags.js';
import { ownerPrompt, readOwnerAnswer, ownerExtraction, ownerCandidateNames, mergeDeveloperNames, MAX_OWNER_SEARCHES } from './ownerRules.js';

const JOB = 'market.ownerLookup';
const MAX_CONTINUES = 3;

const SIGNAL_SELECT = {
  id: true, title: true, address: true, neighborhood: true, unitCount: true, valuation: true, permitClass: true,
  permitNumber: true, contractorName: true, publishedAt: true, developerNames: true, linkedClientId: true, matchStatus: true,
  tags: { select: { tag: { select: { kind: true, name: true } } } },
};

/** Metro and state off the permit's own tags, so the prompt can say where it is. */
function placeOf(signal) {
  const metro = signal.tags?.find(l => l.tag.kind === 'METRO')?.tag.name || null;
  const state = signal.tags?.find(l => l.tag.kind === 'STATE')?.tag.name || (metro ? metro.split(',').pop()?.trim() : null) || null;
  return { metro, state };
}

/**
 * Ask the web who is behind one permit. Returns the cleaned answer, or
 * `{ failed: true, error }` when the model call itself fails (a key or credit
 * problem), which the caller must not count as "looked up, nothing found".
 */
export async function lookupOwner(signal, { userId } = {}) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = wrapClient(new Anthropic({ apiKey: getAnthropicKey() }), JOB, { userId });
  const user  = { role: 'user', content: ownerPrompt({ ...signal, ...placeOf(signal) }) };
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_OWNER_SEARCHES }];
  let messages = [user];
  let msg;
  try {
    for (let i = 0; i <= MAX_CONTINUES; i++) {
      msg = await client.messages.stream({
        ...modelParams(JOB), max_tokens: answerBudget(JOB, 3000), tools, messages,
      }).finalMessage();
      if (msg.stop_reason !== 'pause_turn') break;
      messages = [user, { role: 'assistant', content: msg.content }];
    }
  } catch (e) {
    return { failed: true, error: String(e?.message || e).slice(0, 300) };
  }
  if (msg.stop_reason === 'refusal') return { failed: true, error: 'The research tool would not answer.' };
  const answer = readOwnerAnswer(textFrom(msg));
  if (!answer) return { failed: true, error: 'The answer came back in a form the app could not read.' };
  return answer;
}

/**
 * Write one answer onto its permit. The companies become COMPANY tags with
 * their roles (the Add to CRM button appears for any that is not a client);
 * the developer goes through the CRM matcher the same way an article's does,
 * and links the permit only when nobody has decided the client yet.
 */
export async function applyOwnerLookup(signal, answer) {
  const place = placeOf(signal);
  const data  = {
    ownerLookupAt:    new Date(),
    ownerLookupNote:  answer.note || null,
    ownerSourceUrl:   answer.source?.url   || null,
    ownerSourceTitle: answer.source?.title || null,
  };
  if (!answer.found) {
    await prisma.marketSignal.update({ where: { id: signal.id }, data });
    return { found: false };
  }

  const names   = ownerCandidateNames(answer);
  const matches = names.length ? await matchCandidates(names).catch(() => []) : [];
  const auto    = matches.find(m => m.status === 'AUTO_LINKED');
  const sugg    = !auto ? matches.find(m => m.status === 'SUGGESTED') : null;
  const best    = auto || sugg;

  data.developerNames = mergeDeveloperNames(signal.developerNames, answer);
  // A person's confirm or reject stands; so does a link the permit already has.
  const undecided = ['UNREVIEWED', 'SUGGESTED'].includes(signal.matchStatus);
  if (best && undecided) {
    data.linkedClientId = best.clientId;
    data.matchStatus    = best.status;
    data.matchScore     = best.score;
  }
  await prisma.marketSignal.update({ where: { id: signal.id }, data });
  await saveSignalTags(signal.id, ownerExtraction(answer, place), { matches });
  if (auto && undecided) await attachSignalToClient(signal.id, auto.clientId, { companyNames: names }).catch(() => {});
  return { found: true, companies: answer.companies.length, linked: !!(best && undecided) };
}

/**
 * Look up the next permits that have no owner yet. Newest first, because the
 * newest permit is the one a salesperson can still do something about. Stops
 * at the deadline, at the limit, or after three failures in a row with no
 * success (the key is broken; pressing on burns calls).
 */
export async function runOwnerLookups({ limit = 3, deadline = Date.now() + 240_000, userId = null, signalId = null } = {}) {
  const where = signalId
    ? { id: signalId }
    : { kind: 'PERMIT', ownerLookupAt: null, reviewStatus: { not: 'DISMISSED' } };
  const rows = await prisma.marketSignal.findMany({
    where, orderBy: { publishedAt: 'desc' }, take: limit, select: SIGNAL_SELECT,
  });
  const log = { looked: 0, found: 0, notFound: 0, readFailed: 0, readError: null, errors: [], remaining: 0 };
  let failStreak = 0;
  for (const row of rows) {
    if (Date.now() > deadline) break;
    const answer = await lookupOwner(row, { userId });
    if (answer.failed) {
      log.readFailed += 1;
      log.readError   = log.readError || answer.error;
      if (++failStreak >= 3) break;
      continue;
    }
    failStreak = 0;
    try {
      const r = await applyOwnerLookup(row, answer);
      log.looked += 1;
      if (r.found) log.found += 1; else log.notFound += 1;
    } catch (e) {
      log.errors.push({ id: row.id, error: String(e?.message || e).slice(0, 200) });
    }
  }
  log.remaining = await prisma.marketSignal.count({ where: { kind: 'PERMIT', ownerLookupAt: null, reviewStatus: { not: 'DISMISSED' } } });
  return log;
}
