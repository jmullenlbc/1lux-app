import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, requireStaff, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { INCLUDE_ARCHIVED } from '@/lib/archive';
import { looseNumberOrNull } from '@/lib/numberInput';
import { changedFields, logHistory } from '@/lib/recordHistory';
import { badEmails, replaceEmails } from '@/lib/salesReps/emails';

const MFR_FIELDS = [
  'name','acctLastUpdated','setupToSell','terms','credit','notes',
  'accountingEmail','ffa','paymentInfo','website','mainPhone',
  'address','address2','city','state','zip','buyDirect',
];
// Buy direct and the Quotes/Orders emails: any staff login (Mike 10-29, anyone can edit).
const STAFF_FIELDS = ['buyDirect', 'emails'];

function parseBody(body) {
  const data = {};
  for (const f of MFR_FIELDS) {
    if (!(f in body)) continue;
    if (f === 'setupToSell' || f === 'buyDirect') { data[f] = Boolean(body[f]); continue; }
    if (f === 'credit' || f === 'ffa') {
      const n = looseNumberOrNull(body[f]); // "1,250.00" reads as 1250
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
    include: {
      products: { where: { archivedAt: null }, orderBy: { partNumber: 'asc' } },
      emails: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!manufacturer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ manufacturer });
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  // Manufacturers and products: Pre-con, Design, Construction and admins.
  const staffOnly = Object.keys(body).every((k) => STAFF_FIELDS.includes(k));
  const { user, error } = staffOnly ? await requireStaff(request) : await requirePermission(request, 'editProducts');
  if (error) return error;
  if ('name' in body && !body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const bad = badEmails(body.emails);
  if (bad.length) {
    return NextResponse.json({ error: `These do not look like email addresses: ${bad.join(', ')}. Nothing was saved. Fix them and save again. (MFR_BAD_EMAIL)` }, { status: 400 });
  }
  const data = parseBody(body);
  const before = await prisma.manufacturer.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const manufacturer = await prisma.$transaction(async (tx) => {
    const m = await tx.manufacturer.update({ where: { id: params.id }, data });
    const changes = { ...changedFields(before, data, MFR_FIELDS), ...(await replaceEmails(tx, { manufacturerId: params.id }, body.emails)) };
    if (Object.keys(changes).length) await logHistory({ entityType: 'MANUFACTURER', entityId: params.id, action: 'UPDATE', user, changes, db: tx });
    return m;
  });
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
