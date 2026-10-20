import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest, titleFromName, MIME } from '@/lib/salesDocs/access';
import { readFileFields, storeVersionFile } from '@/lib/salesDocs/upload';

// Sales Docs (0137): the document library. Upload stores the file and returns
// version 1 PENDING; the browser then calls versions/[id]/process.

export const runtime = 'nodejs';
export const maxDuration = 60;

const VERSION_ROW = {
  id: true, version: true, fileName: true, sizeBytes: true, pageCount: true,
  scanStatus: true, processStatus: true, processError: true, createdAt: true,
};

// GET /api/sales-docs?q=&kind=&folderId=&scan=&ownerId=&archived=yes
export async function GET(request) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;

  const q = new URL(request.url).searchParams;
  const where = { archivedAt: q.get('archived') === 'yes' ? { not: null } : null };
  if (q.get('kind')) where.kind = q.get('kind');
  if (q.get('folderId')) where.folderId = q.get('folderId') === 'none' ? null : q.get('folderId');
  if (q.get('ownerId')) where.ownerId = q.get('ownerId');

  const docs = await prisma.salesDoc.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 500,
    select: {
      id: true, title: true, kind: true, createdAt: true, updatedAt: true, archivedAt: true,
      folder: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      currentVersion: { select: VERSION_ROW },
      versions: { orderBy: { version: 'desc' }, take: 1, select: VERSION_ROW },
      _count: { select: { links: { where: { revokedAt: null } }, views: true } },
    },
  });

  const ids = docs.map((d) => d.id);
  const lastViews = ids.length ? await prisma.salesDocView.groupBy({
    by: ['docId'], where: { docId: { in: ids } }, _max: { lastPingAt: true },
  }) : [];
  const lastAt = new Map(lastViews.map((r) => [r.docId, r._max.lastPingAt]));

  let rows = docs.map(({ versions, _count, ...d }) => ({
    ...d,
    latestVersion: versions[0] || null,
    liveLinks: _count.links,
    views: _count.views,
    lastViewedAt: lastAt.get(d.id) || null,
  }));
  const scan = q.get('scan');
  if (scan) rows = rows.filter((d) => d.latestVersion?.scanStatus === scan);
  // Title search in JS: case-insensitive on both SQLite and Postgres.
  const text = (q.get('q') || '').trim().toLowerCase();
  if (text) rows = rows.filter((d) => d.title.toLowerCase().includes(text) || d.currentVersion?.fileName?.toLowerCase().includes(text));
  return NextResponse.json({ docs: rows });
}

// POST /api/sales-docs  form: uploadKey+fileName (or file), title?, folderId?
export async function POST(request) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;

  const form = await request.formData();
  const f = readFileFields(form);
  if (f.error) return badRequest(f.error);
  const title = String(form.get('title') || '').trim().slice(0, 200) || titleFromName(f.fileName);
  const folderId = form.get('folderId') ? String(form.get('folderId')) : null;

  const doc = await prisma.salesDoc.create({ data: { title, kind: f.kind, folderId, ownerId: user.id } });
  let version;
  try {
    version = await prisma.salesDocVersion.create({
      data: { docId: doc.id, version: 1, fileName: f.fileName, mimeType: MIME[f.kind], sizeBytes: 0, storageKey: '', uploadedById: user.id },
    });
    const stored = await storeVersionFile({ docId: doc.id, versionId: version.id, kind: f.kind, uploadKey: f.uploadKey, file: f.file });
    version = await prisma.salesDocVersion.update({ where: { id: version.id }, data: stored });
    await prisma.salesDoc.update({ where: { id: doc.id }, data: { currentVersionId: version.id } });
  } catch (err) {
    // Nothing points at a doc whose file never landed; take it back out.
    console.error('[salesDocs] upload failed', err?.message || err);
    await prisma.salesDoc.delete({ where: { id: doc.id } }).catch(() => {});
    return badRequest(err?.message?.includes('50 MB') ? err.message : 'The file could not be saved. Please try again.', 500);
  }
  return NextResponse.json({ doc: { ...doc, currentVersionId: version.id }, version }, { status: 201 });
}
