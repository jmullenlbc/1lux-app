/**
 * Pure helpers for the Bid Leveling screen (no database), so tests and the
 * loader share them.
 */
import { normalizeTag } from './normalizeTag.js';
import { cents as r2, sumCents } from '../money.js';

const lineExt = (l) => (l.extPrice != null ? l.extPrice : l.unitPrice != null && l.qty != null ? r2(l.unitPrice * l.qty) : 0);

/** VE and alternate packages per bid, with what the base bid pays for the same types. */
export function packagesFor(bid) {
  const keyOf = (l) => normalizeTag(l.typeTag || l.typeTagRaw).matchKey;
  const base = new Map();
  for (const l of bid.lines.filter((x) => x.optionGroup === 'BASE')) base.set(keyOf(l), r2((base.get(keyOf(l)) || 0) + lineExt(l)));
  const groups = new Map();
  for (const l of bid.lines.filter((x) => x.optionGroup !== 'BASE')) {
    if (!groups.has(l.optionGroup)) groups.set(l.optionGroup, []);
    groups.get(l.optionGroup).push(l);
  }
  return [...groups.entries()].map(([group, lines]) => {
    const total = sumCents(lines.map(lineExt));
    const tags = [...new Set(lines.map(keyOf))];
    const baseSame = tags.reduce((s, k) => s + (base.get(k) || 0), 0);
    return { group, lines: lines.length, types: [...new Set(lines.map((l) => l.typeTag))], total: r2(total), baseSameTypes: r2(baseSame), savings: r2(baseSame - total) };
  });
}

/** The spec the drawings asked for on each type: a bid's requested columns, ILC first. */
export function requestedSpecs(bids) {
  const out = new Map();
  const ordered = [...bids.filter((b) => b.isIlc), ...bids.filter((b) => !b.isIlc)];
  for (const b of ordered) {
    for (const l of b.lines) {
      const k = normalizeTag(l.typeTag || l.typeTagRaw).matchKey;
      if (out.has(k) || !(l.requestedMfr || l.requestedCatalog)) continue;
      out.set(k, { mfr: l.requestedMfr, catalog: l.requestedCatalog, description: l.description });
    }
  }
  // No requested columns: a competitor quoting the spec as drawn tells us the spec.
  for (const b of bids.filter((x) => !x.isIlc)) {
    for (const l of b.lines) {
      const k = normalizeTag(l.typeTag || l.typeTagRaw).matchKey;
      if (out.has(k) || !(l.mfr && l.catalog)) continue;
      out.set(k, { mfr: l.mfr, catalog: l.catalog, description: l.description, fromOffer: true });
    }
  }
  return out;
}
