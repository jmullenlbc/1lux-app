/**
 * "Most relevant" for the news tab, and which articles count at all.
 *
 * Mike 10-8: the order is client match, then project match, then new
 * development or renovation news. Where the building is does not matter.
 * Articles that are not about a project (advice to developers, operations,
 * policy, rent commentary) are not wanted at all: see PROJECT_ONLY.
 *
 * The score is in tiers so a lower question can never outrank a higher one:
 *
 *   Is it about one of our clients?       linked 1000, suggested 300
 *   Is it about one of our jobs?          linked 400, suggested 200
 *   What kind of project news is it?      new development or renovation 15,
 *                                         financing 8, acquisition 5, award 3
 *   How big is the building?              +1 per 10 units, capped at 10
 *   Is somebody already on it?            assigned 5
 *   How old is it?                        -1 per week, capped at 26
 *   Has a permit replaced it?             superseded -2000 (one building, one count)
 *   Is it about a project at all?         no: -5000
 *   Did somebody mark it not relevant?    -30 per press (0130)
 *
 * Everything below the two match tiers adds up to under 100 either way, and
 * the tiers sit at least 100 apart, so a fresh unmatched groundbreaking never
 * passes an old article about a client. A suggested client (300) sits below a
 * confirmed job (400) on purpose: a confirmed fact beats a guess.
 *
 * Not stored: the route scores the matching rows and pages the result.
 * Storing it would need a migration and go stale when a rule changes.
 */

const LINKED    = new Set(['AUTO_LINKED', 'CONFIRMED']);
const SUGGESTED = new Set(['SUGGESTED']);

// GROUNDBREAKING is the pre-0125 name for a new development.
const TYPE_POINTS = {
  NEW_DEVELOPMENT: 15,
  GROUNDBREAKING:  15,
  RENOVATION:      15,
  FINANCING:        8,
  ACQUISITION:      5,
  DEVELOPER_AWARD:  3,
  NEWS:             0,
};

// The fields a signal needs for scoring; the route selects exactly these.
export const RELEVANCE_SELECT = {
  id: true, publishedAt: true, unitCount: true, signalType: true, projectRelated: true,
  matchStatus: true, projectMatchStatus: true, assignedToId: true, supersededById: true,
  _count: { select: { feedback: true } },
};

// Prisma where-fragment that drops screened-out articles. Null (not screened
// yet) stays visible until the Screen articles backfill gets to it. Written
// as an OR because `not: false` would also drop the nulls in Postgres.
export const PROJECT_ONLY = { OR: [{ projectRelated: true }, { projectRelated: null }] };

export function relevanceScore(s, now = Date.now()) {
  let score = 0;
  if (LINKED.has(s.matchStatus))                score += 1000;
  else if (SUGGESTED.has(s.matchStatus))        score += 300;
  if (LINKED.has(s.projectMatchStatus))         score += 400;
  else if (SUGGESTED.has(s.projectMatchStatus)) score += 200;
  score += TYPE_POINTS[s.signalType] || 0;
  if (s.unitCount > 0)                          score += Math.min(10, Math.floor(s.unitCount / 10));
  if (s.assignedToId)                           score += 5;
  if (s.publishedAt) {
    const weeks = Math.max(0, (now - new Date(s.publishedAt).getTime()) / (7 * 86400 * 1000));
    score -= Math.min(26, Math.floor(weeks));
  }
  if (s.supersededById)                         score -= 2000;
  if (s.projectRelated === false)               score -= 5000;
  // Marked not relevant (0130): each press is -30, so one press drops it below
  // every undismissed row of its tier and under a fresh unmatched story.
  const presses = s._count?.feedback ?? s.feedbackCount ?? 0;
  if (presses)                                  score -= 30 * presses;
  return score;
}

/** Ids in relevance order, ties broken newest first. */
export function rankByRelevance(rows, now = Date.now()) {
  return rows
    .map(r => ({ id: r.id, score: relevanceScore(r, now), at: r.publishedAt ? new Date(r.publishedAt).getTime() : 0 }))
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .map(r => r.id);
}
