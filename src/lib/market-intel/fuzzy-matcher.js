import Fuse from 'fuse.js';
import { normalizeName } from './normalizer.js';
import { prisma } from '@/lib/db';

let clientCache      = null;
let cacheBuiltAt     = null;
let rejectedCache    = null;  // Set of "candidateName|clientId" previously rejected
let rejectedBuiltAt  = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 min

async function getClientCache() {
  if (clientCache && cacheBuiltAt && Date.now() - cacheBuiltAt < CACHE_TTL) return clientCache;
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, aliases: { select: { aliasName: true } } },
  });
  clientCache = clients.flatMap(c => {
    const entries = [{ id: c.id, name: c.name, normalized: normalizeName(c.name) }];
    for (const alias of (c.aliases || [])) {
      entries.push({ id: c.id, name: alias.aliasName, normalized: normalizeName(alias.aliasName) });
    }
    return entries;
  });
  cacheBuiltAt = Date.now();
  return clientCache;
}

// Load previously REJECTED matches so we don't repeat false positives
async function getRejectedPairs() {
  if (rejectedCache && rejectedBuiltAt && Date.now() - rejectedBuiltAt < CACHE_TTL) return rejectedCache;
  const feedback = await prisma.fuzzyMatchFeedback.findMany({
    where:  { outcome: 'REJECTED' },
    select: { candidateName: true, matchedClientId: true },
  }).catch(() => []);  // table may not exist yet in older migrations
  rejectedCache = new Set(feedback.map(f => `${normalizeName(f.candidateName)}|${f.matchedClientId}`));
  rejectedBuiltAt = Date.now();
  return rejectedCache;
}

export function invalidateClientCache() {
  clientCache     = null;
  cacheBuiltAt    = null;
  rejectedCache   = null;
  rejectedBuiltAt = null;
}

export async function matchCandidates(candidateNames) {
  if (!candidateNames?.length) return [];
  const [cache, rejected] = await Promise.all([getClientCache(), getRejectedPairs()]);

  // Tighter threshold: 0.28 → fuse returns fewer, higher-quality candidates
  // We then apply our own confidence tiers with stricter thresholds
  const fuse = new Fuse(cache, {
    keys:               ['normalized'],
    threshold:          0.28,       // was 0.35, tighter initial filter
    includeScore:       true,
    minMatchCharLength: 5,          // was 4, require at least 5 chars to match
  });

  const results = [];
  for (const rawName of candidateNames) {
    const normalized = normalizeName(rawName);
    if (!normalized || normalized.length < 5) continue;

    const normalizedTokens = normalized.split(' ').filter(Boolean);
    const matches = fuse.search(normalized);
    if (!matches.length) continue;

    const best       = matches[0];
    const confidence = 1 - (best.score || 0);

    // Skip if this pair was previously rejected by a human
    const rejectedKey = `${normalized}|${best.item.id}`;
    if (rejected.has(rejectedKey)) continue;

    // Extra guard: if normalized candidate is a single short token,
    // require near-exact confidence to avoid "lincoln" matching "lincoln avenue communities"
    const isSingleToken = normalizedTokens.length === 1;
    const autoThreshold      = isSingleToken ? 0.97 : 0.92;  // single-token needs near-exact
    const suggestThreshold   = isSingleToken ? 0.90 : 0.72;

    const status = confidence >= autoThreshold    ? 'AUTO_LINKED'
                 : confidence >= suggestThreshold ? 'SUGGESTED'
                 : 'NO_MATCH';

    if (status !== 'NO_MATCH') {
      results.push({
        candidateName: rawName,
        clientId:      best.item.id,
        clientName:    best.item.name,
        score:         confidence,
        status,
      });
    }
  }
  return results;
}

// Record feedback (confirm or reject) so future polls avoid false positives
export async function recordMatchFeedback({ candidateName, matchedClientId, outcome, signalId, userId }) {
  try {
    await prisma.fuzzyMatchFeedback.create({
      data: {
        candidateName,
        matchedClientId,
        score:    0,
        outcome,  // 'CONFIRMED' | 'REJECTED'
        signalId: String(signalId),
        userId:   String(userId),
      },
    });
    invalidateClientCache();  // force rebuild so next poll uses updated feedback
  } catch {}  // non-critical
}
