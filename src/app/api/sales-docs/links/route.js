import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { newToken } from '@/lib/salesDocs/share';
import { shareAllowed } from '@/lib/salesDocs/pricingScan';
import { linkOptions, linkStatus } from '@/lib/salesDocs/linkOptions';

const LINK_INCLUDE = {
  doc: { select: { id: true, title: true, kind: true } },
  space: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
};

// GET /api/sales-docs/links?docId=&spaceId=&status=LIVE|REVOKED|EXPIRED&createdById=&clientId=
export async function GET(request) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const q = new URL(request.url).searchParams;
  const where = {};
  for (const k of ['docId', 'spaceId', 'createdById', 'clientId']) if (q.get(k)) where[k] = q.get(k);

  const found = await prisma.salesDocLink.findMany({ where, include: LINK_INCLUDE, orderBy: { createdAt: 'desc' }, take: 1000 });
  const stats = found.length ? await prisma.salesDocView.groupBy({
    by: ['linkId'], where: { linkId: { in: found.map((l) => l.id) } },
    _count: { _all: true }, _sum: { durationMs: true }, _max: { lastPingAt: true },
  }) : [];
  const byLink = new Map(stats.map((s) => [s.linkId, s]));
  const now = new Date();
  let links = found.map(({ passwordHash, ...l }) => ({
    ...l,
    hasPassword: !!passwordHash,
    status: linkStatus(l, now),
    views: byLink.get(l.id)?._count._all || 0,
    timeMs: byLink.get(l.id)?._sum.durationMs || 0,
    lastViewedAt: byLink.get(l.id)?._max.lastPingAt || null,
  }));
  if (q.get('status')) links = links.filter((l) => l.status === q.get('status'));
  return NextResponse.json({ links });
}

// POST /api/sales-docs/links  { docId | spaceId, name, recipientEmail?, clientId?,
//   requireEmail, password?, expiresAt?, allowDownload, notifyOnFirstOpen }
export async function POST(request) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  if (!!body.docId === !!body.spaceId) return badRequest('A link shows one document or one Space.');

  if (body.docId) {
    const doc = await prisma.salesDoc.findUnique({
      where: { id: body.docId },
      select: { archivedAt: true, currentVersion: { select: { processStatus: true, scanStatus: true } } },
    });
    if (!doc) return badRequest('Not found', 404);
    if (doc.archivedAt) return badRequest('This document is archived.');
    const v = doc.currentVersion;
    if (!v || v.processStatus !== 'READY') return badRequest('This document is still being checked. Try again in a moment.', 409);
    if (!shareAllowed(v.scanStatus)) return badRequest('Cost columns were found in this file, so it cannot be shared until an admin clears it.', 409);
  } else {
    const space = await prisma.salesDocSpace.findUnique({
      where: { id: body.spaceId },
      select: { archivedAt: true, items: { select: { doc: { select: { title: true, archivedAt: true, currentVersion: { select: { scanStatus: true } } } } } } },
    });
    if (!space) return badRequest('Not found', 404);
    if (space.archivedAt) return badRequest('This Space is archived.');
    const docs = space.items.map((i) => i.doc).filter((d) => !d.archivedAt);
    if (!docs.length) return badRequest('Add a document to this Space first.');
    const blocked = docs.filter((d) => d.currentVersion?.scanStatus === 'BLOCKED');
    if (blocked.length) return badRequest(`Cost columns were found in ${blocked.map((d) => d.title).join(', ')}. Clear or remove it before sharing this Space.`, 409);
  }

  const opts = await linkOptions(body, { creating: true });
  if (opts.error) return badRequest(opts.error);
  const link = await prisma.salesDocLink.create({
    data: {
      ...opts.data,
      token: newToken(),
      docId: body.docId || null,
      spaceId: body.spaceId || null,
      createdById: user.id,
    },
    include: LINK_INCLUDE,
  });
  const { passwordHash, ...safe } = link;
  return NextResponse.json({ link: { ...safe, hasPassword: !!passwordHash, status: 'LIVE' } }, { status: 201 });
}
