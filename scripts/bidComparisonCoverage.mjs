// Bid Comparison coverage on past jobs (Mike 10-21). Read only.
// Leave one job out: each job is checked against typicals built from the
// other jobs, the way a new upload would be. Reports how many original spec
// lines get a typical (by source), the level split for priced lines, the
// Sage Brands pick hit rate, and coverage by kind.
//   node scripts/bidComparisonCoverage.mjs [--json out.json] [--tight 0.5]
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
import { readLine, defaultKinds, isSageBrand } from '../src/lib/bidComparison/kinds.js';
import { buildTypicals, typicalFor, sagePickFor, levelOf, pricedSide, DEFAULTS } from '../src/lib/bidComparison/typicals.js';
import { familyKey, normMfr } from '../src/lib/specSwap/family.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const LIVE = { sourceKind: 'MATRIX_FILE', archivedAt: null, sourceName: { notIn: ['TEMPLATE W DROPDOWNS', 'COPY OF ITHACA FOR PARSPEC'] } };

function run(rows, opts) {
  const jobs = [...new Set(rows.map((r) => r.sourceName))];
  const spec = { lines: 0, PRODUCT: 0, SAGE: 0, KIND: 0, none: 0 };
  const levels = { PRODUCT: { HIGH: 0, MEDIUM: 0, LOW: 0 }, SAGE: { HIGH: 0, MEDIUM: 0, LOW: 0 }, KIND: { HIGH: 0, MEDIUM: 0, LOW: 0 }, none: 0, priced: 0 };
  const sage = { lines: 0, picked: 0, swappedToSage: 0, sameFamily: 0, SWAP: { tried: 0, same: 0 }, KIND: { tried: 0, same: 0 } };
  const byKind = new Map();
  for (const job of jobs) {
    const t = buildTypicals(rows.filter((r) => r.sourceName !== job), opts);
    for (const r of rows.filter((x) => x.sourceName === job)) {
      if (r.outcome !== 'ADDED') {
        const line = { description: r.description, mfr: r.origMfr, catalog: r.origCatalog, uom: r.uom };
        const read = readLine(line);
        const typ = typicalFor(line, read, t);
        spec.lines++;
        spec[typ ? typ.source : 'none']++;
        const k = read.kind?.key || '(no kind)';
        if (!byKind.has(k)) byKind.set(k, { lines: 0, PRODUCT: 0, KIND: 0 });
        const bk = byKind.get(k);
        bk.lines++;
        if (typ) bk[typ.source]++;
        if (!isSageBrand(r.origMfr)) {
          sage.lines++;
          const pick = sagePickFor(line, read, t);
          if (pick) sage.picked++;
          if (r.outcome === 'SWAPPED' && isSageBrand(r.propMfr) && r.propFamily) {
            sage.swappedToSage++;
            if (pick && pick.family === r.propFamily) sage.sameFamily++;
            if (pick) {
              sage[pick.source].tried++;
              if (pick.family === r.propFamily) sage[pick.source].same++;
            }
          }
        }
      }
      if ((r.outcome === 'SWAPPED' || r.outcome === 'KEPT') && r.unitCn > 0) {
        const side = pricedSide(r);
        const line = { description: r.description, mfr: side.mfr, catalog: side.catalog, uom: r.uom };
        const read = readLine(line);
        const typ = typicalFor(line, read, t);
        levels.priced++;
        if (!typ) levels.none++;
        else levels[typ.source][levelOf(r.unitCn, typ.price)]++;
      }
    }
  }
  return { jobs: jobs.length, spec, levels, sage, byKind: Object.fromEntries([...byKind].sort((a, b) => b[1].lines - a[1].lines)) };
}

const prisma = new PrismaClient();
const raw = await prisma.specSwap.findMany({ where: LIVE });
await prisma.$disconnect();
// The stored families predate a family.js fix or two; read them fresh.
const rows = raw.map((r) => ({
  ...r,
  origFamily: familyKey(r.origMfr, r.origCatalog),
  propFamily: familyKey(r.propMfr, r.propCatalog),
}));

const tight = Number(arg('--tight', DEFAULTS.tightShare));
const full = buildTypicals(rows, { tightShare: tight });
const kindTypicals = [...full.kind.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.n - a.n);
const out = {
  rows: rows.length,
  full: {
    pricedLines: full.lines,
    badLines: full.bad,
    productTypicals: full.product.size,
    kindGroups: kindTypicals.length,
    kindTight: kindTypicals.filter((k) => k.tight).length,
    sageSwaps: full.sageSwap.size,
    sageKinds: full.sageKind.size,
  },
  kindTypicals: kindTypicals.filter((k) => k.n >= 5).slice(0, 60),
  mix: Object.fromEntries([...full.mix].sort((a, b) => b[1].median - a[1].median)),
  loo: run(rows, { tightShare: tight }),
  sweep: Object.fromEntries([0.5, 0.6, 0.75].map((x) => [x, run(rows, { tightShare: x })])),
  kinds: defaultKinds().map((k) => ({ key: k.key, name: k.name })),
};
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
const s = out.loo.spec;
const l = out.loo.levels;
console.log(`rows ${out.rows}, jobs ${out.loo.jobs}, priced ${full.lines}, bad ${full.bad}`);
console.log(`product typicals ${full.product.size}, kind groups ${kindTypicals.length} (tight ${out.full.kindTight})`);
console.log(`spec lines ${s.lines}: product ${pct(s.PRODUCT, s.lines)}, kind ${pct(s.KIND, s.lines)}, none ${pct(s.none, s.lines)}`);
const lv = (x) => `H ${x.HIGH} M ${x.MEDIUM} L ${x.LOW}`;
console.log(`priced ${l.priced}: none ${pct(l.none, l.priced)} | product ${lv(l.PRODUCT)} | kind ${lv(l.KIND)}`);
console.log(`sage pick ${pct(out.loo.sage.picked, out.loo.sage.lines)}; same family as our swap ${pct(out.loo.sage.sameFamily, out.loo.sage.swappedToSage)} of ${out.loo.sage.swappedToSage}`);
const e = out.loo.sage;
console.log(`sage by source: swap ${pct(e.SWAP.same, e.SWAP.tried)} of ${e.SWAP.tried}, kind ${pct(e.KIND.same, e.KIND.tried)} of ${e.KIND.tried}`);
for (const [x, r] of Object.entries(out.sweep)) {
  const k = r.levels.KIND;
  console.log(`tight ${x}: spec product ${pct(r.spec.PRODUCT, r.spec.lines)} kind ${pct(r.spec.KIND, r.spec.lines)} | our prices vs kind typical: medium ${pct(k.MEDIUM, k.HIGH + k.MEDIUM + k.LOW)} of ${k.HIGH + k.MEDIUM + k.LOW}`);
}
const json = arg('--json');
if (json) writeFileSync(json, JSON.stringify(out, null, 2));
