/**
 * Bid Leveling math (Mike 10-18). Pure functions, no DB, no AI.
 *
 * A bid is { id, bidderName, isIlc, hasUnitPricing, lines[], totals[], flags[],
 * taxRateStated?, expiresAt?, bidderType? } with the same fields as the Bid,
 * BidLine, BidTotal and BidFlag rows.
 *
 * Rules that never bend:
 *  - Bids join on the type tag (normalizeTag), never on the description.
 *  - Scope a bid carries beyond the baseline is reported, never netted.
 *  - Placeholder dollars are their own subtotal and drive confidence.
 *  - A bid with no unit pricing levels at section totals only.
 */
import { normalizeTag, rollUpLengths, FOLD_VARIANTS } from './normalizeTag.js';
import { BID_FLAG_KEYS } from './bidFlags.js';

const NOT_PRICED = new Set(['NO_QUOTE', 'NOT_USED']);
const VARIANCE_PCT = 0.10;
const VARIANCE_UNITS = 25;
const VARIANCE_DOLLARS = 2500;
const TAX_TOLERANCE = 0.02;

const r2 = (n) => Math.round(n * 100) / 100;
const rowKey = (matchKey, variant) => (variant ? `${matchKey}/${variant}` : matchKey);
const num = (v) => (v == null || v === '' ? null : Number(v));

export function bucketSum(bid, bucket) {
  return (bid.totals || []).filter((t) => t.bucket === bucket).reduce((s, t) => s + Number(t.amount || 0), 0);
}

function lineUnitPrice(l) {
  const u = num(l.unitPrice);
  if (u != null) return u;
  const ext = num(l.extPrice);
  const q = num(l.qty);
  return ext != null && q > 0 ? ext / q : null;
}

/** Tag every line, then work out each type's unit (LF or EA) across all bids. */
function tagAll(bids) {
  const tagged = new Map();
  const uomHint = new Map();
  for (const bid of bids) {
    const lines = (bid.lines || []).map((l) => {
      const t = l.typeTag
        ? { typeTag: l.typeTag, variant: l.variant || '', lengthFt: num(l.lengthFt), matchKey: normalizeTag(l.typeTag).matchKey }
        : normalizeTag(l.typeTagRaw, l);
      return { ...l, ...t };
    });
    tagged.set(bid.id, lines);
    for (const l of lines) {
      if (l.lengthFt == null && !l.isAccessory && !l.variant && num(l.qty) > 0 && l.uom) {
        if (!uomHint.has(l.matchKey) || bid.isIlc) uomHint.set(l.matchKey, l.uom);
      }
    }
  }
  return { tagged, uomHint };
}

/** One cell per matrix row for one bid: lengths rolled up, poles folded in. */
function cellsForBid(lines, uomHint) {
  const groups = new Map();
  for (const l of lines) {
    const k = l.lengthFt != null ? rowKey(l.matchKey, '#LEN') : rowKey(l.matchKey, l.variant);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }

  const cells = new Map();
  const put = (matchKey, variant, cell) => cells.set(rowKey(matchKey, variant), { matchKey, variant, ...cell });

  for (const [k, ls] of groups) {
    const first = ls[0];
    if (k.endsWith('/#LEN')) {
      const roll = rollUpLengths(ls, uomHint.get(first.matchKey) || 'LF');
      put(first.matchKey, '', { ...pick(first), ...roll, typeTag: first.typeTag, specBasis: first.specBasis || null });
      continue;
    }
    const main = ls.filter((l) => !l.isAccessory);
    const acc = ls.filter((l) => l.isAccessory);
    const base = main.length ? main : ls;
    const priced = base.filter((l) => !NOT_PRICED.has(l.specBasis));
    // All quantities blank stays blank (null); a typed 0 stays 0.
    const qty = priced.some((l) => num(l.qty) != null) ? priced.reduce((s, l) => s + (num(l.qty) || 0), 0) : null;
    const exts = base.map((l) => {
      const u = lineUnitPrice(l);
      return num(l.extPrice) ?? (u != null && num(l.qty) != null ? u * num(l.qty) : null);
    });
    const accExt = acc.map((l) => num(l.extPrice));
    const allPriced = exts.every((e) => e != null) && accExt.every((e) => e != null);
    const extPrice = allPriced ? exts.reduce((s, e) => s + e, 0) + accExt.reduce((s, e) => s + e, 0) : null;
    const unitPrice = base.length === 1 && !acc.length ? lineUnitPrice(base[0]) : (extPrice != null && qty > 0 ? extPrice / qty : null);
    put(first.matchKey, first.variant, {
      ...pick(first),
      typeTag: first.typeTag,
      qty,
      uom: first.uom || 'EA',
      unitPrice,
      extPrice,
      specBasis: priced.length ? (first.specBasis || null) : (first.specBasis || 'NO_QUOTE'),
      lineNote: base.map((l) => l.lineNote).filter(Boolean).join('; ') || null,
      accessories: acc.length,
    });
  }

  // Fold pole lines (ZP1-P) into their head so a bid that prices the pole
  // inside the fixture lines up with one that prices it on its own line.
  for (const [k, c] of [...cells]) {
    if (!FOLD_VARIANTS.has(c.variant)) continue;
    const parent = cells.get(c.matchKey);
    cells.delete(k);
    if (!parent) { put(c.matchKey, '', { ...c, variant: '' }); continue; }
    const addExt = c.extPrice ?? (c.unitPrice != null && c.qty != null ? c.unitPrice * c.qty : 0);
    if (parent.extPrice != null) parent.extPrice += addExt;
    if (parent.qty > 0 && parent.extPrice != null) parent.unitPrice = parent.extPrice / parent.qty;
    parent.folded = [...(parent.folded || []), c.variant];
  }
  return cells;
}

