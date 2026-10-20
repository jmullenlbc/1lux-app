import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { isSalesAdmin } from '@/lib/auth';

// GET /api/sales-docs/[docId]: the doc, every version with its pricing check,
// the links that show it (alone or in a Space) and the Spaces it sits in.
export async function GET(request, { params }) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;

  const doc = await prisma.salesDoc.findUnique({
    where: { id: params.docId },
    include: {
      folder: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      versions: {
        orderBy: { version: 'desc' },
        include: {
          uploadedBy: { select: { id: true, name: true } },
          scanOverrideBy: { select: { id: true, name: true } },
          scanHits: { orderBy: { id: 'asc' } },
          sheets: { orderBy: { index: 'asc' } },
        },
      },
      spaceItems: { select: { section: true, space: { select: { id: true, name: true, archivedAt: true } } } },
    },
  });
  if (!doc) return badRequest('Not found', 404);

  const spaceIds = doc.spaceItems.map((i) => i.space.id);
  const now = new Date();
  const liveWhere = { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const [docLinks, spaceLinkCount] = await Promise.all([
    prisma.salesDocLink.findMany({
      where: { docId: doc.id },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } },
    }),
    spaceIds.length ? prisma.salesDocLink.count({ where: { spaceId: { in: spaceIds }, ...liveWhere } }) : 0,
  ]);
  const stats = docLinks.length ? await prisma.salesDocView.groupBy({
    by: ['linkId'], where: { linkId: { in: docLinks.map((l) => l.id) } },
    _count: { _all: true }, _sum: { durationMs: true }, _max: { lastPingAt: true },
  }) : [];
  const byLink = new Map(stats.map((s) => [s.linkId, s]));
  const links = docLinks.map(({ passwordHash, ...l }) => ({
    ...l,
    hasPassword: !!passwordHash,
    views: byLink.get(l.id)?._count._all || 0,
    timeMs: byLink.get(l.id)?._sum.durationMs || 0,
    lastViewedAt: byLink.get(l.id)?._max.lastPingAt || null,
  }));
  const liveLinks = links.filter((l) => !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt) > now)).length;

  return NextResponse.json({
    doc,
    links,
    liveLinks,
    spaceLiveLinks: spaceLinkCount,
    canOverride: isSalesAdmin(user),
  });
}

// PATCH /api/sales-docs/[docId]  { title?, folderId?, archived? }
export async function PATCH(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const data = {};
  if (typeof body.title === 'string') {
    const t = body.title.trim().slice(0, 200);
    if (!t) return badRequest('A title is required.');
    data.title = t;
  }
  if ('folderId' in body) data.folderId = body.folderId || null;
  if ('archived' in body) data.archivedAt = body.archived ? new Date() : null;
  if (!Object.keys(data).length) return badRequest('Nothing to change.');
  const doc = await prisma.salesDoc.update({ where: { id: params.docId }, data }).catch(() => null);
  if (!doc) return badRequest('Not found', 404);
  return NextResponse.json({ doc });
}
