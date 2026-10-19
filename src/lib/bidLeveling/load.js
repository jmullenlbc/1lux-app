/**
 * Server side of the Bid Leveling screen (Mike 10-18): one leveling with its
 * bids, plus everything the screen shows worked out by the pure engine.
 *
 *   - matrix, normalized totals and clarifications on BASE lines only
 *   - VE and alternate packages priced on their own, with the base cost of
 *     the same types next to them
 *   - "we suggest" per type, from what the drawings asked for (SpecSwap)
 *
 * Internal staff only. ILC lines hold CN, never DN.
 */
import { prisma } from '@/lib/db';
import { buildMatrix, normalize, buildClarifications, deriveFlags } from './engine.js';
import { packagesFor, requestedSpecs } from './views.js';
import { suggestFor } from '../specSwap/suggest.js';

export const LEVELING_INCLUDE = {
  bids: {
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      totals: { orderBy: { sortOrder: 'asc' } },
      flags: true,
    },
  },
  placeholders: true,
};

export async function loadLevelingView(levelingId) {
  const leveling = await prisma.bidLeveling.findUnique({ where: { id: levelingId }, include: LEVELING_INCLUDE });
  if (!leveling || leveling.archivedAt) return null;
  const bids = leveling.bids;
  const view = { leveling: { ...leveling, bids: undefined, placeholders: undefined }, placeholders: leveling.placeholders, bids };
  if (!bids.length) return { ...view, matrix: null, normalized: null, clarifications: {}, flags: {}, packages: {}, suggestions: {} };

  const baseBids = bids.map((b) => ({ ...b, lines: b.lines.filter((l) => l.optionGroup === 'BASE') }));
  const matrix = buildMatrix(baseBids, leveling.baselineBidId);
  const normalized = normalize(baseBids, matrix.baselineBidId, {
    freightMode: leveling.freightMode, freightFlat: leveling.freightFlat,
    whMode: leveling.whMode, whFlat: leveling.whFlat,
    taxRate: leveling.taxRate, taxBase: leveling.taxBase,
    placeholders: leveling.placeholders,
  }, matrix);

  const swaps = await prisma.specSwap.findMany({
    where: { archivedAt: null, outcome: { in: ['SWAPPED', 'KEPT'] } },
    select: { sourceName: true, origMfr: true, origFamily: true, category: true, propMfr: true, propFamily: true, propCatalog: true, productId: true, outcome: true, unitCn: true, sheetDate: true },
  });
  const specs = requestedSpecs(bids);
  const suggestions = {};
  for (const row of matrix.types) {
    const spec = specs.get(row.matchKey);
    if (!spec) continue;
    const s = suggestFor(spec, swaps, { limit: 3 });
    suggestions[row.key] = { spec, match: s.match, cct: s.cct, options: s.options };
  }

  return {
    ...view,
    matrix,
    normalized,
    clarifications: Object.fromEntries(baseBids.map((b) => [b.id, buildClarifications(b, matrix, { bids: baseBids })])),
    flags: Object.fromEntries(bids.map((b) => [b.id, deriveFlags(b)])),
    packages: Object.fromEntries(bids.map((b) => [b.id, packagesFor(b)])),
    suggestions,
  };
}
