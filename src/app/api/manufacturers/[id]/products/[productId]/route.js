import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

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

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (user.role !== 'ILC_ADMIN' && user.role !== 'SUPER_ADMIN')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.manufacturerProduct.delete({ where: { id: params.productId } });
  return NextResponse.json({ ok: true });
}
