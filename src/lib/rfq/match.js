// Match the lines of a rep quote to the RFQ lines they price (Mike 10-29:
// "assume the prices for all lines it has a 75% confidence or higher is right
// and others it asks which line"). Pure, no AI, browser safe.
//
// Score out of 1:  type tag 0.55, part number 0.55 exact or up to 0.25 close,
// manufacturer 0.1, quantity 0.1. Tag + manufacturer + quantity is 0.75, so a
// line with the right type, maker and count is taken without asking.
//
// Several rows can add up on one RFQ line (housing, trim, optic), and one row can
// name several types (Mike 10-31). When unsure it asks: a wrong add up doubles a price.
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

// A row can name several types ("C2, C4 & W9"). A slash stays: it can be part of a tag.
export const rowTags = (typeTag) => [...new Set(String(typeTag || '').split(/[,;&+]|\band\b/i).map(matchKeyOf).filter(Boolean))];

export function scorePair(q, r) {
  let s = 0;
  const key = matchKeyOf(r.typeCode);
  if (key && rowTags(q.typeTag).includes(key)) s += 0.55;
  s += partScore(q.catalog, r.partNumber);
  const qm = mfrKey(q.manufacturer);
  const rm = mfrKey(r.manufacturer);
  if (qm && rm && (qm === rm || qm.startsWith(rm) || rm.startsWith(qm))) s += 0.1;
  if (q.qty != null && r.qty != null && Number(q.qty) === Number(r.qty)) s += 0.1;
  return Math.min(1, Math.round(s * 100) / 100);
}

// One clear best line per type, or null to ask. The row's quantity is the total of
// the lines it names, so that total earns the quantity point.
function splitRow(q, rfqLines) {
  const best = [];
  for (const tag of rowTags(q.typeTag)) {
    const ranked = rfqLines.filter((r) => matchKeyOf(r.typeCode) === tag)
      .map((line) => ({ line, score: scorePair({ ...q, qty: null }, line) }))
      .sort((a, b) => b.score - a.score);
    if (!ranked.length || ranked[0].score === ranked[1]?.score) return null;
    best.push(ranked[0].line);
  }
  const total = best.reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const fits = q.qty != null && Number(q.qty) === total;
  return best.map((line) => ({ line, score: scorePair({ ...q, qty: fits ? line.qty : q.qty }, line) }));
}

const ALTERNATE = /\b(alt|alternate|option|optional|or equal|substitute)\b/i;
const wholeFixture = (row, line) => !!squash(row.catalog) && squash(row.catalog) === squash(line.partNumber);

/**
 * quoteLines: [{ typeTag, catalog, manufacturer, qty, unitPrice }]
 * rfqLines:   [{ id, typeCode, partNumber, manufacturer, qty }]
 * Returns one result per quote line, same order:
 *   { rfqLineIds, confidence, status: 'AUTO' | 'OPEN', options: [{ rfqLineId, score }] }
 * Best rows go first and a tie at the top always asks. A second row only adds to
 * an RFQ line when it is a different part: the same catalog, an alternate, or a
 * row that is the line's whole part number asks instead.
 */
export function matchQuote(quoteLines, rfqLines) {
  const scored = quoteLines.map((q) => rfqLines
    .map((r) => ({ rfqLineId: r.id, score: scorePair(q, r) }))
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score));

  const result = scored.map((options) => ({ rfqLineIds: [], confidence: options[0]?.score ?? 0, status: 'OPEN', options: options.slice(0, 5) }));
  const lineOf = new Map(rfqLines.map((r) => [r.id, r]));
  const onLine = new Map(); // RFQ line id -> this quote's rows on it

  const canAdd = (row, line) => {
    const rows = onLine.get(line.id) || [];
    if (!rows.length) return true;
    if (ALTERNATE.test(`${row.catalog || ''} ${row.description || ''}`)) return false;
    return ![row, ...rows].some((x) => wholeFixture(x, line)) && !rows.some((x) => squash(x.catalog) === squash(row.catalog));
  };

  const order = quoteLines.map((_, i) => i).sort((a, b) => result[b].confidence - result[a].confidence);
  for (const i of order) {
    const q = quoteLines[i];
    if (!(q.unitPrice > 0)) continue;
    const opts = scored[i];
    const tie = opts.length > 1 && opts[0].score === opts[1].score;
    const picks = rowTags(q.typeTag).length > 1
      ? splitRow(q, rfqLines)
      : (opts.length && !tie ? [{ line: lineOf.get(opts[0].rfqLineId), score: opts[0].score }] : null);
    if (!picks || picks.some((p) => p.score < AUTO_AT || !canAdd(q, p.line))) continue;
    for (const { line } of picks) onLine.set(line.id, [...(onLine.get(line.id) || []), q]);
    result[i].rfqLineIds = picks.map((p) => p.line.id);
    result[i].confidence = Math.min(...picks.map((p) => p.score));
    result[i].status = 'AUTO';
  }
  return result;
}
