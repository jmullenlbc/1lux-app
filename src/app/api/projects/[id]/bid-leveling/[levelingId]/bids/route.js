import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { guardLeveling } from '@/lib/bidLeveling/guard';
import { bidLinesFromMatrix, bidLinesFromPeerReview, parsePastedLines } from '@/lib/bidLeveling/fromSources';
import { cleanCheckedLines } from '@/lib/bidLeveling/readQuote';
import { cents } from '@/lib/money';

const MAX_LINES = 3000;
const tooMany = (n) => `That quote has ${n.toLocaleString('en-US')} lines, more than the ${MAX_LINES.toLocaleString('en-US')} we can take, so nothing was saved. Split it into two quotes.`;
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
 *   { source: 'LINES', bidderName, lines, fileName, totals, ... }   a quote after "Check what we read" (10-26)
 * ILC bids keep CN only; DN never reaches a bid line.
 */
export async function POST(request, { params }) {
  const g = await guardLeveling(params);
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));

  let lines;
  let bid;
  if (b.source === 'MATRIX') {
    if (!Array.isArray(b.lines) || !b.lines.length) return NextResponse.json({ error: 'We found no fixture lines in that file, so nothing was saved. Check it is the peer review matrix.' }, { status: 400 });
    if (b.lines.length > MAX_LINES) return NextResponse.json({ error: tooMany(b.lines.length) }, { status: 400 });
    lines = bidLinesFromMatrix(b.lines);
    bid = { bidderName: 'ILC Studios', bidderType: 'ILC', isIlc: true, sourceKind: 'XLSX', sourceFileName: String(b.fileName || '').slice(0, 200) || null };
  } else if (b.source === 'PEER_REVIEW') {
    const items = await prisma.peerReviewItem.findMany({ where: { projectId: params.id }, orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }] });
    lines = bidLinesFromPeerReview(items);
    if (!lines.length) return NextResponse.json({ error: 'This project has no Peer Review rows with a fixture type yet, so nothing was added. Fill in Peer Review first.' }, { status: 400 });
    bid = { bidderName: 'ILC Studios', bidderType: 'ILC', isIlc: true, sourceKind: 'ILC_MATRIX', sourceMatrixId: params.id };
  } else if (b.source === 'PASTE' || b.source === 'LINES') {
    const name = String(b.bidderName || '').trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Type the bidder's company name so we know whose quote this is. Nothing was saved." }, { status: 400 });
    if (b.source === 'LINES') {
      if (Array.isArray(b.lines) && b.lines.length > MAX_LINES) return NextResponse.json({ error: tooMany(b.lines.length) }, { status: 400 });
      const checked = cleanCheckedLines(b.lines);
      if (checked.missingType) {
        return NextResponse.json({ error: `${checked.missingType} line${checked.missingType === 1 ? ' has' : 's have'} no fixture type, so nothing was saved. Type the type or remove the line.` }, { status: 400 });
      }
      lines = checked.lines;
    } else lines = parsePastedLines(b.text);
    if (lines.length > MAX_LINES) return NextResponse.json({ error: tooMany(lines.length) }, { status: 400 });
    const tax = num(b.taxRateStated);
    bid = {
      bidderName: name,
      bidderType: BIDDER_TYPES.has(b.bidderType) ? b.bidderType : 'UNKNOWN',
      isIlc: false,
      sourceKind: b.source === 'LINES' && /\.(xlsx|xls|csv)$/i.test(String(b.fileName || '')) ? 'XLSX' : 'MANUAL',
      sourceFileName: b.source === 'LINES' ? String(b.fileName || '').slice(0, 200) || null : null,
      quoteNumber: String(b.quoteNumber || '').trim().slice(0, 60) || null,
      quoteDate: dateOrNull(b.quoteDate),
      expiresAt: dateOrNull(b.expiresAt),
      drawingSetRef: String(b.drawingSetRef || '').trim().slice(0, 120) || null,
      taxRateStated: tax == null ? null : tax > 1 ? tax / 100 : tax,
      notesRaw: String(b.notesRaw || '').slice(0, 20000) || null,
    };
  } else {
    return NextResponse.json({ error: 'Your browser and our server got out of step, so nothing was saved. Refresh the page and try again.' }, { status: 400 });
  }

  const priced = lines.filter((l) => l.unitPrice != null || l.extPrice != null).length;
  const hasUnitPricing = lines.length > 0 && priced / lines.length >= 0.5;
  const totals = [];
  const given = b.source === 'PASTE' || b.source === 'LINES' ? (b.totals || {}) : {};
  BUCKETS.forEach((bucket, i) => {
    const amount = num(given[bucket]);
    if (amount != null) totals.push({ bucket, amount, sortOrder: i });
  });
  if (!totals.some((t) => t.bucket === 'FIXTURES') && hasUnitPricing) {
    totals.unshift({ bucket: 'FIXTURES', amount: cents(baseFixtures(lines)), sortOrder: 0 });
  }
  if (!lines.length && !totals.length) return NextResponse.json({ error: 'This quote has no lines and no totals, so nothing was saved. Add its lines or type its totals.' }, { status: 400 });

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
