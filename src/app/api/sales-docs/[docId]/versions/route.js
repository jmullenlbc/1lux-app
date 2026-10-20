import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest, MIME } from '@/lib/salesDocs/access';
import { readFileFields, storeVersionFile } from '@/lib/salesDocs/upload';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/sales-docs/[docId]/versions  form: uploadKey+fileName (or file)
// A new version. Links keep showing the current one until this one is read,
// passes the pricing check, and is still the newest (promoteIfReady).
export async function POST(request, { params }) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;

  const doc = await prisma.salesDoc.findUnique({ where: { id: params.docId }, select: { id: true, kind: true, archivedAt: true } });
  if (!doc) return badRequest('Not found', 404);
  if (doc.archivedAt) return badRequest('This document is archived.');

  const form = await request.formData();
  const f = readFileFields(form);
  if (f.error) return badRequest(f.error);
  if (f.kind !== doc.kind) return badRequest(`This document is a ${doc.kind === 'PDF' ? 'PDF' : 'workbook'}; replace it with the same kind of file.`);

  const last = await prisma.salesDocVersion.aggregate({ where: { docId: doc.id }, _max: { version: true } });
  let version = await prisma.salesDocVersion.create({
    data: { docId: doc.id, version: (last._max.version || 0) + 1, fileName: f.fileName, mimeType: MIME[f.kind], sizeBytes: 0, storageKey: '', uploadedById: user.id },
  });
  try {
    const stored = await storeVersionFile({ docId: doc.id, versionId: version.id, kind: f.kind, uploadKey: f.uploadKey, file: f.file });
    version = await prisma.salesDocVersion.update({ where: { id: version.id }, data: stored });
  } catch (err) {
    console.error('[salesDocs] replace failed', err?.message || err);
    await prisma.salesDocVersion.delete({ where: { id: version.id } }).catch(() => {});
    return badRequest('The file could not be saved. Please try again.', 500);
  }
  await prisma.salesDoc.update({ where: { id: doc.id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ version }, { status: 201 });
}
