import { prisma } from '@/lib/db';
import { decideSupersedes, SAME_BUILDING_MONTHS } from './supersedeRules.js';

/**
 * Database side of "one building, one count" (0124). Rules in supersedeRules.js.
 *
 * applySupersedes(signalId): after a signal is tagged, look at the other
 * signals in its metro from the last two years. Lower-ranked ones about the
 * same building now point at this signal; if a higher-ranked one is about the
 * same building, this signal points at it. Idempotent, so the retag backfill
 * can run it again.
 */
const PICK = {
  id: true, kind: true, title: true, summary: true, address: true, unitCount: true, unitsEstimated: true, publishedAt: true,
  reviewStatus: true, supersededById: true, supersedeReviewed: true,
  tags: { select: { tag: { select: { kind: true, normalized: true } } } },
};

export async function applySupersedes(signalId, { db } = {}) {
  const client = db || prisma;
  const signal = await client.marketSignal.findUnique({ where: { id: signalId }, select: PICK });
  if (!signal || signal.reviewStatus === 'DISMISSED') return { losers: [], winner: null };

  const metros = signal.tags.map(l => l.tag).filter(t => t.kind === 'METRO').map(t => t.normalized);
  if (!metros.length) return { losers: [], winner: null };

  const anchor = signal.publishedAt ? new Date(signal.publishedAt) : new Date();
  const from = new Date(anchor); from.setMonth(from.getMonth() - SAME_BUILDING_MONTHS);
  const to   = new Date(anchor); to.setMonth(to.getMonth() + SAME_BUILDING_MONTHS);

  // Same metro, in the window, a different kind, and either a matching unit
  // count or an address to check against the text (permits always have one).
  const sameBuildingHints = [{ address: { not: null } }];
  if (signal.address) sameBuildingHints.push({ kind: { notIn: ['PERMIT', 'CONCEPT'] } });
  // An estimated count (0131) is a guess, not a fingerprint of the building.
  if (signal.unitCount && !signal.unitsEstimated) sameBuildingHints.push({ unitCount: signal.unitCount, unitsEstimated: false });

  const candidates = await client.marketSignal.findMany({
    where: {
      id:           { not: signal.id },
      kind:         { not: signal.kind },
      reviewStatus: { not: 'DISMISSED' },
      tags:         { some: { tag: { kind: 'METRO', normalized: { in: metros } } } },
      OR:           [{ publishedAt: null }, { publishedAt: { gte: from, lte: to } }],
      AND:          [{ OR: sameBuildingHints }],
    },
    select: PICK,
    take:   2000,
  });

  const { losers, winner } = decideSupersedes(signal, candidates);
  const now = new Date();
  if (losers.length) {
    await client.marketSignal.updateMany({ where: { id: { in: losers }, supersededById: null }, data: { supersededById: signal.id, supersededAt: now } });
  }
  if (winner && !signal.supersededById) {
    await client.marketSignal.update({ where: { id: signal.id }, data: { supersededById: winner, supersededAt: now } });
  }
  return { losers, winner };
}
