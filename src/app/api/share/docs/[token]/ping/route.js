import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { loadLink, requirePass } from '@/lib/salesDocs/share';
import { clampDelta } from '@/lib/salesDocs/tracking';

export const runtime = 'nodejs';

// POST /api/share/docs/[token]/ping  { viewId, unitIndex, label, deltaMs }
// Time on one page (or sheet). Sent every 5 seconds while the visitor is
// active, and by sendBeacon (a text body) when the page changes or closes.
export async function POST(request, { params }) {
  const link = await loadLink(params.token);
  const pass = await requirePass(link);
  if (!pass) return new NextResponse(null, { status: 401 });
  let body = {};
  try { body = JSON.parse(await request.text()); } catch { return new NextResponse(null, { status: 400 }); }

  const unitIndex = Number(body.unitIndex);
  if (!body.viewId || !Number.isInteger(unitIndex) || unitIndex < 0 || unitIndex > 5000) return new NextResponse(null, { status: 400 });
  const view = await prisma.salesDocView.findUnique({ where: { id: String(body.viewId) }, select: { id: true, linkId: true, visitorId: true } });
  if (!view || view.linkId !== link.id || view.visitorId !== pass.visitorId) return new NextResponse(null, { status: 404 });

  const delta = clampDelta(body.deltaMs);
  const label = body.label ? String(body.label).slice(0, 120) : null;
  const now = new Date();
  await prisma.$transaction([
    prisma.salesDocUnitStat.upsert({
      where: { viewId_unitIndex: { viewId: view.id, unitIndex } },
      create: { viewId: view.id, unitIndex, label, durationMs: delta, visits: 1 },
      update: { durationMs: { increment: delta }, ...(body.entered ? { visits: { increment: 1 } } : {}) },
    }),
    prisma.salesDocView.update({ where: { id: view.id }, data: { durationMs: { increment: delta }, lastPingAt: now } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
