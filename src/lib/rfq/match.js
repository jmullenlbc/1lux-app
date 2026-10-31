// Match the lines of a rep quote to the RFQ lines they price (Mike 10-29:
// "assume the prices for all lines it has a 75% confidence or higher is right
// and others it asks which line"). Pure, no AI, browser safe.
//
// Score out of 1:  type tag 0.55, part number 0.55 exact or up to 0.25 close,
// manufacturer 0.1, quantity 0.1. Tag + manufacturer + quantity is 0.75, so a
// line with the right type, maker and count is taken without asking.
import { matchKeyOf } from '../bidLeveling/normalizeTag.js';

export const AUTO_AT = 0.75;

const squash = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const words = (s) => new Set(String(s || '').toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length > 1));
const mfrKey = (s) => squash(String(s || '').replace(/\b(inc|llc|co|corp|lighting|ltg)\b/gi, ''));

function partScore(a, b) {
  const x = squash(a);
  const y = squash(b);
  if (!x || !y) return 0;
  if (x === y) return 0.55;
  if (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x))) return 0.25;
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let same = 0;
  for (const w of wa) if (wb.has(w)) same += 1;
  return 0.25 * (same / Math.max(wa.size, wb.size));
}

export function scorePair(q, r) {
  let s = 0;
  const qt = matchKeyOf(q.typeTag);
  if (qt && qt === matchKeyOf(r.typeCode)) s += 0.55;
  s += partScore(q.catalog, r.partNumber);
  const qm = mfrKey(q.manufacturer);
  const rm = mfrKey(r.manufacturer);
  if (qm && rm && (qm === rm || qm.startsWith(rm) || rm.startsWith(qm))) s += 0.1;
  if (q.qty != null && r.qty != null && Number(q.qty) === Number(r.qty)) s += 0.1;
  return Math.min(1, Math.round(s * 100) / 100);
}

/**
 * quoteLines: [{ typeTag, catalog, manufacturer, qty, unitPrice }]
 * rfqLines:   [{ id, typeCode, partNumber, manufacturer, qty }]
 * Returns one result per quote line, same order:
 *   { rfqLineId, confidence, status: 'AUTO' | 'OPEN', options: [{ rfqLineId, score }] }
 * Best pairs are taken first; an RFQ line is only auto-priced once, and a tie
 * at the top always asks.
 */
export function matchQuote(quoteLines, rfqLines) {
  const scored = quoteLines.map((q) => rfqLines
    .map((r) => ({ rfqLineId: r.id, score: scorePair(q, r) }))
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score));

  const result = scored.map((options) => ({ rfqLineId: null, confidence: options[0]?.score ?? 0, status: 'OPEN', options: options.slice(0, 5) }));
  const pairs = [];
  scored.forEach((opts, qi) => opts.forEach((o) => pairs.push({ qi, ...o })));
  pairs.sort((a, b) => b.score - a.score);

  const taken = new Set();
  for (const p of pairs) {
    if (p.score < AUTO_AT) break;
    const res = result[p.qi];
    if (res.status === 'AUTO' || taken.has(p.rfqLineId) || !(quoteLines[p.qi].unitPrice > 0)) continue;
    const opts = scored[p.qi];
    const tie = opts.length > 1 && opts[0].score === opts[1].score;
    if (tie || opts[0].rfqLineId !== p.rfqLineId) continue;
    res.rfqLineId = p.rfqLineId;
    res.status = 'AUTO';
    taken.add(p.rfqLineId);
  }
  return result;
}
