import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { guardLeveling } from '@/lib/bidLeveling/guard';
import { bidLinesFromMatrix, bidLinesFromPeerReview, parsePastedLines } from '@/lib/bidLeveling/fromSources';

const MAX_LINES = 3000;
const BUCKETS = ['FIXTURES', 'CONTROLS', 'ADDER', 'FREIGHT', 'WAREHOUSING', 'SPARES', 'TAX', 'GRAND'];
const BIDDER_TYPES = new Set(['REP', 'DISTRIBUTOR', 'CONTRACTOR_NET', 'UNKNOWN']);
const num = (v) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return v === '' || v == null || !Number.isFinite(n) ? null : n;
};
const dateOrNull = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const baseFixtures = (lines) => lines
  .filter((l) => l.optionGroup === 'BASE' && !['NOT_USED', 'NO_QUOTE'].includes(l.specBasis))
  .reduce((s, l) => s + (l.extPrice ?? 0), 0);

/**
 * POST /api/projects/[id]/bid-leveling/[levelingId]/bids
 *   { source: 'MATRIX', fileName, lines }   ILC matrix read in the browser (readMatrix.js newestLines)
 *   { source: 'PEER_REVIEW' }               this project's Peer Review rows as the ILC bid
 *   { source: 'PASTE', bidderName, text, totals: { FIXTURES, ... }, quoteDate, expiresAt, ... }
 * ILC bids keep CN only; DN never reaches a bid line.
 */
export async function POST(request, { params }) {
  const g = await guardLeveling(params);
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));

  let lines;
  let bid;
  if (b.source === 'MATRIX') {
    if (!Array.isArray(b.lines) || !b.lines.length) return NextResponse.json({ error: 'No fixture lines found in that file' }, { status: 400 });
    if (b.lines.length > MAX_LINES) return NextResponse.json({ error: `Too many lines (${b.lines.length})` }, { status: 400 });
    lines = bidLinesFromMatrix(b.lines);
    bid = { bidderName: 'ILC Studios', bidderType: 'ILC', isIlc: true, sourceKind: 'XLSX', sourceFileName: String(b.fileName || '').slice(0, 200) || null };
  } else if (b.source === 'PEER_REVIEW') {
    const items = await prisma.peerReviewItem.findMany({ where: { projectId: params.id }, orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }] });
    lines = bidLinesFromPeerReview(items);
    if (!lines.length) return NextResponse.json({ error: 'This project has no Peer Review rows with a type tag' }, { status: 400 });
    bid = { bidderName: 'ILC Studios', bidderType: 'ILC', isIlc: true, sourceKind: 'ILC_MATRIX', sourceMatrixId: params.id };
  } else if (b.source === 'PASTE') {
    const name = String(b.bidderName || '').trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: 'Name the bidder' }, { status: 400 });
    lines = parsePastedLines(b.text);
    if (lines.length > MAX_LINES) return NextResponse.json({ error: `Too many lines (${lines.length})` }, { status: 400 });
    const tax = num(b.taxRateStated);
    bid = {
      bidderName: name,
      bidderType: BIDDER_TYPES.has(b.bidderType) ? b.bidderType : 'UNKNOWN',
      isIlc: false,
      sourceKind: 'MANUAL',
      quoteNumber: String(b.quoteNumber || '').trim().slice(0, 60) || null,
      quoteDate: dateOrNull(b.quoteDate),
      expiresAt: dateOrNull(b.expiresAt),
      drawingSetRef: String(b.drawingSetRef || '').trim().slice(0, 120) || null,
      taxRateStated: tax == null ? null : tax > 1 ? tax / 100 : tax,
      notesRaw: String(b.notesRaw || '').slice(0, 20000) || null,
    };
  } else {
    return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
  }

  const priced = lines.filter((l) => l.unitPrice != null || l.extPrice != null).length;
  const hasUnitPricing = lines.length > 0 && priced / lines.length >= 0.5;
  const totals = [];
  const given = b.source === 'PASTE' ? (b.totals || {}) : {};
  BUCKETS.forEach((bucket, i) => {
    const amount = num(given[bucket]);
    if (amount != null) totals.push({ bucket, amount, sortOrder: i });
  });
  if (!totals.some((t) => t.bucket === 'FIXTURES') && hasUnitPricing) {
    totals.unshift({ bucket: 'FIXTURES', amount: Math.round(baseFixtures(lines) * 100) / 100, sortOrder: 0 });
  }
  if (!lines.length && !totals.length) return NextResponse.json({ error: 'Paste the quote lines or type its totals' }, { status: 400 });

  const sortOrder = await prisma.bid.count({ where: { levelingId: g.leveling.id } });
  const created = await prisma.bid.create({
    data: {
      ...bid,
      levelingId: g.leveling.id,
      hasUnitPricing,
      extractStatus: 'REVIEWED',
      sortOrder,
      lines: { create: lines },
      totals: { create: totals },
    },
    select: { id: true, bidderName: true, isIlc: true },
  });
  // The first ILC bid is the baseline unless someone already picked one.
  if (created.isIlc && !g.leveling.baselineBidId) {
    await prisma.bidLeveling.update({ where: { id: g.leveling.id }, data: { baselineBidId: created.id } });
  }
  return NextResponse.json({ bid: created, lines: lines.length }, { status: 201 });
}
