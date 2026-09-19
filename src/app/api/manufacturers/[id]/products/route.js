import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { looseNumberOrNull } from '@/lib/numberInput';

const PRODUCT_FIELDS = ['partNumber','description','finish','cct','wattage','dimming','voltage','mounting','fixtureType','cost','salePrice','notes'];

function parseProductBody(body) {
  const data = {};
  for (const f of PRODUCT_FIELDS) {
    if (!(f in body)) continue;
    if (f === 'wattage' || f === 'cost' || f === 'salePrice') {
      const n = looseNumberOrNull(body[f]); // "1,250.00" reads as 1250
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
  const { user, error } = await requireAuth();
  if (error) return error;
  // Products carry ILC's buy price (cost). Staff only.
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const products = await prisma.manufacturerProduct.findMany({
    where: { manufacturerId: params.id },
    orderBy: { partNumber: 'asc' },
  });
  return NextResponse.json({ products });
}

export async function POST(request, { params }) {
  // Manufacturers and products: Pre-con, Design, Construction and admins.
  const { error } = await requirePermission(request, 'editProducts');
  if (error) return error;
  const body = await request.json();
  if (!body.partNumber?.trim()) return NextResponse.json({ error: 'Part number required' }, { status: 400 });
  const mfr = await prisma.manufacturer.findUnique({ where: { id: params.id } });
  if (!mfr) return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 });

  // Check for duplicate within this manufacturer
  const existing = await prisma.manufacturerProduct.findUnique({
    where: { manufacturerId_partNumber: { manufacturerId: params.id, partNumber: body.partNumber.trim() } },
  });
  if (existing?.archivedAt) {
    return NextResponse.json({
      error: `${existing.partNumber} is already on file but archived. Restore it from the Archive page instead of adding it again.`,
      archivedProductId: existing.id,
    }, { status: 409 });
  }
  if (existing) return NextResponse.json({ product: existing, alreadyExists: true });

  const data = parseProductBody(body);
  data.manufacturerId = params.id;
  data.numericId = await nextProductNumericId();
  const product = await prisma.manufacturerProduct.create({ data });
  return NextResponse.json({ product }, { status: 201 });
}
