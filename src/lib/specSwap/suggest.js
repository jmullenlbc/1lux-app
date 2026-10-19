/**
 * "We suggest" (Mike 10-18). Pure: given an original spec line and the
 * learned SpecSwap rows, rank what ILC proposed for that spec on past jobs.
 *
 *   1. Same brand + catalog family (LITHONIA|FMML-13)      match FAMILY
 *   2. Else same brand + same category (Lithonia strips)    match BRAND_CATEGORY
 *   3. Else same category, any brand (any 4 ft strip)      match CATEGORY
 * Ranked by how many past jobs used the swap, then by how recent.
 * Unit prices are CN and internal only; the screen never shows them to a contractor.
 */
import { familyKey, normMfr, splitCatalog, categoryOf } from './family.js';

const CCT_CODES = { 27: '2700', 30: '3000', 35: '3500', 40: '4000', 50: '5000', 827: '2700', 830: '3000', 835: '3500', 840: '4000', 850: '5000', 930: '3000', 935: '3500', 940: '4000' };

/** Colour temperature in plain Kelvin (840 and 40K both read 4000), or the code as written. */
export function cctOf(code) {
  if (!code) return null;
  const c = String(code).toUpperCase().replace(/K$/, '');
  if (/^\d{4}$/.test(c)) return c;
  return CCT_CODES[c] || c;
}

function median(nums) {
  const v = nums.filter((n) => typeof n === 'number' && n > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function time(d) {
  const t = d ? new Date(d).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function rank(rows) {
  const groups = new Map();
  for (const s of rows) {
    const key = s.outcome === 'KEPT' ? 'KEPT' : (s.propFamily || normMfr(s.propMfr) || '?');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const jobs = new Set(list.map((s) => s.sourceName));
      const products = new Map();
      for (const s of list) if (s.productId) products.set(s.productId, (products.get(s.productId) || 0) + 1);
      const catalogs = new Map();
      for (const s of list) {
        const c = String(s.propCatalog || '').split(/\r?\n/)[0].trim();
        if (c) catalogs.set(c, (catalogs.get(c) || 0) + 1);
      }
      return {
        key,
        kept: key === 'KEPT',
        propMfr: list[0].propMfr || null,
        propFamily: key === 'KEPT' ? null : key,
        exampleCatalog: [...catalogs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        productId: [...products.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        jobs: jobs.size,
        lines: list.length,
        lastSeen: list.reduce((best, s) => (time(s.sheetDate || s.createdAt) > time(best) ? (s.sheetDate || s.createdAt) : best), null),
        medianUnitCn: median(list.map((s) => s.unitCn)),
        jobNames: [...jobs].slice(0, 5),
      };
    })
    .sort((a, b) => b.jobs - a.jobs || time(b.lastSeen) - time(a.lastSeen) || b.lines - a.lines);
}

/**
 * @param {{ mfr, catalog, description? }} spec   the original spec line
 * @param {Array} swaps   SpecSwap rows (archived rows already left out)
 * @returns {{ match, familyKey, cct, options: Array }}
 */
export function suggestFor(spec, swaps, { limit = 3 } = {}) {
  const key = familyKey(spec.mfr, spec.catalog);
  const { options } = splitCatalog(spec.catalog);
  const cct = cctOf(options.cct);
  const usable = swaps.filter((s) => s.outcome === 'SWAPPED' || s.outcome === 'KEPT');

  if (key) {
    const hits = usable.filter((s) => s.origFamily === key);
    if (hits.length) return { match: 'FAMILY', familyKey: key, cct, options: rank(hits).slice(0, limit) };
  }
  const brand = normMfr(spec.mfr);
  const category = categoryOf(spec.description || '', spec.catalog || '');
  if (brand && category !== 'other') {
    const hits = usable.filter((s) => normMfr(s.origMfr) === brand && s.category === category);
    if (hits.length) return { match: 'BRAND_CATEGORY', familyKey: key, cct, options: rank(hits).slice(0, limit) };
  }
  if (category !== 'other') {
    const hits = usable.filter((s) => s.outcome === 'SWAPPED' && s.category === category);
    if (hits.length) return { match: 'CATEGORY', familyKey: key, cct, options: rank(hits).slice(0, limit) };
  }
  return { match: 'NONE', familyKey: key, cct, options: [] };
}
