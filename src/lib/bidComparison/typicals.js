/**
 * Typical prices for Bid Comparison (Mike 10-21). Pure.
 *
 * Built from ILC's own priced lines on past jobs (the peer review matrices,
 * mostly our Sage Brands prices, Eluma first). Outside users read these as "compared with
 * similar fixtures on past jobs". Two sources, best first:
 *   PRODUCT  the same brand + catalog family, 3+ good prices
 *   KIND     the same kind + size + grade (each or per foot), used only when
 *            past prices agree: half or more within 15% of the middle price
 *   SAGE     a sageOnly kind (garage) uses our usual Sage Brands price for the
 *            kind and size, since ILC only uses Sage Brands there (Mike 10-22)
 * A bad line (more than 15% off its family's middle price) is left out of
 * everything: better to miss data than to learn from bad data.
 * Grade comes from the brand or the words, never from the price.
 */

import { familyKey, normMfr } from '../specSwap/family.js';
import { readLine, defaultKinds, defaultBrandGrades, isSageBrand, SAGE_BRANDS } from './kinds.js';

export const SLACK = 0.15;
export const DEFAULTS = { minProduct: 3, minKind: 5, minJobs: 2, tightShare: 0.5, minSage: 3 };

/** Linear quantile of an ascending list. */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const median = (xs) => quantile([...xs].sort((a, b) => a - b), 0.5);

/** HIGH | MEDIUM | LOW against a reference price; MEDIUM is within 15%. */
export function levelOf(price, ref, slack = SLACK) {
  if (!(price > 0) || !(ref > 0)) return null;
  // Compare the ratio with a hair of room so exactly 15% stays Medium ($115 on $100).
  const r = price / ref;
  if (r > 1 + slack + 1e-9) return 'HIGH';
  if (r < 1 - slack - 1e-9) return 'LOW';
  return 'MEDIUM';
}

const usableFamily = (f) => (f && !/CUSTOM/.test(f) ? f : null);

/**
 * The product a priced past line prices: the proposal when swapped, else the
 * proposal when it names one, else the original spec (kept as specified).
 */
export function pricedSide(r) {
  const useProp = r.outcome === 'SWAPPED' || !!r.propFamily;
  return useProp
    ? { mfr: r.propMfr || r.origMfr, catalog: r.propCatalog, family: r.propFamily }
    : { mfr: r.origMfr || r.propMfr, catalog: r.origCatalog, family: r.origFamily };
}

/** SpecSwap rows to priced past lines with kind, size, grade and basis read. */
export function pastLines(rows, { kinds = defaultKinds(), brands = defaultBrandGrades(), sage = SAGE_BRANDS } = {}) {
  const out = [];
  for (const r of rows) {
    if ((r.outcome !== 'SWAPPED' && r.outcome !== 'KEPT') || !(r.unitCn > 0)) continue;
    const side = pricedSide(r);
    const read = readLine({ description: r.description, catalog: side.catalog, mfr: side.mfr, uom: r.uom }, { kinds, brands });
    out.push({
      id: r.id,
      job: r.sourceName,
      outcome: r.outcome,
      family: usableFamily(side.family),
      origFamily: usableFamily(r.origFamily),
      mfr: normMfr(side.mfr),
      sage: isSageBrand(side.mfr, sage),
      kind: read.kind,
      kindKey: read.kind?.key ?? null,
      size: read.size,
      grade: read.grade?.grade ?? null,
      basis: read.basis,
      price: r.unitCn,
      qty: r.qty > 0 ? r.qty : 0,
      bad: false,
    });
  }
  return out;
}

