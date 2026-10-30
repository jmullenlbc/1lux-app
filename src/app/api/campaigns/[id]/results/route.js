import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser } from '@/lib/salesDocs/access';
import { loadCampaign, notFound } from '@/lib/campaigns/staff';

// GET /api/campaigns/[id]/results  One row per person: sent, opened, clicked,
// and time spent in the documents the email linked to.
export async function GET(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const campaign = await loadCampaign(params.id);
  if (!campaign) return notFound('campaign', 'CAMPAIGN_NOT_FOUND');
  const sends = await prisma.campaignSend.findMany({
    where: { campaignId: campaign.id },
    orderBy: [{ firstClickAt: 'desc' }, { name: 'asc' }],
    select: {
      id: true, email: true, name: true, status: true, skipReason: true, error: true, sentAt: true,
      openedAt: true, openCount: true, firstClickAt: true, clickCount: true, unsubscribedAt: true,
      contact: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
    },
  });
  const links = sends.length ? await prisma.salesDocLink.findMany({ where: { campaignSendId: { in: sends.map((s) => s.id) } }, select: { id: true, campaignSendId: true } }) : [];
  const views = links.length ? await prisma.salesDocView.groupBy({
    by: ['linkId'], where: { linkId: { in: links.map((l) => l.id) } },
    _count: { _all: true }, _sum: { durationMs: true }, _max: { lastPingAt: true },
  }) : [];
  const viewByLink = new Map(views.map((v) => [v.linkId, v]));
  const reads = new Map();
  for (const l of links) {
    const v = viewByLink.get(l.id);
    if (!v) continue;
    const r = reads.get(l.campaignSendId) || { views: 0, durationMs: 0, lastAt: null };
    r.views += v._count._all;
    r.durationMs += v._sum.durationMs || 0;
    if (!r.lastAt || v._max.lastPingAt > r.lastAt) r.lastAt = v._max.lastPingAt;
    reads.set(l.campaignSendId, r);
  }
  const rows = sends.map((s) => ({ ...s, docReads: reads.get(s.id) || null }));
  const count = (f) => rows.filter(f).length;
  const totals = {
    people: rows.length,
    sent: count((r) => r.status === 'SENT'),
    queued: count((r) => r.status === 'QUEUED'),
    failed: count((r) => r.status === 'FAILED'),
    skipped: count((r) => r.status === 'SKIPPED'),
    opened: count((r) => r.openedAt),
    clicked: count((r) => r.firstClickAt),
    read: count((r) => r.docReads),
    unsubscribed: count((r) => r.unsubscribedAt),
  };
  return NextResponse.json({ campaign, totals, rows });
}
