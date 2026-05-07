import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const PRODUCT_FIELDS = ['partNumber','description','finish','cct','wattage','dimming','voltage','mounting','fixtureType','cost','salePrice','notes'];

function parseProductBody(body) {
  const data = {};
  for (const f of PRODUCT_FIELDS) {
    if (!(f in body)) continue;
    if (f === 'wattage' || f === 'cost' || f === 'salePrice') {
      const n = body[f] === '' || body[f] == null ? null : parseFloat(body[f]);
      data[f] = isNaN(n) ? null : n;
    } else {
      data[f] = body[f] === '' ? null : (body[f] ?? null);
      if (typeof data[f] === 'string') data[f] = data[f].trim() || null;
    }
  }
  return data;
}

async function nextProductNumericId() {
  const agg = await prisma.manufacturerProduct.aggregate({ _max: { numericId: true } });
  return (agg._max.numericId ?? 0) + 1;
}

export async function GET(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const products = await prisma.manufacturerProduct.findMany({
    where: { manufacturerId: params.id },
    orderBy: { partNumber: 'asc' },
  });
  return NextResponse.json({ products });
}

export async function POST(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  if (!body.partNumber?.trim()) return NextResponse.json({ error: 'Part number required' }, { status: 400 });
  const mfr = await prisma.manufacturer.findUnique({ where: { id: params.id } });
  if (!mfr) return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 });

  // Check for duplicate within this manufacturer
  const existing = await prisma.manufacturerProduct.findUnique({
    where: { manufacturerId_partNumber: { manufacturerId: params.id, partNumber: body.partNumber.trim() } },
  });
  if (existing) return NextResponse.json({ product: existing, alreadyExists: true });

  const data = parseProductBody(body);
  data.manufacturerId = params.id;
  data.numericId = await nextProductNumericId();
  const product = await prisma.manufacturerProduct.create({ data });
  return NextResponse.json({ product }, { status: 201 });
}
