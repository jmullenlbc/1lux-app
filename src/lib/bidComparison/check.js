/**
 * Bid Comparison check (Mike 10-21). Pure.
 *
 * Lines up two or more bids by type tag and rates every line:
 *   vs the other bids   HIGH / MEDIUM / LOW against the middle of the other
 *                       bids' prices for that type (2 or more bids)
 *   vs past jobs        HIGH / MEDIUM / LOW against the typical price, or
 *                       "Not enough data"; MEDIUM is within 15%
 * Each row also explains builder grade vs spec grade for its kind, and staff
 * see ILC's Sage Brands pick with the savings at the bid quantity.
 * forViewer trims the result for who is looking.
 */

import { normalizeTag } from '../bidLeveling/normalizeTag.js';
import { familyKey, normMfr } from '../specSwap/family.js';
import { readLine, defaultKinds, defaultBrandGrades, rangeText, pricedLike, GRADE_LABEL, isSageBrand } from './kinds.js';
import { levelOf, median, typicalFor, sagePickFor } from './typicals.js';

export const PAST_JOBS_WORDING = 'compared with similar fixtures on past jobs';
const LEVELS = ['HIGH', 'MEDIUM', 'LOW'];

function rowKeyOf(line) {
  const tag = String(line.typeTag ?? '').trim();
  if (tag) {
    const n = normalizeTag(tag, line);
    return { key: `${n.matchKey}|${n.variant}`, typeTag: n.typeTag + (n.variant && n.variant !== 'P' ? ` ${n.variant}` : '') };
  }
  const d = String(line.description ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  return d ? { key: `DESC|${d}`, typeTag: '' } : null;
}

/** One bid's lines folded by type: a type quoted twice sums its quantity and dollars. */
function foldBid(bid) {
  const m = new Map();
  for (const line of bid.lines || []) {
    const k = rowKeyOf(line);
    if (!k) continue;
    const qty = Number(line.qty) > 0 ? Number(line.qty) : 0;
    const price = Number(line.unitPrice) > 0 ? Number(line.unitPrice) : 0;
    const prev = m.get(k.key);
    if (!prev) {
      m.set(k.key, { ...k, line, qty, ext: price * (qty || 1), priced: price > 0 });
    } else {
      prev.qty += qty;
      prev.ext += price * (qty || 1);
      prev.priced = prev.priced || price > 0;
    }
  }
  for (const c of m.values()) c.unitPrice = c.priced ? c.ext / (c.qty || 1) : null;
  return m;
}

function explainerFor(kind, basis) {
  if (!kind) return null;
  if (kind.sageOnly) return { kind: kind.name, sageOnly: true, note: kind.builderNote };
  const per = basis === 'FT' ? 'a foot' : 'each';
  return {
    kind: kind.name,
    builder: { label: GRADE_LABEL.BUILDER, note: kind.builderNote, range: rangeText(kind, 'BUILDER', per) },
    spec: { label: GRADE_LABEL.SPEC, note: kind.specNote, range: rangeText(kind, 'SPEC', per) },
  };
}

/**
 * bids: [{ id, name, lines: [{ typeTag, description, mfr, catalog, qty, uom, unitPrice }] }]
 * typicals: buildTypicals(...) from past jobs.
 */
export function compareBids(bids, typicals, { kinds = defaultKinds(), brands = defaultBrandGrades(), sage: sageList = typicals.sage } = {}) {
  const folded = bids.map((b) => ({ bid: b, rows: foldBid(b) }));
  const order = [];
  const seen = new Set();
  for (const f of folded) for (const [k, c] of f.rows) if (!seen.has(k)) { seen.add(k); order.push([k, c]); }

  const rows = order.map(([key, first]) => {
    const cells = {};
    for (const { bid, rows: r } of folded) {
      const c = r.get(key);
      if (!c) continue;
      const read = readLine(c.line, { kinds, brands });
      const typical = c.unitPrice ? typicalFor(c.line, read, typicals) : null;
      cells[bid.id] = {
        unitPrice: c.unitPrice,
        qty: c.qty,
        ext: c.priced ? c.ext : null,
        mfr: normMfr(c.line.mfr) || null,
        sage: isSageBrand(c.line.mfr, sageList),
        catalog: c.line.catalog || null,
        family: familyKey(c.line.mfr, c.line.catalog),
        kindKey: read.kind?.key ?? null,
        size: read.size,
        grade: read.grade?.grade ?? null,
        gradeBy: read.grade?.by ?? null,
        pricedLike: c.unitPrice ? pricedLike(c.unitPrice, read.kind) : null,
        basis: read.basis,
        vsTypical: typical ? { level: levelOf(c.unitPrice, typical.price), ...typical } : null,
        vsBids: null,
        _read: read,
      };
    }
    const priced = Object.entries(cells).filter(([, c]) => c.unitPrice > 0);
    if (priced.length >= 2) {
      for (const [id, c] of priced) {
        const others = priced.filter(([o]) => o !== id).map(([, x]) => x.unitPrice);
        const ref = median(others);
        c.vsBids = { level: levelOf(c.unitPrice, ref), ref };
      }
    }
    const lead = cells[folded.find((f) => cells[f.bid.id])?.bid.id];
    const read = lead?._read;
    let sage = null;
    for (const { bid } of folded) {
      const c = cells[bid.id];
      if (!c) continue;
      sage = sagePickFor({ mfr: c.mfr, catalog: c.catalog }, c._read, typicals);
      if (sage) break;
    }
    if (sage) {
      sage.savings = {};
      for (const [id, c] of priced) {
        const s = (c.unitPrice - sage.price) * (c.qty || 1);
        if (s > 0) sage.savings[id] = s;
      }
    }
    for (const c of Object.values(cells)) delete c._read;
    return {
      key,
      typeTag: first.typeTag,
      description: first.line.description || '',
      kindKey: read?.kind?.key ?? null,
      kindName: read?.kind?.name ?? null,
      size: read?.size ?? null,
      basis: read?.basis ?? 'EA',
      explainer: explainerFor(read?.kind, read?.basis),
      cells,
      sage,
    };
  });

  const summary = folded.map(({ bid }) => {
    const counts = { vsTypical: { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 }, vsBids: { HIGH: 0, MEDIUM: 0, LOW: 0 } };
    let total = 0;
    let sageSavings = 0;
    for (const r of rows) {
      const c = r.cells[bid.id];
      if (!c) continue;
      total += c.ext || 0;
      if (c.unitPrice) counts.vsTypical[c.vsTypical?.level || 'NONE']++;
      if (c.vsBids?.level) counts.vsBids[c.vsBids.level]++;
      sageSavings += r.sage?.savings?.[bid.id] || 0;
    }
    return { id: bid.id, name: bid.name, total, counts, sageSavings };
  });

  const mix = [];
  const kindNames = new Map(kinds.map((k) => [k.key, k.name]));
  const dollars = new Map();
  for (const r of rows) {
    if (!r.kindKey) continue;
    for (const [id, c] of Object.entries(r.cells)) {
      if (!c.ext) continue;
      const k = `${r.kindKey}|${id}`;
      dollars.set(k, (dollars.get(k) || 0) + c.ext);
    }
  }
  const kindKeys = [...new Set(rows.map((r) => r.kindKey).filter(Boolean))];
  for (const kindKey of kindKeys) {
    const past = typicals.mix.get(kindKey) || null;
    const shares = {};
    const above = {};
    for (const s of summary) {
      if (!(s.total > 0)) continue;
      const share = (dollars.get(`${kindKey}|${s.id}`) || 0) / s.total;
      shares[s.id] = share;
      if (past && share > past.p75 && share - past.median >= 0.05) above[s.id] = true;
    }
    mix.push({ kindKey, name: kindNames.get(kindKey) || kindKey, shares, median: past?.median ?? null, p75: past?.p75 ?? null, above });
  }
  mix.sort((a, b) => Math.max(0, ...Object.values(b.shares)) - Math.max(0, ...Object.values(a.shares)));

  return { bids: summary, rows, mix, multiBid: bids.length >= 2 };
}

/**
 * Trim a result for the viewer.
 *   STAFF   Sales, Design and Pre-Con: everything.
 *   OUTSIDE owners, developers, GCs: levels only ("compared with similar
 *           fixtures on past jobs"), no typical dollars, no Sage Brands pick.
 *   REP     lighting reps: the bids side by side and vs each other only.
 */
export function forViewer(result, role) {
  if (role === 'STAFF') return result;
  const rep = role === 'REP';
  const rows = result.rows.map((r) => {
    const cells = {};
    for (const [id, c] of Object.entries(r.cells)) {
      const { family, vsTypical, sage: _sage, ...rest } = c;
      cells[id] = {
        ...rest,
        vsTypical: rep ? null : vsTypical ? { level: vsTypical.level, wording: PAST_JOBS_WORDING } : null,
      };
    }
    const { sage, ...row } = r;
    return { ...row, cells };
  });
  const bids = result.bids.map(({ sageSavings, counts, ...b }) => ({
    ...b,
    counts: rep ? { vsBids: counts.vsBids } : counts,
  }));
  const mix = rep ? result.mix.map(({ median: _m, p75: _p, above: _a, ...m }) => m) : result.mix.map(({ median: _m, p75: _p, ...m }) => m);
  return { ...result, bids, rows, mix };
}

export { LEVELS };
