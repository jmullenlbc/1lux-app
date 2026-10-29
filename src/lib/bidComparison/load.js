/**
 * Bid Comparison from the live peer review matrices (Mike 10-21). Server only.
 * Reads the SpecSwap rows once every 10 minutes and builds typicals from them.
 * tryPastJob checks one past job's ILC prices against the other jobs, the way
 * a new upload would be checked.
 */
import { prisma } from '@/lib/db';
import { familyKey } from '../specSwap/family.js';
import { buildTypicals } from './typicals.js';
import { rulesFromRows } from './kinds.js';
import { compareBids } from './check.js';

// The two template files are not jobs (Mike removes them on Admin after deploy).
export const LIVE = {
  sourceKind: 'MATRIX_FILE',
  archivedAt: null,
  sourceName: { notIn: ['TEMPLATE W DROPDOWNS', 'COPY OF ITHACA FOR PARSPEC'] },
};
const TTL_MS = 10 * 60 * 1000;
let cache = null;

/** Live rows with families read fresh (stored ones predate a family.js fix or two). */
export async function loadPastRows() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const raw = await prisma.specSwap.findMany({
    where: LIVE,
    select: {
      id: true, sourceName: true, typeTag: true, description: true, outcome: true, qty: true, uom: true, unitCn: true,
      origMfr: true, origCatalog: true, propMfr: true, propCatalog: true,
    },
  });
  const rows = raw.map((r) => ({
    ...r,
    origFamily: familyKey(r.origMfr, r.origCatalog),
    propFamily: familyKey(r.propMfr, r.propCatalog),
  }));
  cache = { at: Date.now(), rows };
  return rows;
}

let rulesCache = null;

/**
 * The fixture kinds, brand grades and Sage Brands list staff keep on Admin
 * (FixtureKind / BrandGrade, 0138). Empty tables read as the code defaults.
 */
export async function loadRules() {
  if (rulesCache && Date.now() - rulesCache.at < TTL_MS) return rulesCache.rules;
  const [kindRows, brandRows] = await Promise.all([
    prisma.fixtureKind.findMany({ include: { words: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.brandGrade.findMany(),
  ]);
  const rules = { ...rulesFromRows(kindRows, brandRows), kindRows, brandRows };
  rulesCache = { at: Date.now(), rules };
  return rules;
}

/** After an edit, so the next check reads it. */
export function clearRulesCache() {
  rulesCache = null;
}

/** Each past job with its line and priced line counts, biggest first. */
export function jobList(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.sourceName)) m.set(r.sourceName, { job: r.sourceName, lines: 0, priced: 0 });
    const j = m.get(r.sourceName);
    j.lines++;
    if ((r.outcome === 'SWAPPED' || r.outcome === 'KEPT') && r.unitCn > 0) j.priced++;
  }
  return [...m.values()].sort((a, b) => b.priced - a.priced || a.job.localeCompare(b.job));
}

/** One past job's ILC priced lines as a single bid, checked against every other job. */
export function tryPastJob(rows, job, rules = {}) {
  const { kinds, brands, sage } = rules;
  const opts = Object.fromEntries(Object.entries({ kinds, brands, sage }).filter(([, v]) => v));
  const mine = rows.filter((r) => r.sourceName === job);
  if (!mine.length) return null;
  const typicals = buildTypicals(rows.filter((r) => r.sourceName !== job), opts);
  const lines = mine
    .filter((r) => (r.outcome === 'SWAPPED' || r.outcome === 'KEPT') && r.unitCn > 0)
    .map((r) => {
      const prop = r.outcome === 'SWAPPED' || !!r.propFamily;
      return {
        typeTag: r.typeTag,
        description: r.description,
        mfr: prop ? r.propMfr || r.origMfr : r.origMfr || r.propMfr,
        catalog: prop ? r.propCatalog : r.origCatalog,
        qty: r.qty,
        uom: r.uom,
        unitPrice: r.unitCn,
      };
    });
  const result = compareBids([{ id: 'ilc', name: `ILC prices on ${job}`, lines }], typicals, opts);
  return { job, typicals: { lines: typicals.lines, bad: typicals.bad, jobs: typicals.jobs }, result };
}