function pick(l) {
  return {
    section: l.section || null,
    mfr: l.mfr || null,
    catalog: l.catalog || null,
    description: l.description || null,
    lineNote: l.lineNote || null,
    needsReview: !!l.needsReview,
    requestedMfr: l.requestedMfr || null,
    requestedCatalog: l.requestedCatalog || null,
  };
}

const hasQty = (c) => c && num(c.qty) > 0;

/**
 * Line up every bid on the type tag.
 * types[].cells[bidId] = { qty, uom, unitPrice, extPrice, specBasis, deltaQtyVsBaseline, uomMismatch }
 */
export function buildMatrix(bids, baselineBidId) {
  const { tagged, uomHint } = tagAll(bids);
  const cellsByBid = new Map(bids.map((b) => [b.id, cellsForBid(tagged.get(b.id), uomHint)]));
  const baseline = bids.find((b) => b.id === baselineBidId) || bids[0];
  const order = [baseline, ...bids.filter((b) => b !== baseline)];

  const rows = new Map();
  for (const bid of order) {
    for (const [k, c] of cellsByBid.get(bid.id)) {
      if (!rows.has(k)) rows.set(k, { key: k, matchKey: c.matchKey, typeTag: c.typeTag, variant: c.variant, section: c.section, cells: {} });
      rows.get(k).cells[bid.id] = c;
    }
  }

  const types = [];
  const scopeGaps = [];
  const qtyVariances = [];
  for (const row of rows.values()) {
    const base = row.cells[baseline.id];
    for (const bid of bids) {
      const c = row.cells[bid.id];
      if (!c || bid === baseline) continue;
      c.uomMismatch = hasQty(base) && hasQty(c) && base.uom !== c.uom;
      c.deltaQtyVsBaseline = hasQty(base) && hasQty(c) && !c.uomMismatch ? r2(c.qty - base.qty) : null;
      if (c.deltaQtyVsBaseline) {
        const delta = c.deltaQtyVsBaseline;
        // Both a real share and a real count, measured on the larger quantity
        // so the answer doesn't depend on which bid is the baseline.
        const pct = delta / Math.max(base.qty, c.qty);
        // Or a gap worth real money (Mike 10-18: $2,500), priced at whichever
        // bid states a unit price.
        const unit = c.unitPrice ?? base.unitPrice ?? null;
        const dollars = unit != null ? r2(Math.abs(delta) * unit) : null;
        if ((Math.abs(pct) > VARIANCE_PCT && Math.abs(delta) >= VARIANCE_UNITS) || (dollars != null && dollars >= VARIANCE_DOLLARS)) {
          qtyVariances.push({ typeTag: row.typeTag, variant: row.variant, key: row.key, baselineQty: base.qty, bidId: bid.id, qty: c.qty, delta, pct: r2(pct * 100) / 100, dollars });
        }
      }
    }
    const presentIn = bids.filter((b) => hasQty(row.cells[b.id])).map((b) => b.id);
    const missingIn = bids.filter((b) => !hasQty(row.cells[b.id])).map((b) => b.id);
    if (presentIn.length && missingIn.length) {
      scopeGaps.push({
        typeTag: row.typeTag, variant: row.variant, key: row.key, presentIn, missingIn,
        baselineQty: base?.qty ?? null,
        qtyByBid: Object.fromEntries(presentIn.map((id) => [id, row.cells[id].qty])),
        note: Object.fromEntries(missingIn.map((id) => [id, gapNote(row.cells[id])])),
      });
    }
    types.push(row);
  }
  qtyVariances.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { baselineBidId: baseline.id, types, scopeGaps, qtyVariances };
}

