import Fuse from 'fuse.js';
import { normalizeName } from './normalizer.js';
import { prisma } from '@/lib/db';

let clientCache   = null;
let cacheBuiltAt  = null;
const CACHE_TTL   = 15 * 60 * 1000; // 15 min

async function getClientCache() {
  if (clientCache && cacheBuiltAt && Date.now() - cacheBuiltAt < CACHE_TTL) {
    return clientCache;
  }
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

export function invalidateClientCache() {
  clientCache  = null;
  cacheBuiltAt = null;
}

export async function matchCandidates(candidateNames) {
  if (!candidateNames?.length) return [];
  const cache = await getClientCache();
  const fuse  = new Fuse(cache, {
    keys:             ['normalized'],
    threshold:        0.35,
    includeScore:     true,
    minMatchCharLength: 4,
  });

  const results = [];
  for (const rawName of candidateNames) {
    const normalized = normalizeName(rawName);
    if (!normalized || normalized.length < 4) continue;
    const matches = fuse.search(normalized);
    if (!matches.length) continue;
    const best       = matches[0];
    const confidence = 1 - (best.score || 0);
    results.push({
      candidateName: rawName,
      clientId:      best.item.id,
      clientName:    best.item.name,
      score:         confidence,
      status:        confidence >= 0.92 ? 'AUTO_LINKED'
                   : confidence >= 0.72 ? 'SUGGESTED'
                   : 'NO_MATCH',
    });
  }
  return results.filter(r => r.status !== 'NO_MATCH');
}
