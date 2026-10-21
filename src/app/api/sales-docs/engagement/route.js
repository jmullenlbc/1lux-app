import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser } from '@/lib/salesDocs/access';
import { UNIT_SEEN_MS, VIEWING_NOW_MS, formatDuration } from '@/lib/salesDocs/tracking';

// GET /api/sales-docs/engagement
//   ?docId=&spaceId=&linkId=&clientId=&q=&from=&to=&forwarded=yes|no&sort=opened|time&dir=asc|desc&page=1&format=csv&units=1
// One row per visit. Completion = pages (or sheets) looked at for 5 seconds
// or more, over the pages the version has. units=1 adds the time on each page
// (or sheet) over every matching visit, per document.

const PAGE_SIZE = 50;
const CSV_MAX = 5000;

function viewWhere(q) {
  const where = {};
  if (q.get('docId')) where.docId = q.get('docId');
  if (q.get('linkId')) where.linkId = q.get('linkId');
  if (q.get('spaceId')) where.link = { spaceId: q.get('spaceId') };
  if (q.get('clientId')) where.visitor = { clientId: q.get('clientId') };
  const text = (q.get('q') || '').trim().toLowerCase();
  if (text) where.visitor = { ...(where.visitor || {}), email: { contains: text } }; // stored lower case
  if (q.get('forwarded') === 'yes') where.isForwarded = true;
  if (q.get('forwarded') === 'no') where.isForwarded = false;
  const from = q.get('from'), to = q.get('to');
  const gte = from ? new Date(from) : null;
  const lte = to ? new Date(`${to}T23:59:59.999Z`) : null;
  if (gte && !Number.isNaN(gte.getTime())) where.startedAt = { gte };
  if (lte && !Number.isNaN(lte.getTime())) where.startedAt = { ...(where.startedAt || {}), lte };
  return where;
}

/** sort=opened|time, dir=asc|desc; newest first when not given. */
function viewOrder(q) {
  const dir = q.get('dir') === 'asc' ? 'asc' : 'desc';
  return q.get('sort') === 'time' ? [{ durationMs: dir }, { startedAt: 'desc' }] : { startedAt: dir };
}

const ROW_SELECT = {
  id: true, startedAt: true, lastPingAt: true, durationMs: true, device: true, browser: true, isForwarded: true,
  visitor: {
    select: {
      id: true, email: true, name: true, matchType: true, domain: true,
      client: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true } },
    },
  },
  link: { select: { id: true, name: true, recipientEmail: true, spaceId: true } },
  doc: { select: { id: true, title: true, kind: true } },
  version: { select: { version: true, pageCount: true } },
};

async function seenCounts(viewIds) {
  if (!viewIds.length) return new Map();
  const g = await prisma.salesDocUnitStat.groupBy({
    by: ['viewId'], where: { viewId: { in: viewIds }, durationMs: { gte: UNIT_SEEN_MS } }, _count: { _all: true },
  });
  return new Map(g.map((r) => [r.viewId, r._count._all]));
}

const UNIT_ROWS_MAX = 50000;

/** Time on each page or sheet over all matching visits, one entry per document and page. */
async function unitTotals(where) {
  const stats = await prisma.salesDocUnitStat.findMany({
    where: { view: where },
    select: { unitIndex: true, label: true, durationMs: true, view: { select: { docId: true, doc: { select: { title: true } } } } },
    take: UNIT_ROWS_MAX,
  });
  const byKey = new Map();
  for (const s of stats) {
    const key = `${s.view.docId}:${s.unitIndex}`;
    const u = byKey.get(key) || { docId: s.view.docId, docTitle: s.view.doc?.title || '', unitIndex: s.unitIndex, label: s.label, durationMs: 0, seen: 0 };
    u.durationMs += s.durationMs;
    if (s.durationMs >= UNIT_SEEN_MS) u.seen += 1;
    if (s.label) u.label = s.label;
    byKey.set(key, u);
  }
  return [...byKey.values()].sort((a, b) => a.docTitle.localeCompare(b.docTitle) || a.docId.localeCompare(b.docId) || a.unitIndex - b.unitIndex);
}

const pct = (seen, total) => (total ? Math.min(1, (seen || 0) / total) : 0);

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const q = new URL(request.url).searchParams;
  const where = viewWhere(q);
  const now = Date.now();

  if (q.get('format') === 'csv') {
    const rows = await prisma.salesDocView.findMany({ where, select: ROW_SELECT, orderBy: viewOrder(q), take: CSV_MAX });
    const seen = await seenCounts(rows.map((r) => r.id));
    const head = ['Opened', 'Visitor', 'Company', 'Matched by', 'Document', 'Link', 'Time', 'Seconds', 'Completion %', 'Forwarded', 'Device', 'Browser'];
    const lines = rows.map((r) => [
      new Date(r.startedAt).toISOString(), r.visitor?.email || 'Anonymous', r.visitor?.client?.name || '', r.visitor?.matchType || '',
      r.doc?.title || '', r.link?.name || '', formatDuration(r.durationMs), Math.round(r.durationMs / 1000),
      Math.round(pct(seen.get(r.id), r.version?.pageCount) * 100), r.isForwarded ? 'Yes' : 'No', r.device || '', r.browser || '',
    ].map(csvCell).join(','));
    return new NextResponse([head.join(','), ...lines].join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sales-docs-engagement.csv"',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const page = Math.max(1, Number(q.get('page')) || 1);
  const [total, agg, visitors, forwarded, viewingNow, rows, units] = await Promise.all([
    prisma.salesDocView.count({ where }),
    prisma.salesDocView.aggregate({ where, _sum: { durationMs: true } }),
    prisma.salesDocView.groupBy({ by: ['visitorId'], where }),
    prisma.salesDocView.count({ where: { ...where, isForwarded: true } }),
    prisma.salesDocView.count({ where: { ...where, lastPingAt: { gte: new Date(now - VIEWING_NOW_MS) } } }),
    prisma.salesDocView.findMany({ where, select: ROW_SELECT, orderBy: viewOrder(q), skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    q.get('units') === '1' ? unitTotals(where) : null,
  ]);
  const seen = await seenCounts(rows.map((r) => r.id));

  return NextResponse.json({
    kpis: {
      views: total,
      visitors: visitors.length,
      timeMs: agg._sum.durationMs || 0,
      forwarded,
      viewingNow,
    },
    rows: rows.map((r) => ({
      ...r,
      viewingNow: now - new Date(r.lastPingAt).getTime() <= VIEWING_NOW_MS,
      completion: pct(seen.get(r.id), r.version?.pageCount),
    })),
    ...(units ? { units } : {}),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
}
