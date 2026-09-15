import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { INCLUDE_ARCHIVED } from '@/lib/archive';

const MFR_FIELDS = [
  'name','acctLastUpdated','setupToSell','terms','credit','notes',
  'accountingEmail','ffa','paymentInfo','website','mainPhone',
  'address','address2','city','state','zip',
];

function parseBody(body) {
  const data = {};
  for (const f of MFR_FIELDS) {
    if (!(f in body)) continue;
    if (f === 'setupToSell') { data[f] = Boolean(body[f]); continue; }
    if (f === 'credit' || f === 'ffa') {
      const n = body[f] === '' || body[f] == null ? null : parseFloat(body[f]);
      data[f] = isNaN(n) ? null : n;
      continue;
    }
    data[f] = body[f] === '' ? null : (body[f] ?? null);
    if (typeof data[f] === 'string') data[f] = data[f].trim() || null;
  }
  return data;
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  // Products carry ILC's buy price (cost). Staff only.
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const manufacturer = await prisma.manufacturer.findUnique({
    where: { id: params.id },
    include: { products: { where: { archivedAt: null }, orderBy: { partNumber: 'asc' } } },
  });
  if (!manufacturer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ manufacturer });
}

export async function PATCH(request, { params }) {
  // Manufacturers and products: Pre-con, Design, Construction and admins.
  const { error } = await requirePermission(request, 'editProducts');
  if (error) return error;
  const body = await request.json();
  if ('name' in body && !body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const data = parseBody(body);
  const manufacturer = await prisma.manufacturer.update({ where: { id: params.id }, data });
  return NextResponse.json({ manufacturer });
}

export async function DELETE(request, { params }) {
  const { error } = await requirePermission(request, 'editProducts');
  if (error) return error;
  // Deleting a manufacturer took every one of its products with it, and
  // products are archive-only (Mike, 2026-09-11). So a manufacturer can only
  // be deleted while it has no products at all. Archived ones count: they are
  // still kept.
  const productCount = await prisma.manufacturerProduct.count({ where: { manufacturerId: params.id, ...INCLUDE_ARCHIVED } });
  if (productCount > 0) {
    return NextResponse.json({
      error: `This manufacturer has ${productCount} product${productCount === 1 ? '' : 's'} on file. Products are archived, never deleted, so the manufacturer stays too.`,
    }, { status: 409 });
  }
  await prisma.manufacturer.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