function gapNote(c) {
  if (!c) return 'Not on the bid';
  if (c.specBasis === 'NOT_USED') return 'Marked not used';
  if (c.specBasis === 'NO_QUOTE') return 'Marked no quote';
  if (num(c.qty) === 0 && c.lineNote) return `Zero quantity: ${c.lineNote}`;
  return 'Zero quantity';
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function placeholderFor(row, bidId, bids, matrixBaselineId, placeholders) {
  const others = bids
    .filter((b) => b.id !== bidId && b.hasUnitPricing)
    .map((b) => row.cells[b.id])
    .filter((c) => hasQty(c) && c.unitPrice != null && c.unitPrice > 0)
    .map((c) => c.unitPrice);
  if (others.length === 1) return { unit: others[0], basis: 'OTHER_BID' };
  if (others.length > 1) return { unit: median(others), basis: 'MEDIAN_OF_BIDS' };
  const set = (placeholders || []).find((p) =>
    normalizeTag(p.typeTag).matchKey === row.matchKey &&
    (p.variant || '') === (row.variant || '') &&
    (!p.bidId || p.bidId === bidId));
  if (set) return { unit: Number(set.unitPrice), basis: 'SET_BY_USER' };
  return { unit: 0, basis: 'NONE' };
}

function ratioOrFlat(mode, flat, own, ownFixtures, fixtures) {
  if (mode === 'FLAT') return Number(flat || 0);
  if (mode === 'AS_QUOTED') return own;
  return ownFixtures > 0 ? (own / ownFixtures) * fixtures : 0;
}

/**
 * Price every bid on the baseline's quantities.
 * settings: { freightMode, freightFlat, whMode, whFlat, taxRate, taxBase, placeholders[] }
 */
export function normalize(bids, baselineBidId, settings = {}, matrix = buildMatrix(bids, baselineBidId)) {
  const baseId = matrix.baselineBidId;
  const perBid = {};
  const extrasNotInBaseline = {};

  for (const bid of bids) {
    const controls = bucketSum(bid, 'CONTROLS');
    const adders = bucketSum(bid, 'ADDER');
    const spares = bucketSum(bid, 'SPARES');
    const ownFixtures = bucketSum(bid, 'FIXTURES');
    const flags = deriveFlags(bid);
    const notStatedFlags = BID_FLAG_KEYS.filter((f) => {
      const s = flags[f.key]?.state;
      return !s || s === 'NOT_STATED';
    }).length;

    if (!bid.hasUnitPricing) {
      const grand = bucketSum(bid, 'GRAND') || (ownFixtures + controls + adders + bucketSum(bid, 'FREIGHT') + bucketSum(bid, 'WAREHOUSING') + spares + bucketSum(bid, 'TAX'));
      perBid[bid.id] = {
        sectionOnly: true,
        fixturesMatched: null, fixturesPlaceholder: null, placeholderLines: [],
        fixtures: ownFixtures, controls, adders, spares,
        freight: bucketSum(bid, 'FREIGHT'), warehousing: bucketSum(bid, 'WAREHOUSING'), tax: bucketSum(bid, 'TAX'),
        grand,
        confidence: { level: 'LOW', placeholderShare: null, notStatedFlags, hasUnitPricing: false },
      };
      continue;
    }

    let fixturesMatched = 0;
    let fixturesPlaceholder = 0;
    const placeholderLines = [];
    let fixturesOwnQty = 0;
    const ownQtyLines = [];
    const extras = [];
    for (const row of matrix.types) {
      const base = row.cells[baseId];
      const c = row.cells[bid.id];
      if (hasQty(base)) {
        const sameUnit = !c?.uomMismatch;
        if (bid.id === baseId || (hasQty(c) && c.unitPrice != null && sameUnit)) {
          fixturesMatched += base.qty * (bid.id === baseId ? (c.unitPrice || 0) : c.unitPrice);
        } else {
          const p = placeholderFor(row, bid.id, bids, baseId, settings.placeholders);
          const amount = base.qty * p.unit;
          fixturesPlaceholder += amount;
          placeholderLines.push({ typeTag: row.typeTag, variant: row.variant, qty: base.qty, uom: base.uom, unitPlaceholder: p.unit, basis: p.basis, amount: r2(amount), uomMismatch: !!c?.uomMismatch });
        }
      } else if (base && base.qty == null && !NOT_PRICED.has(base.specBasis) && hasQty(c) && c.unitPrice != null) {
        // The baseline lists the type with a blank qty (0 or marked not used stays out): use the bidder's own qty, flagged.
        fixturesOwnQty += c.qty * c.unitPrice;
        ownQtyLines.push({ typeTag: row.typeTag, variant: row.variant, qty: c.qty, uom: c.uom, amount: r2(c.qty * c.unitPrice) });
      } else if (hasQty(c)) {
        extras.push({ typeTag: row.typeTag, variant: row.variant, qty: c.qty, uom: c.uom, extPrice: c.extPrice != null ? r2(c.extPrice) : null });
      }
    }

    const fixtures = fixturesMatched + fixturesPlaceholder + fixturesOwnQty;
    const freight = ratioOrFlat(settings.freightMode || 'RATIO', settings.freightFlat, bucketSum(bid, 'FREIGHT'), ownFixtures, fixtures);
    const warehousing = ratioOrFlat(settings.whMode || 'RATIO', settings.whFlat, bucketSum(bid, 'WAREHOUSING'), ownFixtures, fixtures);
    const taxRate = settings.taxRate ?? bid.taxRateStated ?? 0;
    const taxBase = settings.taxBase === 'FIXTURES' ? fixtures : fixtures + controls;
    const tax = taxRate * taxBase;
    const grand = fixtures + controls + adders + spares + freight + warehousing + tax;

    const placeholderShare = fixtures > 0 ? (fixturesPlaceholder + fixturesOwnQty) / fixtures : 0;
    perBid[bid.id] = {
      sectionOnly: false,
      fixturesMatched: r2(fixturesMatched), fixturesPlaceholder: r2(fixturesPlaceholder), placeholderLines,
      fixturesOwnQty: r2(fixturesOwnQty), ownQtyLines,
      fixtures: r2(fixtures), controls: r2(controls), adders: r2(adders), spares: r2(spares),
      freight: r2(freight), warehousing: r2(warehousing), tax: r2(tax), taxRate, grand: r2(grand),
      confidence: { level: confidenceLevel(placeholderShare, notStatedFlags, true), placeholderShare: r2(placeholderShare), notStatedFlags, hasUnitPricing: true },
    };
    if (bid.id !== baseId) extrasNotInBaseline[bid.id] = extras;
  }
  return { baselineBidId: baseId, perBid, extrasNotInBaseline };
}

export function confidenceLevel(placeholderShare, notStatedFlags, hasUnitPricing) {
  if (!hasUnitPricing) return 'LOW';
  if (placeholderShare < 0.10 && notStatedFlags <= 3) return 'HIGH';
  if (placeholderShare < 0.25 || notStatedFlags <= 6) return 'MEDIUM';
  return 'LOW';
}

/**
 * Stored flags plus what the numbers themselves prove: no unit pricing, a tax
 * line that doesn't reconcile, a quote past its date. Keyed by flag key.
 */
export function deriveFlags(bid, today = new Date()) {
  const out = {};
  for (const f of bid.flags || []) out[f.key] = { ...f };

  if (!out.unit_pricing) {
    out.unit_pricing = bid.hasUnitPricing
      ? { key: 'unit_pricing', state: 'INCLUDED', source: 'RULE' }
      : { key: 'unit_pricing', state: 'EXCLUDED', evidence: 'Priced by section only', source: 'RULE' };
  }

  const taxCheck = checkTax(bid);
  if (taxCheck && !taxCheck.reconciles) {
    out.tax = { key: 'tax', state: 'CONTRADICTION', value: String(r2(taxCheck.stated)), evidence: out.tax?.evidence || null, source: 'RULE', check: taxCheck };
  }

  if (bid.expiresAt && new Date(bid.expiresAt) < startOfDay(today)) {
    out.validity = { key: 'validity', state: 'EXPIRED', value: String(bid.expiresAt).slice(0, 10), source: 'RULE' };
  }
  return out;
}

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Stated tax against the stated rate on everything else the bid quoted. */
export function checkTax(bid) {
  const stated = bucketSum(bid, 'TAX');
  const rate = num(bid.taxRateStated);
  if (!stated || !rate) return null;
  // Bidders tax fixtures only, fixtures plus controls, or everything; any one
  // of them reconciling is fine. The message quotes the everything base.
  const sum = (bs) => bs.reduce((s, b) => s + bucketSum(bid, b), 0);
  const bases = [sum(['FIXTURES']), sum(['FIXTURES', 'CONTROLS']), sum(['FIXTURES', 'CONTROLS', 'ADDER', 'FREIGHT', 'WAREHOUSING', 'SPARES'])];
  const reconciles = bases.some((b) => b > 0 && Math.abs(stated - rate * b) / (rate * b) <= TAX_TOLERANCE);
  const base = bases[2];
  const computed = rate * base;
  return { stated, rate, base: r2(base), computed: r2(computed), impliedRate: base > 0 ? stated / base : null, reconciles };
}

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const pctText = (r) => `${r2(r * 100)}%`;
const list = (xs, max = 8) => (xs.length > max ? `${xs.slice(0, max).join(', ')} and ${xs.length - max} more` : xs.join(', '));
const fmtDate = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/**
 * Questions to send the bidder, most important first. Plain sentences, no
 * dashes (they go out in emails).
 */
export function buildClarifications(bid, matrix, { today = new Date(), bids = [] } = {}) {
  const out = [];
  const flags = deriveFlags(bid, today);
  const rows = matrix.types;
  const cell = (row) => row.cells[bid.id];
  const otherIds = bids.filter((b) => b.id !== bid.id).map((b) => b.id);

  if (!bid.hasUnitPricing) out.push('Provide unit pricing by type. Section totals cannot be leveled line by line.');

  if (flags.validity?.state === 'EXPIRED') out.push(`Quote expired ${fmtDate(bid.expiresAt)}. Reconfirm pricing and tariff exposure.`);

  if (flags.tax?.state === 'CONTRADICTION' && flags.tax.check) {
    const t = flags.tax.check;
    out.push(`Tax of ${money(t.stated)} does not match ${pctText(t.rate)} on ${money(t.base)} (${money(t.computed)}). Confirm the rate and what it is charged on.`);
  }

  if (flags.em_batteries?.state === 'EXCLUDED') {
    const types = rows.filter((r) => /\bno em\b|em battery/i.test(cell(r)?.lineNote || '')).map((r) => r.typeTag);
    out.push(`Confirm emergency batteries are excluded${types.length ? ` on ${list(types)}` : ''}, and provide an adder to include them.`);
  }

  if (flags.warehousing?.state === 'CONTRADICTION') out.push('Stage and store: is it included or not, and how many deliveries does it cover?');

  for (const r of rows) {
    const c = cell(r);
    if (c?.specBasis === 'ALLOWANCE' && num(c.qty) > 100) out.push(`${r.typeTag}: product, finish and allowance basis for ${c.qty.toLocaleString('en-US')} ${c.uom === 'LF' ? 'feet' : 'units'}.`);
  }

  const zeroes = rows.filter((r) => {
    const c = cell(r);
    return c && num(c.qty) === 0 && (c.lineNote || otherIds.some((id) => hasQty(r.cells[id])));
  }).map((r) => r.typeTag);
  if (zeroes.length) out.push(`${list(zeroes)}: quoted at zero. Priced or excluded?`);

  const missing = rows.filter((r) => !cell(r) && otherIds.some((id) => hasQty(r.cells[id]))).map((r) => r.typeTag + (r.variant ? ` ${r.variant}` : ''));
  if (missing.length) out.push(`${list(missing)}: not on this quote. Price them or confirm they are excluded.`);

  const noQuote = rows.filter((r) => NOT_PRICED.has(cell(r)?.specBasis) && otherIds.some((id) => hasQty(r.cells[id]))).map((r) => r.typeTag);
  if (noQuote.length) out.push(`${list(noQuote)}: marked no quote or not used, but another bid carries them. Confirm.`);

  const unitClash = rows.filter((r) => hasQty(cell(r)) && Object.values(r.cells).some((c) => c.uomMismatch)).map((r) => `${r.typeTag} (${cell(r).uom})`);
  if (unitClash.length) out.push(`${list(unitClash)}: quoted in a different unit than the other bids. Confirm feet or count.`);

  const variances = matrix.qtyVariances.filter((v) => v.bidId === bid.id || (bid.id === matrix.baselineBidId));
  if (variances.length) {
    const tags = [...new Set(variances.map((v) => v.typeTag))];
    out.push(`Quantities differ from the other bids on ${list(tags, 6)}. Confirm counts against the drawings.`);
  }

  if (flags.escalation?.state === 'INCLUDED') out.push('Tariff clause: when is final pricing locked, and how will increases be shown?');

  if ((flags.channel_type?.state || 'NOT_STATED') === 'NOT_STATED' && !bid.isIlc) {
    out.push('Is this contractor net or distributor net? Who was it addressed to?');
  }
  return out;
}
