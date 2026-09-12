import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { archiveData, readArchivedFlag, deleteRefused, ARCHIVED_FLAG_HELP } from '@/lib/archive';

const FLOAT_FIELDS  = ['cost', 'salePrice', 'wattage'];
const STRING_FIELDS = ['partNumber', 'description', 'finish', 'cct', 'dimming', 'voltage', 'mounting', 'fixtureType', 'notes'];

function parseBody(body) {
  const data = {};
  for (const f of STRING_FIELDS) {
    if (!(f in body)) continue;
    data[f] = body[f] === '' || body[f] == null ? null : String(body[f]).trim() || null;
  }
  for (const f of FLOAT_FIELDS) {
    if (!(f in body)) continue;
    const n = body[f] === '' || body[f] == null ? null : parseFloat(body[f]);
    data[f] = n == null || isNaN(n) ? null : n;
  }
  return data;
}

export async function GET(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const product = await prisma.manufacturerProduct.findUnique({
    where: { id: params.productId },
    include: { manufacturer: { select: { id: true, name: true, numericId: true } } },
  });
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  if ('partNumber' in body && !body.partNumber?.trim())
    return NextResponse.json({ error: 'Part number required' }, { status: 400 });
  const data = parseBody(body);
  const product = await prisma.manufacturerProduct.update({
    where: { id: params.productId },
    data,
    include: { manufacturer: { select: { id: true, name: true, numericId: true } } },
  });
  return NextResponse.json({ product });
}

// Products are archived, never deleted (Mike, 2026-09-11). Migration 0076.
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Products') }, { status: 405 });
}

// POST /api/manufacturers/[id]/products/[productId]  { archived: true | false }
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (user.role !== 'ILC_ADMIN' && user.role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const existing = await prisma.manufacturerProduct.findUnique({ where: { id: params.productId }, select: { manufacturerId: true } });
  if (!existing || existing.manufacturerId !== params.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const product = await prisma.manufacturerProduct.update({
    where: { id: params.productId },
    data:  archiveData(archived, user),
    include: { manufacturer: { select: { id: true, name: true, numericId: true } } },
  });
  return NextResponse.json({ product });
}
