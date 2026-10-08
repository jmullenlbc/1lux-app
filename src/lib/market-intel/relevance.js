/**
 * "Most relevant" for the news tab (Mike 10-8: "sortable by date and most
 * relevant, then we need to make logic for relevant").
 *
 * This is the FIRST CUT of that logic, kept in one pure function so the rule
 * can be argued about and changed without touching the query. Every term is a
 * question a salesperson would ask about an article:
 *
 *   Is it about one of our clients?       linked +50, suggested +25
 *   Is it about one of our jobs?          linked +40, suggested +20
 *   How big is the building?              +1 per 10 units, capped at +30
 *   Is money moving?                      groundbreaking +15, financing +10,
 *                                         acquisition +5, award +10
 *   Is somebody already on it?            assigned +10
 *   How old is it?                        -1 per week, capped at -26
 *   Has a permit replaced it?             superseded -100 (one building, one count)
 *
 * The score is not stored: the news tab asks for it, the route scores the
 * matching rows and pages the result. Storing it would need a migration and
 * would go stale every time a rule above changes.
 */

const LINKED    = new Set(['AUTO_LINKED', 'CONFIRMED']);
const SUGGESTED = new Set(['SUGGESTED']);

const TYPE_POINTS = {
  GROUNDBREAKING:  15,
  FINANCING:       10,
  DEVELOPER_AWARD: 10,
  ACQUISITION:      5,
  NEWS:             0,
};

// The fields a signal needs for scoring; the route selects exactly these.
export const RELEVANCE_SELECT = {
  id: true, publishedAt: true, unitCount: true, signalType: true,
  matchStatus: true, projectMatchStatus: true, assignedToId: true, supersededById: true,
};

export function relevanceScore(s, now = Date.now()) {
  let score = 0;
  if (LINKED.has(s.matchStatus))           score += 50;
  else if (SUGGESTED.has(s.matchStatus))   score += 25;
  if (LINKED.has(s.projectMatchStatus))    score += 40;
  else if (SUGGESTED.has(s.projectMatchStatus)) score += 20;
  if (s.unitCount > 0)                     score += Math.min(30, Math.floor(s.unitCount / 10));
  score += TYPE_POINTS[s.signalType] || 0;
  if (s.assignedToId)                      score += 10;
  if (s.publishedAt) {
    const weeks = Math.max(0, (now - new Date(s.publishedAt).getTime()) / (7 * 86400 * 1000));
    score -= Math.min(26, Math.floor(weeks));
  }
  if (s.supersededById)                    score -= 100;
  return score;
}

/** Ids in relevance order, ties broken newest first. */
export function rankByRelevance(rows, now = Date.now()) {
  return rows
    .map(r => ({ id: r.id, score: relevanceScore(r, now), at: r.publishedAt ? new Date(r.publishedAt).getTime() : 0 }))
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .map(r => r.id);
}
