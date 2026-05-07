import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function getAuthorizedItem(projectId, itemId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id)
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const item = await prisma.peerReviewItem.findFirst({ where: { id: itemId, projectId } });
  if (!item) return { err: NextResponse.json({ error: 'Item not found' }, { status: 404 }) };
  return { item };
}

const FLOAT_FIELDS  = new Set(['qty', 'prevQty', 'propUnitDN', 'propUnitPrice', 'unitSavings', 'totalSavings']);
const STRING_FIELDS = new Set([
  'section', 'typeCode', 'description', 'location', 'notes', 'internalNotes',
  'specManufacturer', 'specModel', 'specDetails',
  'qtyType', 'altChoices',
  'propManufacturer', 'propManufacturerId', 'propModel', 'propProductId',
  'repName', 'repEmail', 'rfqStatus',
]);

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err, item } = await getAuthorizedItem(params.id, params.itemId, user);
  if (err) return err;

  const body = await request.json();
  const updates = {};

  for (const key of STRING_FIELDS) {
    if (key in body) updates[key] = body[key] ?? null;
  }
  for (const key of FLOAT_FIELDS) {
    if (key in body) updates[key] = body[key] != null ? Number(body[key]) : null;
  }
  if ('sortOrder' in body) updates.sortOrder = body.sortOrder;

  const updated = await prisma.peerReviewItem.update({ where: { id: item.id }, data: updates });
  return NextResponse.json({ item: updated });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err, item } = await getAuthorizedItem(params.id, params.itemId, user);
  if (err) return err;

  await prisma.peerReviewItem.delete({ where: { id: item.id } });
  return NextResponse.json({ ok: true });
}
