// RFQ versions and rounds, worked out from the sends themselves (Mike 11-1). Pure and
// browser safe. Every send keeps its own lines, so a round's picture is a walk through
// the sends up to it. A rep left out of a round carries their last prices forward.
import { cents, sumCents } from '../money.js';
import { normName } from './format.js';

export const familyOf = (r) => r.familyNumber ?? r.number;
const versionOf = (r) => r.version || 1;
const roundOf = (r) => r.roundNumber ?? versionOf(r); // an RFQ with no round counts by its version

const fallbackKey = (l) => `${String(l.typeCode || '').trim().toUpperCase()}|${normName(l.manufacturer)}`;
export const lineKey = (l) => l.peerReviewItemId || fallbackKey(l);

const extOf = (e) => (e.price == null ? 0 : cents((Number(e.qty) || 0) * e.price));

/** Where every line stands once the sends up to a round are in. Map of key to line. */
export function snapshotAt(rfqs, roundNumber = Infinity) {
  const snap = new Map();
  const order = rfqs.filter((r) => roundOf(r) <= roundNumber).sort((a, b) => a.number - b.number);
  for (const r of order) {
    const family = familyOf(r);
    const keys = new Set((r.lines || []).map(lineKey));
    // A full revision is the rep's whole list, so anything left off it is gone. An add-on only adds.
    if (versionOf(r) > 1 && !r.addOn) for (const [k, v] of snap) if (v.family === family && !keys.has(k)) snap.delete(k);
    for (const l of r.lines || []) {
      const key = lineKey(l);
      const before = snap.get(key);
      const priced = l.dnPrice != null;
      snap.set(key, {
        key, lineId: l.id, rfqId: r.id, family, repName: r.toName || '',
        typeCode: l.typeCode || '', manufacturer: l.manufacturer || '', partNumber: l.partNumber || '', qty: l.qty ?? null,
        price: priced ? l.dnPrice : before?.price ?? null,
        waiting: !priced && before?.price != null, // the last price stands until the rep answers
      });
    }
  }
  return snap;
}

export const snapshotTotal = (snap) => sumCents([...snap.values()].map(extOf));

/** The ids of the RFQ lines still in play, for matching a new quote. */
export function currentLineIds(rfqs) {
  return new Set([...snapshotAt(rfqs).values()].map((e) => e.lineId));
}

const samePart = (a, b) => normName(a.partNumber) === normName(b.partNumber);
const sameQty = (a, b) => (Number(a.qty) || 0) === (Number(b.qty) || 0);

function changeName(a, b) {
  const part = !samePart(a, b);
  const price = a.price !== b.price;
  const qty = !sameQty(a, b);
  if (part && price) return 'Part and price';
  if (part && qty) return 'Part and quantity';
  if (part) return 'Part changed';
  if (price && qty) return 'Price and quantity';
  if (price) return 'Price';
  return qty ? 'Quantity' : 'Unchanged';
}

// Lines are paired on the matrix line; a line that lost it pairs on type and manufacturer.
function pairUp(a, b) {
  const left = new Map(a);
  const right = new Map(b);
  const pairs = [];
  for (const [k, x] of left) {
    if (right.has(k)) {
      pairs.push([x, right.get(k)]);
      left.delete(k);
      right.delete(k);
    }
  }
  for (const [k, x] of left) {
    const hit = [...right.entries()].find(([, y]) => fallbackKey(y) === fallbackKey(x));
    if (hit) {
      pairs.push([x, hit[1]]);
      left.delete(k);
      right.delete(hit[0]);
    }
  }
  return [...pairs, ...[...left.values()].map((x) => [x, null]), ...[...right.values()].map((y) => [null, y])];
}

