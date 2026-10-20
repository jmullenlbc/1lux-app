import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildSwapRows, loadProductKeys, replaceJobRows } from '@/lib/specSwap/loadRows';

// Peer review matrices -> the "we suggest" learning set (SpecSwap, 0136).
// Mike 10-19: load from Admin instead of a script. The browser reads each
// workbook and posts one job per request (prod 30 s wall, 4.4 MB body cap).
// Same rows as scripts/loadSpecSwaps.mjs. CN only; DN never leaves the browser.

const MAX_LINES = 5000;

const live = { sourceKind: 'MATRIX_FILE', archivedAt: null };

// GET: what is loaded now, per job.
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const [byOutcome, byJob] = await Promise.all([
    prisma.specSwap.groupBy({ by: ['outcome'], where: live, _count: { _all: true } }),
    prisma.specSwap.groupBy({
      by: ['sourceName'],
      where: live,
      _count: { _all: true },
      _max: { createdAt: true, sheetDate: true },
    }),
  ]);
  const outcomes = Object.fromEntries(byOutcome.map((r) => [r.outcome, r._count._all]));
  const jobs = byJob
    .map((r) => ({ job: r.sourceName, rows: r._count._all, loadedAt: r._max.createdAt, fileDate: r._max.sheetDate }))
    .sort((a, b) => a.job.localeCompare(b.job));
  return NextResponse.json({
    jobs,
    outcomes,
    rows: jobs.reduce((s, j) => s + j.rows, 0),
    lastLoadedAt: jobs.reduce((m, j) => (j.loadedAt && (!m || j.loadedAt > m) ? j.loadedAt : m), null),
  });
}

// POST { job, sheetDate, lines }: replace that job's rows.
export async function POST(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { body = null; }
  const job = String(body?.job || '').trim().slice(0, 300);
  const lines = Array.isArray(body?.lines) ? body.lines : null;
  if (!job || !lines) return NextResponse.json({ error: 'job and lines are required' }, { status: 400 });
  if (lines.length > MAX_LINES) return NextResponse.json({ error: `More than ${MAX_LINES} lines in one matrix` }, { status: 400 });
  const d = body?.sheetDate ? new Date(body.sheetDate) : null;
  const sheetDate = d && !Number.isNaN(d.getTime()) ? d : null;

  const productByKey = await loadProductKeys(prisma);
  const { rows, totals } = buildSwapRows(lines, { job, sheetDate, productByKey });
  await replaceJobRows(prisma, job, rows);
  return NextResponse.json({ job, ...totals });
}
