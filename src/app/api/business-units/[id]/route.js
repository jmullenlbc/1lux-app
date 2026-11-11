import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { changedFields, logHistory } from '@/lib/recordHistory';

const FIELDS = ['name', 'legalName', 'address', 'phone', 'ordersEmail', 'website'];

// PATCH a company (Admin > Companies, 2026-11-10): what its client documents print. Admins only.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'That request could not be read. Nothing was saved.' }, { status: 400 }); }
  const before = await prisma.businessUnit.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: 'That company is not in the app. Nothing was changed.' }, { status: 404 });
  const data = {};
  for (const f of FIELDS) {
    if (!(f in body)) continue;
    data[f] = String(body[f] ?? '').replace(/\s*,?\s*\r?\n\s*/g, ', ').replace(/^,\s*|,\s*$/g, '').trim().slice(0, 300) || null;
  }
  if ('name' in data && !data.name) return NextResponse.json({ error: 'A company needs a short name. Nothing was saved.' }, { status: 400 });
  const unit = await prisma.$transaction(async (tx) => {
    const u = await tx.businessUnit.update({ where: { id: params.id }, data });
    const changes = changedFields(before, data, FIELDS);
    if (Object.keys(changes).length) await logHistory({ entityType: 'BUSINESS_UNIT', entityId: params.id, action: 'UPDATE', user, changes, db: tx });
    return u;
  });
  return NextResponse.json({ unit });
}
