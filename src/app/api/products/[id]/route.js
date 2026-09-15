import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, isClientViewer } from '@/lib/auth';
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
  const { user, error } = await requireAuth();
  if (error) return error;
  // Products carry ILC's buy price (cost). Staff only.
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const product = await prisma.manufacturerProduct.findUnique({
    where: { id: params.id },
    include: { manufacturer: { select: { id: true, name: true, numericId: true } } },
  });
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PATCH(request, { params }) {
  // Manufacturers and products: Pre-con, Design, Construction and admins.
  const { error } = await requirePermission(request, 'editProducts');
  if (error) return error;
  const body = await request.json();
  if ('partNumber' in body && !body.partNumber?.trim())
    return NextResponse.json({ error: 'Part number required' }, { status: 400 });
  const data = parseBody(body);
  const product = await prisma.manufacturerProduct.update({
    where: { id: params.id },
    data,
    include: { manufacturer: { select: { id: true, name: true, numericId: true } } },
  });
  return NextResponse.json({ product });
}

// Products are archived, never deleted (Mike, 2026-09-11: "yes drawings and
// budgets and products should be archive only"). Migration 0076.
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Products') }, { status: 405 });
}

// POST /api/products/[id]  { archived: true | false } — archive or restore.
// Same people who can edit products: Pre-con, Design, Construction and admins.
export async function POST(request, { params }) {
  const { user, error } = await requirePermission(request, 'editProducts');
  if (error) return error;

  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const existing = await prisma.manufacturerProduct.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const product = await prisma.manufacturerProduct.update({
    where: { id: params.id },
    data:  archiveData(archived, user),
    include: { manufacturer: { select: { id: true, name: true, numericId: true } } },
  });
  return NextResponse.json({ product });
}
