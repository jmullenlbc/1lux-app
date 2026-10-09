/**
 * Pure rules for "one building, one count" (migration 0124, Mike 10-8).
 *
 * The same building shows up as an article, later as a concept plan at the
 * city, later as a pulled permit. Each is more certain than the last, so for
 * the forecast the most certain one wins: Permit beats Concept plan beats
 * Article. The losers stay in their tabs, marked "Superseded by permit".
 *
 * Two signals are the same building when they are in the same metro and
 * either the permit's street number and street name appear in the other
 * signal's text, or both state the same unit count within two years of each
 * other. No DB, no fetch.
 */

// COUNCIL (agenda reader, 10-9) sits between a concept plan and a permit: a
// rezoning on a council agenda is more certain than a concept plan.
export const KIND_RANK = { ARTICLE: 1, CONCEPT: 2, COUNCIL: 3, PERMIT: 4 };

export const KIND_LABELS = { ARTICLE: 'article', CONCEPT: 'concept plan', COUNCIL: 'council item', PERMIT: 'permit' };

/** How far apart two signals about one building may be published. */
export const SAME_BUILDING_MONTHS = 24;

export function kindRank(kind) {
  return KIND_RANK[String(kind || 'ARTICLE').toUpperCase()] || 0;
}

const STREET_TYPES = new Set(['st', 'street', 'ave', 'avenue', 'blvd', 'boulevard', 'rd', 'road', 'dr', 'drive', 'ln', 'lane', 'ct', 'court', 'pl', 'place', 'way', 'pkwy', 'parkway', 'hwy', 'highway', 'cir', 'circle', 'ter', 'terrace', 'trl', 'trail', 'loop', 'sq', 'square']);
const DIRECTIONS   = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'north', 'south', 'east', 'west']);

/** "4459 N Rifle St" -> { number: '4459', street: 'rifle' }; null when there is no usable pair. */
export function addressKey(address) {
  const words = String(address || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 2 || !/^\d+$/.test(words[0])) return null;
  const street = words.slice(1).find(w => !DIRECTIONS.has(w) && !STREET_TYPES.has(w) && !/^\d+$/.test(w) && w.length > 1);
  return street ? { number: words[0], street } : null;
}

/** True when the signal's text names the permit's street number and street name. */
export function textNamesAddress(text, address) {
  const key = addressKey(address);
  if (!key) return false;
  const t = String(text || '').toLowerCase();
  return new RegExp(`\\b${key.number}\\b`).test(t) && new RegExp(`\\b${key.street}\\b`).test(t);
}

function metrosOf(signal) {
  return new Set((signal.tags || []).map(l => l.tag || l).filter(t => t.kind === 'METRO').map(t => t.normalized));
}

function textOf(signal) {
  return [signal.title, signal.summary, signal.address].filter(Boolean).join(' ');
}

function monthsApart(a, b) {
  if (!a || !b) return 0;
  return Math.abs(new Date(a) - new Date(b)) / (30.44 * 86400e3);
}

/**
 * Are these two signals about one building? Order does not matter.
 * Both need tags[{tag:{kind,normalized}}]; address, unitCount, title, summary, publishedAt are read when present.
 */
export function sameBuilding(a, b) {
  if (!a || !b || a.id === b.id) return false;
  const ma = metrosOf(a), mb = metrosOf(b);
  if (![...ma].some(m => mb.has(m))) return false;
  if (monthsApart(a.publishedAt, b.publishedAt) > SAME_BUILDING_MONTHS) return false;
  if (a.address && textNamesAddress(textOf(b), a.address)) return true;
  if (b.address && textNamesAddress(textOf(a), b.address)) return true;
  const ua = Number(a.unitCount) || 0, ub = Number(b.unitCount) || 0;
  return ua > 0 && ua === ub;
}

/**
 * Given one signal and the candidates it might share a building with, decide
 * who supersedes whom. Returns { losers: [ids this signal supersedes],
 * winner: id of the candidate that supersedes this signal, or null }.
 * A candidate already superseded, dismissed or marked reviewed is left alone.
 */
export function decideSupersedes(signal, candidates = []) {
  const rank   = kindRank(signal.kind);
  const losers = [];
  let winner   = null;
  for (const c of candidates) {
    if (c.supersedeReviewed || c.reviewStatus === 'DISMISSED') continue;
    if (!sameBuilding(signal, c)) continue;
    const cr = kindRank(c.kind);
    if (cr < rank && !c.supersededById) losers.push(c.id);
    else if (cr > rank && !signal.supersedeReviewed) {
      if (!winner || kindRank(winner.kind) < cr) winner = c;
    }
  }
  return { losers, winner: winner ? winner.id : null };
}
