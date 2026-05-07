import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

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
  const { error } = await requireAuth();
  if (error) return error;
  const manufacturer = await prisma.manufacturer.findUnique({
    where: { id: params.id },
    include: { products: { orderBy: { partNumber: 'asc' } } },
  });
  if (!manufacturer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ manufacturer });
}

export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  if ('name' in body && !body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const data = parseBody(body);
  const manufacturer = await prisma.manufacturer.update({ where: { id: params.id }, data });
  return NextResponse.json({ manufacturer });
}

export async function DELETE(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  await prisma.manufacturer.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