const groupBy = (xs, keyOf) => {
  const m = new Map();
  for (const x of xs) {
    const k = keyOf(x);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};

/** Mark lines more than 15% off their family's middle price (families with 3+ prices). */
export function markBad(lines, slack = SLACK) {
  const fams = groupBy(lines, (l) => (l.family ? `${l.family}|${l.basis}` : null));
  let bad = 0;
  for (const group of fams.values()) {
    if (group.length < 3) continue;
    const mid = median(group.map((l) => l.price));
    for (const l of group) {
      if (Math.abs(l.price - mid) / mid > slack) {
        l.bad = true;
        bad++;
      }
    }
  }
  return bad;
}

const jobsIn = (group) => new Set(group.map((l) => l.job)).size;
const mostCommon = (xs) => {
  const c = new Map();
  for (const x of xs) if (x != null) c.set(x, (c.get(x) || 0) + 1);
  let best = null;
  for (const [k, n] of c) if (!best || n > best[1]) best = [k, n];
  return best ? best[0] : null;
};

export const kindKeyOf = (kindKey, size, grade, basis) => `${kindKey}|${size || ''}|${grade || ''}|${basis}`;

/**
 * Everything the check needs from past jobs:
 *   product   family|basis to { price, n, jobs, kindKey, size }
 *   kind      kind|size|grade|basis to { price, n, jobs, share, tight }
 *   sageSwap  original family to the Sage Brands family ILC swapped it to, with price
 *   sageKind  kind|size|basis to the usual Sage Brands price
 *   mix       kind to { median, p75 } share of a job's dollars
 *   sage      the Sage Brands list it was built with (opts.sage, staff edit it)
 */
export function buildTypicals(rows, opts = {}) {
  const o = { ...DEFAULTS, sage: SAGE_BRANDS, ...opts };
  const lines = pastLines(rows, o);
  const bad = markBad(lines);
  const good = lines.filter((l) => !l.bad);

  const product = new Map();
  for (const [key, g] of groupBy(good, (l) => (l.family ? `${l.family}|${l.basis}` : null))) {
    if (g.length < o.minProduct || jobsIn(g) < o.minJobs) continue;
    product.set(key, {
      price: median(g.map((l) => l.price)),
      n: g.length,
      jobs: jobsIn(g),
      kindKey: mostCommon(g.map((l) => l.kindKey)),
      size: mostCommon(g.map((l) => l.size)),
    });
  }

  const kind = new Map();
  const kindable = good.filter((l) => l.kind && !l.kind.noTypical);
  for (const [key, g] of groupBy(kindable, (l) => kindKeyOf(l.kindKey, l.size, l.grade, l.basis))) {
    const mid = median(g.map((l) => l.price));
    const within = g.filter((l) => Math.abs(l.price - mid) / mid <= SLACK).length;
    const share = within / g.length;
    kind.set(key, {
      price: mid,
      n: g.length,
      jobs: jobsIn(g),
      share,
      tight: g.length >= o.minKind && jobsIn(g) >= o.minJobs && share >= o.tightShare,
    });
  }

  const sageSwap = new Map();
  const swaps = good.filter((l) => l.outcome === 'SWAPPED' && l.sage && l.origFamily && l.family);
  for (const [orig, g] of groupBy(swaps, (l) => `${l.origFamily}|${l.basis}`)) {
    const fam = mostCommon(g.map((l) => l.family));
    const same = g.filter((l) => l.family === fam);
    const typical = product.get(`${fam}|${same[0].basis}`);
    sageSwap.set(orig, { family: fam, price: typical ? typical.price : median(same.map((l) => l.price)), n: same.length, jobs: jobsIn(same) });
  }

  const sageKind = new Map();
  const sageLines = good.filter((l) => l.sage && l.kind && !l.kind.noTypical);
  for (const [key, g] of groupBy(sageLines, (l) => `${l.kindKey}|${l.size || ''}|${l.basis}`)) {
    if (g.length < o.minSage) continue;
    sageKind.set(key, { family: mostCommon(g.map((l) => l.family)), price: median(g.map((l) => l.price)), n: g.length, jobs: jobsIn(g) });
  }

  const mix = new Map();
  const byJob = groupBy(good.filter((l) => l.kindKey && l.qty > 0), (l) => l.job);
  const shares = new Map();
  let jobCount = 0;
  for (const g of byJob.values()) {
    const total = g.reduce((s, l) => s + l.price * l.qty, 0);
    if (!(total > 0)) continue;
    jobCount++;
    const by = new Map();
    for (const l of g) by.set(l.kindKey, (by.get(l.kindKey) || 0) + l.price * l.qty);
    for (const [k, d] of by) {
      if (!shares.has(k)) shares.set(k, []);
      shares.get(k).push(d / total);
    }
  }
  for (const [k, xs] of shares) {
    const all = [...xs, ...Array(Math.max(0, jobCount - xs.length)).fill(0)].sort((a, b) => a - b);
    mix.set(k, { median: quantile(all, 0.5), p75: quantile(all, 0.75), jobs: xs.length });
  }

  return { lines: lines.length, bad, good: good.length, jobs: jobCount, product, kind, sageSwap, sageKind, mix, sage: o.sage };
}

/**
 * The typical price for one line, or null ("Not enough data"):
 * { price, source: PRODUCT | KIND, n, jobs }. `read` is readLine's result.
 */
export function typicalFor(line, read, t) {
  const fam = usableFamily(familyKey(line.mfr, line.catalog));
  const p = fam && t.product.get(`${fam}|${read.basis}`);
  if (p) return { price: p.price, source: 'PRODUCT', n: p.n, jobs: p.jobs, family: fam };
  if (!read.kind || read.kind.noTypical) return null;
  if (read.kind.sageOnly) {
    const s = t.sageKind.get(`${read.kind.key}|${read.size || ''}|${read.basis}`);
    return s ? { price: s.price, source: 'SAGE', n: s.n, jobs: s.jobs, family: fam } : null;
  }
  const k = t.kind.get(kindKeyOf(read.kind.key, read.size, read.grade?.grade, read.basis));
  if (k && k.tight) return { price: k.price, source: 'KIND', n: k.n, jobs: k.jobs, family: fam };
  return null;
}

/** ILC's Sage Brands pick for a line: what we swapped this product to before, else our usual Sage Brands product for the kind and size. */
export function sagePickFor(line, read, t) {
  const fam = usableFamily(familyKey(line.mfr, line.catalog));
  if (isSageBrand(line.mfr, t.sage)) return null;
  const s = fam && t.sageSwap.get(`${fam}|${read.basis}`);
  if (s) return { family: s.family, price: s.price, source: 'SWAP', n: s.n };
  if (!read.kind || read.kind.noTypical) return null;
  const k = t.sageKind.get(`${read.kind.key}|${read.size || ''}|${read.basis}`);
  return k ? { family: k.family, price: k.price, source: 'KIND', n: k.n } : null;
}