/** Every line side by side, with the total change split so the parts add up to the cent. */
export function compareSnapshots(a, b) {
  const rows = [];
  const parts = { price: [], quantity: [], added: [], removed: [], firstPriced: [] };
  for (const [x, y] of pairUp(a, b)) {
    const ea = x ? extOf(x) : 0;
    const eb = y ? extOf(y) : 0;
    let change;
    if (!x) {
      change = 'Added';
      parts.added.push(eb);
    } else if (!y) {
      change = 'Removed';
      parts.removed.push(-ea);
    } else if (x.price == null && y.price != null) {
      change = 'First price';
      parts.firstPriced.push(eb);
    } else {
      change = changeName(x, y);
      if (x.price != null && y.price != null) {
        const quantity = cents(((Number(y.qty) || 0) - (Number(x.qty) || 0)) * x.price);
        parts.quantity.push(quantity);
        parts.price.push(cents(eb - ea - quantity));
      }
    }
    rows.push({
      key: (y || x).key, typeCode: (y || x).typeCode, manufacturer: (y || x).manufacturer, change, waiting: !!y?.waiting,
      a: x ? { qty: x.qty, price: x.price, ext: ea, partNumber: x.partNumber } : null,
      b: y ? { qty: y.qty, price: y.price, ext: eb, partNumber: y.partNumber } : null,
      difference: cents(eb - ea),
    });
  }
  rows.sort((p, q) => (p.change === 'Unchanged') - (q.change === 'Unchanged') || p.typeCode.localeCompare(q.typeCode));
  const totals = { a: snapshotTotal(a), b: snapshotTotal(b) };
  return {
    rows,
    ...totals,
    change: cents(totals.b - totals.a),
    price: sumCents(parts.price),
    quantity: sumCents(parts.quantity),
    added: sumCents(parts.added),
    removed: sumCents(parts.removed),
    firstPriced: sumCents(parts.firstPriced),
  };
}

const usd = (n) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const signed = (n) => `${n < 0 ? '-' : '+'}${usd(n)}`;

/** "Round 3 GMP is $418,900, up $6,600 from Round 2 VE: +$4,900 price, -$800 removed lines." */
export function compareSentence(cmp, aName, bName) {
  const bits = [[cmp.price, 'price'], [cmp.quantity, 'quantity'], [cmp.added, 'added lines'], [cmp.removed, 'removed lines'], [cmp.firstPriced, 'first prices']]
    .filter(([n]) => n !== 0).map(([n, what]) => `${signed(n)} ${what}`);
  if (cmp.change === 0 && !bits.length) return `${bName} is ${usd(cmp.b)}, the same as ${aName}.`;
  const move = cmp.change === 0 ? `the same total as ${aName}` : `${cmp.change > 0 ? 'up' : 'down'} ${usd(cmp.change)} from ${aName}`;
  return `${bName} is ${usd(cmp.b)}, ${move}${bits.length ? `: ${bits.join(', ')}` : ''}.`;
}

/** What changed for a rep since their last version. No prices: the rep sees this. */
export function revisionChanges(before, after, { addOn = false } = {}) {
  const now = new Map(after.map((l) => [lineKey(l), l]));
  const out = [];
  for (const [key, l] of now) {
    const was = before.get(key);
    const type = l.typeCode || 'Line';
    if (!was) {
      out.push({ kind: 'Added', typeCode: type, text: `${type}: added` });
      continue;
    }
    if (!sameQty(was, l)) out.push({ kind: 'Quantity', typeCode: type, text: `${type}: quantity ${was.qty ?? 0} to ${l.qty ?? 0}` });
    if (!samePart(was, l)) out.push({ kind: 'Part', typeCode: type, text: `${type}: part number now ${l.partNumber || 'blank'}` });
  }
  if (!addOn) for (const [key, was] of before) if (!now.has(key)) out.push({ kind: 'Removed', typeCode: was.typeCode, text: `${was.typeCode || 'Line'}: removed` });
  return out;
}

/** A family's picture just before one of its versions. */
export function familyBefore(rfqs, rfq) {
  const family = familyOf(rfq);
  return snapshotAt(rfqs.filter((r) => familyOf(r) === family && r.number < rfq.number));
}

/** One row per round for the Compare screen and the round strip. */
export function roundsFor(rounds, rfqs) {
  return [...rounds].sort((a, b) => a.number - b.number).map((round) => {
    const snap = snapshotAt(rfqs, round.number);
    const lines = [...snap.values()];
    const sent = rfqs.filter((r) => roundOf(r) === round.number);
    const sentReps = [...new Set(sent.map((r) => r.toName))];
    return {
      id: round.id, number: round.number, name: round.name || '', createdAt: round.createdAt,
      total: snapshotTotal(snap), lineCount: lines.length, pricedCount: lines.filter((l) => l.price != null).length,
      waiting: lines.filter((l) => l.waiting).length,
      sentReps, carriedReps: [...new Set(lines.map((l) => l.repName))].filter((n) => !sentReps.includes(n)),
      lines,
    };
  });
}

/** Rebuilds a snapshot from a round row, which travels as a plain list. */
export const snapshotOfRound = (round) => new Map((round?.lines || []).map((l) => [l.key, l]));
